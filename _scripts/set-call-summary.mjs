#!/usr/bin/env node
// Set the calendar event title for the onboarding call
// (groups.schedulingJson.summaryTemplate) on a tenant's group row.
// Tori, 2026-09-20: the call is the "onboarding call" everywhere.
//
// Usage (read-only unless --apply):
//   node _scripts/set-call-summary.mjs prod
//   node _scripts/set-call-summary.mjs prod --apply
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";

const GROUP_ID = "silver-and-salt-capital";
const SUMMARY = "Silver & Salt Capital: onboarding call with {{firstName}} {{lastName}}";
const envName = process.argv[2];
const apply = process.argv.includes("--apply");
if (!["dev", "prod"].includes(envName)) throw new Error("usage: set-call-summary.mjs <dev|prod> [--apply]");

const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
if (!env?.dbKey || !env?.tenantId) throw new Error(`no cached ${envName} credentials`);
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
const read = async () => (await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } })).groups?.[0];
const row = await read();
if (!row) throw new Error(`group ${GROUP_ID} not found on ${envName}`);
const before = row.schedulingJson ?? {};
console.log(`[${envName}] stored summaryTemplate:`, JSON.stringify(before.summaryTemplate ?? null));
if (before.summaryTemplate === SUMMARY) { console.log(`[${envName}] already set.`); process.exit(0); }
console.log(`[${envName}] proposed:`, JSON.stringify(SUMMARY));
if (!apply) { console.log("Dry run; pass --apply to write."); process.exit(0); }
await db.transact(
  [{ t: "merge", ns: "groups", id: { ns: "groups", attr: "id", value: GROUP_ID }, attrs: { schedulingJson: { ...before, summaryTemplate: SUMMARY } } }],
  { mutationId: `call-summary:onboarding:${envName}:2026-09-20` },
);
console.log(`[${envName}] stored summaryTemplate now:`, (await read())?.schedulingJson?.summaryTemplate);
