// Correct the date on one journey event in a person's history, when the job
// could only estimate it and the real date is known from its source (a Stripe
// payment, a calendar event). Only that event's occurredAt changes; it is
// marked exact and the correction is noted in its meta.
//
//   node _scripts/correct-event-date.mjs prod <personRecordId> <event> <ISO time>            shows the change
//   node _scripts/correct-event-date.mjs prod <personRecordId> <event> <ISO time> --apply    writes it
//
// Example:
//   node _scripts/correct-event-date.mjs prod <personRecordId> paid 2026-01-31T20:00:00-07:00 --source stripe:<paymentIntentId>

import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";

const [envName, recordId, event, iso] = process.argv.slice(2);
const apply = process.argv.includes("--apply");
const source = process.argv[process.argv.indexOf("--source") + 1] ?? null;
if (!["dev", "prod"].includes(envName) || !recordId || !event || !iso) {
  throw new Error("usage: correct-event-date.mjs <dev|prod> <personRecordId> <event> <ISO time> [--source <ref>] [--apply]");
}
const at = Date.parse(iso);
if (!Number.isFinite(at)) throw new Error(`Not a date: ${iso}`);

const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });

const { crm_activity: rows = [] } = await db.query({ crm_activity: { $: { where: { recordId }, limit: 500 } } });
const parse = (m) => (typeof m === "string" ? JSON.parse(m) : m ?? {});
const matches = rows.filter((r) => parse(r.meta).journeyEvent === event);
if (matches.length !== 1) throw new Error(`Expected one "${event}" event on ${recordId}, found ${matches.length}.`);
const row = matches[0];
const meta = parse(row.meta);
const fmt = (ms) => new Date(ms).toLocaleString("en-US", { timeZone: "America/Denver", dateStyle: "medium", timeStyle: "medium" }) + " MT";

console.log(`event      ${event} (${row.id})`);
console.log(`was        ${fmt(meta.occurredAt)} · ${meta.dateQuality ?? "exact"}`);
console.log(`becomes    ${fmt(at)} · exact${source ? ` · source ${source}` : ""}`);

const next = { ...meta, occurredAt: at, dateQuality: "exact", corrected: { from: meta.occurredAt, fromQuality: meta.dateQuality ?? null, at: Date.now(), source } };
if (!apply) {
  console.log("\nNothing written. Add --apply to write it.");
} else {
  await db.transact([{ t: "update", ns: "crm_activity", id: String(row.id), attrs: { meta: typeof row.meta === "string" ? JSON.stringify(next) : next } }]);
  console.log("\nWritten.");
}
