// Starting labels for everyone already in the admin console (build plan v3,
// phase 1.5). Two steps, and Tori approves between them:
//
//   node _scripts/backfill-labels.mjs prod            review list only, writes nothing
//   node _scripts/backfill-labels.mjs prod --apply    writes exactly what the list showed
//
// The review list is written to .odla/review/ (git-ignored, never deployed):
// it holds names and emails. Dates the backfill cannot know exactly are marked
// "estimated", and the curves leave them out unless asked.
//
// Applicants get their labels and history from Chapter's own rows, through the
// same code the five-minute job runs (src/labels-job.mjs). People with no
// application get a starting Action from their current People stage:
//   prospect → Identified, conversation_booked → Introduction booked,
//   soft_commit → Soft commit; all Relationship first.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
import { updateRecord } from "@odla-ai/crm";
import { crm } from "../src/crm.mjs";
import { applyPlan, runLabels } from "../src/labels-job.mjs";
import { ACTION_BY_ID, PATH_LABELS, TYPE_LABELS, typeOf } from "../src/labels.mjs";

const envName = process.argv[2];
const apply = process.argv.includes("--apply");
if (!["dev", "prod"].includes(envName)) throw new Error("usage: backfill-labels.mjs <dev|prod> [--apply]");
const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
const CHAPTER = "silver-and-salt-capital";
const runtime = envName === "prod" ? "live" : undefined;
const now = Date.now();

const STAGE_TO_ACTION = { prospect: "identified", candidate: "identified", invited: "identified", conversation_booked: "intro_booked", soft_commit: "soft_commit" };

const { plans } = await runLabels(db, CHAPTER, runtime, { now, nowQuality: "estimated", write: false });
const applicantIds = new Set(plans.map((p) => p.record.id));

// People with no application and no labels yet.
const { loadPeople } = await import("../src/labels-job.mjs");
const people = await loadPeople(db);
const prospects = people
  .filter((p) => !applicantIds.has(p.id) && !p.fields?.applicationId && !p.fields?.journeyAction)
  .map((p) => {
    const action = STAGE_TO_ACTION[p.stage] ?? "identified";
    return { record: p, action, since: p.stageChangedAt ?? p.createdAt };
  });

const rows = [
  ...plans.filter((p) => p.app).map(({ record, app, plan }) => ({
    name: record.name, email: record.primaryEmail ?? "", kind: "Applicant record",
    from: record.stage ?? "", status: app.status,
    path: plan.labels.journeyPath, action: plan.labels.journeyAction, type: plan.labels.journeyType,
    admission: plan.labels.admission, payment: plan.labels.payment,
    events: plan.events.map((e) => `${e.event}${e.dateQuality === "estimated" ? "*" : ""}`).join(", "),
  })),
  ...prospects.map(({ record, action }) => ({
    name: record.name, email: record.primaryEmail ?? "", kind: "Before applying",
    from: record.stage ?? "", status: "",
    path: "relationship_first", action, type: typeOf(action), admission: "", payment: "", events: `${action}*`,
  })),
];

if (!apply) {
  mkdirSync(new URL("../.odla/review/", import.meta.url), { recursive: true });
  const stamp = new Date(now).toISOString().slice(0, 10);
  const file = new URL(`../.odla/review/labels-backfill-${envName}-${stamp}.html`, import.meta.url);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const counts = {};
  for (const r of rows) { const k = `${TYPE_LABELS[r.type] ?? "?"} · ${PATH_LABELS[r.path] ?? r.path}`; counts[k] = (counts[k] ?? 0) + 1; }
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><title>Labels backfill review (${envName})</title>
<style>body{font:14px system-ui;margin:24px;color:#2F3E34}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#F4EFE6;position:sticky;top:0}small{color:#7E8E84}</style>
<h1>Starting labels, ${esc(envName)}, ${stamp}</h1>
<p>${rows.length} people. Nothing has been written. <small>* = estimated date.</small></p>
<p>${Object.entries(counts).map(([k, v]) => `${esc(k)}: <b>${v}</b>`).join(" · ")}</p>
<table><tr><th>Name</th><th>Email</th><th>Where from</th><th>People stage now</th><th>Application status</th><th>Path</th><th>Type</th><th>Action</th><th>Admission</th><th>Payment</th><th>Events to record</th></tr>
${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${esc(r.kind)}</td><td>${esc(r.from)}</td><td>${esc(r.status)}</td><td>${esc(PATH_LABELS[r.path] ?? r.path)}</td><td>${esc(TYPE_LABELS[r.type] ?? r.type)}</td><td><b>${esc(ACTION_BY_ID[r.action]?.label ?? r.action)}</b></td><td>${esc(r.admission)}</td><td>${esc(r.payment)}</td><td><small>${esc(r.events)}</small></td></tr>`).join("\n")}
</table>`);
  console.log(`review list: ${file.pathname}`);
  console.log(`${rows.length} people (${plans.length} with an application, ${prospects.length} before applying). Nothing written.`);
  process.exit(0);
}

// --apply: write exactly what the review list showed.
let written = 0;
for (const { record, plan } of plans) {
  const res = await applyPlan(db, record, plan, { now, method: "automatic" });
  if (res.labels) written++;
}
for (const { record, action, since } of prospects) {
  try {
    await updateRecord({ crm, db }, {
      id: record.id,
      input: { journeyAction: action, journeyType: typeOf(action), journeyPath: "relationship_first", actionSince: since },
      expectedUpdatedAt: record.updatedAt,
      audit: {
        id: `journey-backfill:${record.id}`,
        body: `Action: None → ${ACTION_BY_ID[action].label} (starting label)`,
        authorId: "system",
        meta: { journeyEvent: "action_changed", from: null, to: action, occurredAt: since, recordedAt: now, actor: "system", method: "automatic", sourceType: "backfill", sourceId: record.id, dateQuality: "estimated", personId: record.id },
      },
    });
    written++;
  } catch (err) {
    console.error("not written (changed since the review):", record.name, err instanceof Error ? err.message : err);
  }
}
console.log(`${written} people labelled.`);
