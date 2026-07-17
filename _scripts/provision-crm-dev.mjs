// Provision the @odla-ai/crm namespaces into the DEV tenant.
//
// Why this exists: it provisions with the app admin key (never-expiring), so it
// needs no developer-token re-auth and no interactive Studio handshake. As of
// @odla-ai/db 0.6.6 the official `npx odla-ai provision` also works again (0.6.5
// restored the `collectToken` export the CLI needs) and crm 0.1.2's CRM_SCHEMA
// is now self-consistent, so either path is fine; this one stays as the
// token-free, proven option for dev.
//
// What it does (all additive, dev-only, idempotent — safe to re-run):
//   1. GET the live app schema and MERGE the app + crm namespaces in
//      (existing entities are preserved; only new ones are added).
//   2. POST the merged schema back.
//   3. Seed the crm_config singleton (templates + addresses) when absent.
//
// It deliberately does NOT install the deny-all crm_* rules: that endpoint
// wants the developer token, and it is redundant here anyway — the browser
// never holds a db credential (all access is the worker with the admin key,
// which bypasses rules), and the app's defaultRules is "deny". Run the real
// `odla-ai provision` (now that the CLI loads) if you want the explicit rules
// laid down.
//
// Usage:  node _scripts/provision-crm-dev.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initAdmin, tx } from "@odla-ai/db";
import { CRM_SCHEMA, createCrmIntegration } from "@odla-ai/crm";
import { crm } from "../src/crm.mjs";
import { schema as appSchema } from "../src/odla/schema.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .dev.vars reader (KEY=VALUE per line; values may contain '=').
function readDevVars() {
  const raw = readFileSync(join(ROOT, ".dev.vars"), "utf8");
  const vars = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    let val = t.slice(eq + 1).trim();
    // Strip surrounding quotes (.dev.vars values are quoted).
    if (val.length >= 2 && (val[0] === '"' || val[0] === "'") && val[val.length - 1] === val[0]) {
      val = val.slice(1, -1);
    }
    vars[t.slice(0, eq).trim()] = val;
  }
  return vars;
}

const env = readDevVars();
const { ODLA_ENDPOINT, ODLA_TENANT, ODLA_API_KEY } = env;
if (!ODLA_ENDPOINT || !ODLA_TENANT || !ODLA_API_KEY) {
  throw new Error("missing ODLA_ENDPOINT / ODLA_TENANT / ODLA_API_KEY in .dev.vars");
}

const schemaUrl = `${ODLA_ENDPOINT}/app/${encodeURIComponent(ODLA_TENANT)}/schema`;
const authHeaders = { authorization: `Bearer ${ODLA_API_KEY}` };
// --dry: GET + merge + print only, no writes. Use it to inspect before pushing.
const DRY = process.argv.includes("--dry");

async function main() {
  console.log(`tenant: ${ODLA_TENANT}`);
  console.log(`endpoint: ${ODLA_ENDPOINT}`);

  // 1. Live schema.
  const liveRes = await fetch(schemaUrl, { headers: authHeaders });
  if (!liveRes.ok) {
    throw new Error(`GET schema failed: ${liveRes.status} ${await liveRes.text()}`);
  }
  const livePayload = await liveRes.json();
  const liveSchema = livePayload.schema ?? livePayload;
  const liveEntities = Object.keys(liveSchema.entities ?? {});
  console.log(`live entities (${liveEntities.length}): ${liveEntities.join(", ")}`);

  // 2. Merge the crm_* namespaces in. Guard: refuse to clobber a same-named
  // app entity (there are none — applications/groups/meetings/emailLog).
  for (const name of Object.keys(CRM_SCHEMA.entities)) {
    if (liveEntities.includes(name) && !name.startsWith("crm_")) {
      throw new Error(`refusing to overwrite existing non-crm entity "${name}"`);
    }
  }
  // Push the app-defined entities + crm_*, but NOT the $-prefixed system
  // namespaces ($users/$subscriptions/$entitlements/$files): those are
  // platform-managed and the schema endpoint rejects them (namespace regex
  // forbids "$"). Keeping all existing app entities in the payload means the
  // push can only ADD the crm_* namespaces, never remove anything.
  // Live + the canonical app schema (src/odla/schema.mjs, so new app entities
  // like superAdmins get pushed) + the crm namespaces. crm 0.1.2's CRM_SCHEMA
  // now declares the `id` attr on the namespaces it reads by `where:{id}`, so
  // no manual id-declaration is needed anymore. The $-prefixed system
  // namespaces are platform-managed and rejected by the schema endpoint.
  const mergedAll = { ...liveSchema.entities, ...appSchema.entities, ...CRM_SCHEMA.entities };
  const entities = {};
  for (const [name, def] of Object.entries(mergedAll)) {
    if (name.startsWith("$")) continue;
    entities[name] = def;
  }
  const merged = {
    entities,
    links: { ...(liveSchema.links ?? {}), ...(CRM_SCHEMA.links ?? {}) },
  };
  const added = Object.keys(CRM_SCHEMA.entities).filter((n) => !liveEntities.includes(n));
  console.log(`adding ${added.length} crm namespaces: ${added.join(", ") || "(already present)"}`);

  if (DRY) {
    console.log(`\n[dry] merged schema would have ${Object.keys(merged.entities).length} entities:`);
    console.log("[dry] " + Object.keys(merged.entities).join(", "));
    console.log("[dry] links:", JSON.stringify(merged.links));
    console.log("[dry] no writes performed.");
    return;
  }

  // 3. Push the merged schema.
  const pushRes = await fetch(schemaUrl, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ schema: merged }),
  });
  if (!pushRes.ok) {
    throw new Error(`POST schema failed: ${pushRes.status} ${await pushRes.text()}`);
  }
  console.log("schema pushed ✓");

  // 4. Seed crm_config (idempotent: only when absent), from the integration
  // descriptor so the templates/addresses match what the CLI would seed.
  const db = initAdmin({ appId: ODLA_TENANT, adminToken: ODLA_API_KEY, endpoint: ODLA_ENDPOINT });
  const { crm_config } = await db.query({
    crm_config: { $: { where: { key: "default" }, limit: 1 } },
  });
  if (crm_config?.length) {
    console.log("crm_config already seeded ✓ (left as-is)");
  } else {
    const desc = createCrmIntegration(crm, {
      basePath: "/api/crm",
      notificationEmail: "cory.ondrejka+debug@gmail.com",
      replyTo: "cory.ondrejka+debug@gmail.com",
      debugEmail: "cory.ondrejka+debug@gmail.com",
    });
    const seed = desc.seeds?.find((s) => s.ns === "crm_config");
    if (!seed) throw new Error("integration produced no crm_config seed");
    // The row id is the tx key (seed.id); crm_config declares `key`, not `id`,
    // as its natural key, so do not write an `id` attr.
    await db.transact(
      tx.crm_config[seed.id].update({ key: seed.key.value, ...seed.attrs }),
      { mutationId: "crm:seed:config:v1" },
    );
    console.log("crm_config seeded ✓");
  }

  console.log("\nDone. Verify with: curl -i " + ODLA_ENDPOINT.replace(/\/$/, "") + " (or the app worker's /api/crm/records -> 401 unauth).");
}

main().catch((err) => {
  console.error("\nprovision-crm-dev failed:", err.message || err);
  process.exit(1);
});
