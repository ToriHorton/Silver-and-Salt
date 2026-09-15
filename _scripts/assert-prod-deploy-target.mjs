#!/usr/bin/env node
// Fail-closed pre-flight for the PRODUCTION deploy (the top-level wrangler
// config). Runs in CI before `wrangler deploy` and refuses unless:
//
//   1. wrangler is signed in to exactly one Cloudflare account, and it is the
//      account that serves silverandsaltcapital.com;
//   2. the production Worker already holds its ODLA_API_KEY secret (names
//      only are read, never values), so a deploy can never point the domain
//      at a Worker with no tenant;
//   3. wrangler.jsonc still describes the production identity: prod tenant,
//      env prod, runtime live, sales closed by default, and every named
//      environment keeps an explicit empty routes list.
//
// The dev twin is _scripts/assert-dev-deploy-target.mjs. Both are pure
// functions over the tool output so tests can exercise every refusal.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

export const PROD_ACCOUNT_ID = "aa3582f8a26ec8a9c824506e540a1286";
export const PROD_SCRIPT_NAME = "silver-and-salt-capital";
export const REQUIRED_SECRETS = ["ODLA_API_KEY"];

function fail(message) {
  throw new Error(`refusing to deploy production: ${message}`);
}

export function assertProdDeployAccount(rawIdentity) {
  let identity;
  try {
    identity = JSON.parse(rawIdentity);
  } catch {
    fail("wrangler whoami did not return JSON");
  }
  if (!identity?.loggedIn) fail("wrangler is not signed in");
  const accounts = Array.isArray(identity.accounts) ? identity.accounts : [];
  if (accounts.length !== 1) fail(`the token sees ${accounts.length} accounts; exactly one is required`);
  const id = accounts[0]?.id;
  if (id !== PROD_ACCOUNT_ID) fail("the signed-in account does not serve silverandsaltcapital.com");
  return { account: id };
}

export function assertProdDeployBindings(rawSecrets) {
  let secrets;
  try {
    secrets = JSON.parse(rawSecrets);
  } catch {
    fail("wrangler secret list did not return JSON");
  }
  if (!Array.isArray(secrets)) fail("wrangler secret list did not return a list");
  const names = new Set(secrets.map((s) => s?.name).filter((n) => typeof n === "string"));
  const missing = REQUIRED_SECRETS.filter((n) => !names.has(n));
  if (missing.length) fail(`production Worker is missing secret(s): ${missing.join(", ")}`);
  return { names: [...names].sort() };
}

// wrangler.jsonc is JSONC. Only whole-line "//" comments are used in this
// file (string values such as "/api/*" and "*/5 * * * *" would defeat a
// block-comment stripper), so that is all this removes before parsing.
function parseJsonc(text) {
  const stripped = text
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n")
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(stripped);
}

export function assertProdWranglerConfig(text) {
  const cfg = parseJsonc(text);
  if (cfg.name !== PROD_SCRIPT_NAME) fail(`top-level name is ${cfg.name}, expected ${PROD_SCRIPT_NAME}`);
  if (cfg.main !== "src/worker-chapter.ts") fail("top-level main is not the Chapter entry");
  const v = cfg.vars ?? {};
  const expected = {
    ODLA_TENANT: "silver-and-salt-capital",
    ODLA_ENV: "prod",
    ODLA_RUNTIME: "live",
    ODLA_APP_ID: "silver-and-salt-capital",
    ODLA_ENDPOINT: "https://db.odla.ai",
  };
  for (const [k, val] of Object.entries(expected)) {
    if (v[k] !== val) fail(`top-level vars.${k} is ${String(v[k])}, expected ${val}`);
  }
  if (v.SALES_STATE !== "disabled") fail("top-level vars.SALES_STATE must be \"disabled\"; opening sales is an operator action, not a deploy");
  if (Array.isArray(cfg.routes) && cfg.routes.length) fail("top-level routes must stay empty; the domain is attached in the dashboard");
  const first = cfg.assets?.run_worker_first ?? [];
  if (!first.includes("/api/*")) fail("assets.run_worker_first must include /api/*");
  for (const [name, env] of Object.entries(cfg.env ?? {})) {
    if (!Array.isArray(env.routes) || env.routes.length) fail(`env.${name}.routes must be an explicit empty list`);
    if (name === "staging" && env.triggers?.crons?.length) fail("env.staging must not declare cron triggers");
  }
  return { name: cfg.name };
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  if (res.status !== 0) fail(`${cmd} ${args.join(" ")} exited ${res.status}: ${res.stderr?.trim()}`);
  return res.stdout;
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  assertProdWranglerConfig(readFileSync(join(root, "wrangler.jsonc"), "utf8"));
  const { account } = assertProdDeployAccount(run("npx", ["wrangler", "whoami", "--json"]));
  const { names } = assertProdDeployBindings(run("npx", ["wrangler", "secret", "list", "--format", "json"]));
  console.log(`production deploy target ok: account ${account}, worker ${PROD_SCRIPT_NAME}, secrets ${names.join(",")}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
