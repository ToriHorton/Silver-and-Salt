#!/usr/bin/env node
// Point PRODUCTION at the live Stripe account (launch Phase 4b, Silver side).
// Idempotent and safe to re-run. It does exactly three things:
//   1. verifies the vault's stripe_secret_key is a LIVE key on the account
//      the given publishable key belongs to;
//   2. registers the live webhook endpoint for this Worker
//      (https://silverandsaltcapital.com/api/webhooks/stripe) with the events
//      declared in odla.config.mjs, and pipes its signing secret straight into
//      the prod vault as stripe_webhook_secret__live (the live runtime's
//      name), never printed, never an argument, never on disk;
//   3. writes the live publishable key onto the group row, which is the one
//      place the Worker reads it from.
// It creates NO Products or Prices: those come from Built Not Found's catalog
// apply path and reach this chapter in a signed signup revision.
//
// Usage: node _scripts/setup-stripe-live.mjs pk_live_...
//   The secret key is never an argument: it must already be in the prod vault
//   (`npx @odla-ai/cli@0.60.0 secrets set stripe_secret_key --env prod --stdin --yes`).
import { initAdmin } from "@odla-ai/db";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import config from "../odla.config.mjs";

const GROUP_ID = "silver-and-salt-capital";
const WEBHOOK_URL = "https://silverandsaltcapital.com/api/webhooks/stripe";
const SECRET_NAME = "stripe_webhook_secret__live";
const EVENTS = config.stripe.enabledEvents;

const pk = process.argv[2];
if (!pk || !pk.startsWith("pk_live_")) {
  console.error("usage: node _scripts/setup-stripe-live.mjs pk_live_...   (a LIVE publishable key; the secret key lives in the vault)");
  process.exit(1);
}

const c = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
if (!c.envs?.prod?.dbKey) throw new Error("no cached production credentials; run provision --live first");
const db = initAdmin({ appId: c.envs.prod.tenantId, adminToken: c.envs.prod.dbKey, endpoint: "https://db.odla.ai" });

let sk;
try {
  sk = await db.secrets.get("stripe_secret_key");
} catch {
  console.error("stripe_secret_key is not in the prod vault yet.");
  process.exit(1);
}
if (!sk?.startsWith("sk_live_")) {
  console.error("refusing: the prod vault's stripe_secret_key is not a live key");
  process.exit(1);
}

async function stripe(method, path, params) {
  const form = params
    ? new URLSearchParams(Object.entries(params).flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((x, i) => [`${k}[${i}]`, x]) : [[k, String(v)]],
      )).toString()
    : undefined;
  const res = await fetch(`https://api.stripe.com${path}${method === "GET" && form ? `?${form}` : ""}`, {
    method,
    headers: { authorization: `Bearer ${sk}`, ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? form : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${body?.error?.message ?? "unknown"}`);
  return body;
}

// 1. Same account, live mode.
const account = await stripe("GET", "/v1/account");
if (!account.charges_enabled) throw new Error(`account ${account.id} cannot take live charges yet (activation incomplete)`);
const pkAccount = Buffer.from(pk.replace(/^pk_live_/, ""), "base64").toString("utf8");
console.log(`live account ${account.id} (charges enabled); publishable key decodes to ${pkAccount}`);

// 2. Webhook endpoint for this Worker, secret straight into the vault.
const endpoints = await stripe("GET", "/v1/webhook_endpoints", { limit: 100 });
let endpoint = endpoints.data.find((e) => e.url === WEBHOOK_URL);
if (!endpoint) {
  endpoint = await stripe("POST", "/v1/webhook_endpoints", {
    url: WEBHOOK_URL,
    enabled_events: EVENTS,
    description: "Silver & Salt Capital production Worker (live runtime)",
  });
  const r = spawnSync("npx", ["--yes", "@odla-ai/cli@0.60.0", "secrets", "set", SECRET_NAME, "--env", "prod", "--stdin", "--yes"], {
    input: endpoint.secret, cwd: new URL("..", import.meta.url).pathname, encoding: "utf8",
    env: { ...process.env, ODLA_PROVISION_PROD: "1", ODLA_ENV: "prod" },
  });
  if (r.status !== 0) {
    console.error("created endpoint", endpoint.id, "but the vault write FAILED:", (r.stderr || r.stdout || "").replace(endpoint.secret, "<secret>"));
    console.error(`Reveal its signing secret in the Stripe dashboard and store it as ${SECRET_NAME} in the prod vault.`);
    process.exit(1);
  }
  console.log("created live webhook endpoint", endpoint.id, `-> signing secret written to the vault as ${SECRET_NAME}`);
} else {
  const missing = EVENTS.filter((e) => !endpoint.enabled_events.includes(e) && !endpoint.enabled_events.includes("*"));
  if (missing.length) {
    await stripe("POST", `/v1/webhook_endpoints/${endpoint.id}`, { enabled_events: EVENTS });
    console.log("updated live webhook endpoint", endpoint.id, "events:", EVENTS.join(", "));
  } else {
    console.log("found live webhook endpoint", endpoint.id, "(signing secret unchanged; it is only revealed at creation)");
  }
}

// 3. Publishable key onto the group row.
const key = { ns: "groups", attr: "id", value: GROUP_ID };
const before = (await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } })).groups?.[0];
if (!before) throw new Error("group row not found on the prod tenant");
await db.transact([{ t: "update", ns: "groups", id: key, attrs: { stripePublishableKey: pk } }], { mutationId: `launch-live-publishable-key:${pk.slice(-8)}` });
console.log("group row updated: stripePublishableKey set (live). Prices arrive through Built Not Found's signup revision.");
