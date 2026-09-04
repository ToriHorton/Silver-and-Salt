// Fail closed before a dev deploy unless Wrangler's one selected account owns
// exactly one ODLA-managed Silver & Salt runtime for this Worker. Cory and Tori
// use the same config and Worker name in different Cloudflare accounts; the
// runtime declaration connects each account to its owner-bound provider state.
// Secret values are never read: `wrangler secret list` returns binding names
// and types only.

import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const REQUIRED_BINDINGS = ["ODLA_API_KEY", "ODLA_RUNTIME"];
const DEV_SCRIPT_NAME = "silver-and-salt-capital-dev";

export function assertDevDeployAccount(rawIdentity, rawEnvironments) {
  let identity;
  try {
    identity = JSON.parse(rawIdentity);
  } catch {
    throw new Error("Wrangler did not return a JSON identity; refusing to deploy.");
  }

  const accountIds = Array.isArray(identity?.accounts)
    ? identity.accounts.map((account) => account?.id).filter(Boolean)
    : [];
  if (!identity?.loggedIn || accountIds.length !== 1) {
    throw new Error(
      "Wrangler is not scoped exclusively to one Cloudflare account; refusing to deploy.",
    );
  }

  let inventory;
  try {
    inventory = JSON.parse(rawEnvironments);
  } catch {
    throw new Error("ODLA did not return a JSON runtime inventory; refusing to deploy.");
  }
  const matches = Array.isArray(inventory?.environments)
    ? inventory.environments.filter(
        (entry) =>
          entry?.dataEnvironment === "dev" &&
          entry?.desired?.active === true &&
          entry?.desired?.worker?.provider === "cloudflare" &&
          entry?.desired?.worker?.accountId === accountIds[0] &&
          entry?.desired?.worker?.scriptName === DEV_SCRIPT_NAME &&
          typeof entry?.runtime === "string" &&
          entry.runtime.length > 0,
      )
    : [];
  if (matches.length !== 1) {
    throw new Error(
      "The selected Cloudflare account does not match exactly one active ODLA dev runtime; " +
        "run `odla-ai environment reconcile --runtime <name>` as that owner first.",
    );
  }
  return { account: identity.accounts[0], runtime: matches[0].runtime };
}

export function assertDevDeployBindings(raw) {
  let bindings;
  try {
    bindings = JSON.parse(raw);
  } catch {
    throw new Error("Wrangler did not return a JSON secret-binding list; refusing to deploy.");
  }
  if (!Array.isArray(bindings)) {
    throw new Error("Wrangler returned an unexpected secret-binding shape; refusing to deploy.");
  }

  const names = new Set(bindings.map((binding) => binding?.name).filter(Boolean));
  const missing = REQUIRED_BINDINGS.filter((name) => !names.has(name));
  if (missing.length) {
    throw new Error(
      `The selected Cloudflare sandbox is not provisioned for the Silver & Salt dev canary ` +
        `(missing binding: ${missing.join(", ")}); refusing to deploy.`,
    );
  }
  return bindings;
}

function main() {
  const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  const cwd = fileURLToPath(new URL("..", import.meta.url));
  const identity = spawnSync(process.execPath, [wrangler, "whoami", "--json"], {
    cwd,
    encoding: "utf8",
  });
  if (identity.status !== 0) {
    throw new Error("Could not inspect the selected Cloudflare account; refusing to deploy.");
  }

  const cli = fileURLToPath(new URL("../node_modules/@odla-ai/cli/bin/odla-ai.js", import.meta.url));
  const inventory = spawnSync(
    process.execPath,
    [cli, "environment", "list", "--config", resolve(cwd, "odla.config.mjs"), "--json"],
    { cwd, encoding: "utf8" },
  );
  if (inventory.status !== 0) {
    throw new Error("Could not inspect ODLA's managed runtimes; refusing to deploy.");
  }
  const target = assertDevDeployAccount(identity.stdout, inventory.stdout);

  const result = spawnSync(
    process.execPath,
    [wrangler, "secret", "list", "--env", "dev", "--format", "json"],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error("Could not inspect the selected Cloudflare dev Worker; refusing to deploy.");
  }
  assertDevDeployBindings(result.stdout);
  console.log(
    `dev deploy target: ${target.runtime} runtime on its declared Cloudflare account and ODLA bindings verified`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
