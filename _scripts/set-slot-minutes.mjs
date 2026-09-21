#!/usr/bin/env node
// Set the onboarding call length (groups.schedulingJson.slotMinutes) on a
// tenant's group row. Tori, 2026-09-20: the call is 30 minutes. The row is the
// authority (owner-editable in the admin console); src/chapter.config.mjs only
// seeds a fresh tenant, so change both together.
//
// Usage (read-only unless --apply):
//   node _scripts/set-slot-minutes.mjs prod 30
//   node _scripts/set-slot-minutes.mjs prod 30 --apply
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";

const GROUP_ID = "silver-and-salt-capital";
const [envName, minutesArg] = process.argv.slice(2);
const apply = process.argv.includes("--apply");
const minutes = Number(minutesArg);
if (!["dev", "prod"].includes(envName) || !(minutes >= 15 && minutes <= 240)) throw new Error("usage: set-slot-minutes.mjs <dev|prod> <15..240> [--apply]");

const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
if (!env?.dbKey || !env?.tenantId) throw new Error(`no cached ${envName} credentials`);
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });

const read = async () => (await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } })).groups?.[0];
const row = await read();
if (!row) throw new Error(`group ${GROUP_ID} not found on ${envName}`);
const before = row.schedulingJson ?? {};
console.log(`[${envName}] stored scheduling:`, JSON.stringify(before));
if (before.slotMinutes === minutes) { console.log(`[${envName}] slotMinutes is already ${minutes}.`); process.exit(0); }
console.log(`[${envName}] slotMinutes ${before.slotMinutes ?? "(unset)"} -> ${minutes}`);
if (!apply) { console.log("Dry run; pass --apply to write."); process.exit(0); }

await db.transact(
  [{ t: "merge", ns: "groups", id: { ns: "groups", attr: "id", value: GROUP_ID }, attrs: { schedulingJson: { ...before, slotMinutes: minutes } } }],
  { mutationId: `slot-minutes:${minutes}:${envName}:2026-09-20` },
);
const after = await read();
console.log(`[${envName}] stored slotMinutes now: ${after?.schedulingJson?.slotMinutes}`);
