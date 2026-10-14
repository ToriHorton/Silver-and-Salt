// Phase 1 gate (build plan v3, section 5): is a journey event's mutation id
// still refused days later, not only within a short window?
//
//   node _scripts/check-event-dedupe.mjs dev
//
// First run, 2026-10-14 on dev: the first write was stored and the repeat was
// refused. Run again on or after 2026-10-17: it re-sends the SAME mutation id
// and must print "duplicate": true. If it prints false, events move to the
// dedicated journeyEvents table (Tori approved that fallback on 2026-10-14).
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
import { addActivity, listRecords } from "@odla-ai/crm";
import { crm } from "../src/crm.mjs";

const envName = process.argv[2] ?? "dev";
const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs[envName];
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
const deps = { crm, db };
const { records } = await listRecords(deps, { type: "person", limit: 1 });
const rec = records[0];
const mutationId = "journey:dup-test:2026-10-14:" + rec.id;
const res = await addActivity(deps, {
  recordId: rec.id, kind: "system", body: "Journey event: duplicate test", authorId: "system",
  meta: { journeyEvent: "dup_test" }, mutationId,
});
console.log(JSON.stringify({ env: envName, mutationId, duplicate: res.duplicate }));
