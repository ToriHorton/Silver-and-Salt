// Remove the gift-seat request from one application and its People record:
// "Wants a gift seat", "Gift for (name)", "Gift for (email)". For a buyer
// whose seat was never created or charged, so the person they named can
// apply on their own like anyone else. Nothing is charged, refunded, or
// emailed; any seat that does exist is refused, not touched.
//
//   node _scripts/clear-gift-seat-request.mjs prod <applicationId>            shows what would change
//   node _scripts/clear-gift-seat-request.mjs prod <applicationId> --apply    clears it
//
// The old answers are printed before they are cleared, so they can be restored.

import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";

const [envName, appId] = process.argv.slice(2);
const apply = process.argv.includes("--apply");
if (!["dev", "prod"].includes(envName) || !appId) throw new Error("usage: clear-gift-seat-request.mjs <dev|prod> <applicationId> [--apply]");

const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
const FIELDS = ["giftSeatInterest", "giftSeatRecipientName", "giftSeatRecipientEmail"];

const { applications = [] } = await db.query({ applications: { $: { where: { id: appId }, limit: 1 } } });
const app = applications[0];
if (!app) throw new Error(`No application ${appId}.`);
const { crm_record: records = [] } = await db.query({ crm_record: { $: { where: { type: "person" }, limit: 1000 } } });
const parse = (f) => (typeof f === "string" ? JSON.parse(f) : f ?? {});
const record = records.find((r) => parse(r.fields).applicationId === appId);

console.log(`application ${appId} (${app.firstName ?? ""} ${app.lastName ?? ""})`);
for (const k of FIELDS) console.log(`  ${k.padEnd(24)} ${JSON.stringify(app[k] ?? null)}`);
if (record) {
  console.log(`people record ${record.id}`);
  for (const k of FIELDS) console.log(`  ${k.padEnd(24)} ${JSON.stringify(parse(record.fields)[k] ?? null)}`);
} else {
  console.log("people record: none found with this applicationId");
}

if (!apply) {
  console.log("\nNothing written. Add --apply to clear these.");
} else {
  const blank = Object.fromEntries(FIELDS.map((k) => [k, ""]));
  const ops = [{ t: "update", ns: "applications", id: appId, attrs: blank }];
  if (record) {
    const fields = { ...parse(record.fields), ...blank };
    ops.push({ t: "update", ns: "crm_record", id: String(record.id), attrs: { fields: typeof record.fields === "string" ? JSON.stringify(fields) : fields } });
  }
  await db.transact(ops);
  console.log("\nCleared.");
}
