#!/usr/bin/env node
// Bounded, reviewed corrections to the PRODUCTION tenant for the launch
// (Phase 4 runbook). Every write is idempotent by mutationId and prints the
// before/after of exactly what it touched. Run from the repo root with the
// prod credentials cached by `provision --live`:
//
//   node _scripts/prod-tenant-bootstrap.mjs --addressing   # group row -> tori@, no debug inbox
//   node _scripts/prod-tenant-bootstrap.mjs --remove-fixture <applicationId> <crmRecordId>
//
// Nothing runs without a flag; with no flags it only prints the current state.

import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";

const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const prod = creds.envs?.prod;
if (!prod?.dbKey || prod.tenantId !== "silver-and-salt-capital") throw new Error("no cached production credentials; run provision --live first");
const db = initAdmin({ appId: prod.tenantId, adminToken: prod.dbKey, endpoint: "https://db.odla.ai" });
const args = process.argv.slice(2);

const state = async () => {
  const r = await db.query({ groups: {}, applications: {}, crm_record: {}, tiers: {}, signupControlHeads: {} });
  const g = r.groups?.[0] ?? {};
  console.log("counts:", JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.length]))));
  console.log("group addressing:", JSON.stringify({ notificationEmail: g.notificationEmail, replyTo: g.replyTo, debugEmail: g.debugEmail }));
  return r;
};

const before = await state();

if (args.includes("--addressing")) {
  const res = await db.transact([
    { t: "update", ns: "groups", id: "silver-and-salt-capital", attrs: { notificationEmail: "tori@silverandsaltcapital.com", replyTo: "tori@silverandsaltcapital.com", updatedAt: Date.now() } },
    { t: "retract", ns: "groups", id: "silver-and-salt-capital", attrs: ["debugEmail"] },
  ], { mutationId: "launch-prod-group-addressing-2026-09-14" });
  console.log("addressing transact:", JSON.stringify(res));
}

const i = args.indexOf("--remove-fixture");
if (i >= 0) {
  const [applicationId, crmRecordId] = args.slice(i + 1, i + 3);
  const app = before.applications.find((a) => a.id === applicationId);
  const rec = before.crm_record.find((r) => r.id === crmRecordId);
  if (!app || !rec) throw new Error("fixture ids not found; nothing deleted");
  if (app.lastName !== "Replayfixture" || app.stripeSubscriptionId) throw new Error("refusing: not the acceptance fixture, or it has provider state");
  const res = await db.transact([
    { t: "delete", ns: "applications", id: applicationId },
    { t: "delete", ns: "crm_record", id: crmRecordId },
  ], { mutationId: `launch-prod-remove-fixture-${applicationId}` });
  console.log("fixture removal transact:", JSON.stringify(res));
}

if (args.length) await state();
