// Set the chapter's booking timezone (group row schedulingJson.timezone).
// usage: node _scripts/set-scheduling-timezone.mjs <dev|prod> <IANA tz> [--apply]
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
const [envName, tz, flag] = process.argv.slice(2);
if (!["dev", "prod"].includes(envName) || !tz) throw new Error("usage: set-scheduling-timezone.mjs <dev|prod> <IANA tz> [--apply]");
new Intl.DateTimeFormat(undefined, { timeZone: tz }); // throws on an invalid zone
const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
const { groups } = await db.query({ groups: { $: { where: { id: "silver-and-salt-capital" }, limit: 1 } } });
const g = groups?.[0];
if (!g) throw new Error("group not found");
const before = g.schedulingJson ?? {};
console.log(`[${envName}] scheduling now:`, JSON.stringify(before));
if (before.timezone === tz) { console.log(`[${envName}] already ${tz}; nothing to do`); process.exit(0); }
const after = { ...before, timezone: tz };
if (flag !== "--apply") { console.log(`[${envName}] would set timezone ${before.timezone} -> ${tz}. Dry run; pass --apply to write.`); process.exit(0); }
await db.transact(
  [{ t: "merge", ns: "groups", id: { ns: "groups", attr: "id", value: g.id }, attrs: { schedulingJson: after } }],
  { mutationId: `scheduling-timezone:${tz}:${envName}` },
);
const check = (await db.query({ groups: { $: { where: { id: g.id }, limit: 1 } } })).groups?.[0];
console.log(`[${envName}] scheduling after:`, JSON.stringify(check?.schedulingJson));
