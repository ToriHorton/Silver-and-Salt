// One-shot importer: Granola meeting notes -> CRM call history.
//
// Reads the plain-text export format (see below), maps it through
// src/crm-ingest.mjs, and writes into the CRM for one environment.
//
// Idempotent by construction: every write carries a deterministic mutationId
// derived from the Granola meeting id, so re-running imports nothing twice.
// That means a partial run can simply be re-run, and a dev rehearsal can be
// repeated against prod later without fear of doubling anyone's history.
//
// Usage:
//   node _scripts/import-granola-calls.mjs --file <export.txt> [--env dev|prod] [--dry-run]
//   node _scripts/import-granola-calls.mjs --file <export.txt> --post [url]
//
// --post sends the batch to the live POST /api/crm-ingest endpoint (default
// https://silverandsaltcapital.com/api/crm-ingest) with CRM_INGEST_SECRET from
// the git-ignored .dev.vars, instead of writing to odla-db with admin
// credentials. This is the morning routine's path: the endpoint can only add
// calls, notes and tasks, so the routine never holds a database key. Batches
// are split to stay under the Worker's 64 KB body cap.
//
// Defaults to --env dev and REQUIRES --yes to write to prod, because this
// writes real relationship history onto real member records.
//
// Export format (delimiters chosen so they cannot occur in meeting prose):
//
//   ===MEETING===
//   id: <granola uuid>            <- the idempotency anchor, required
//   title: <title>
//   date: <ISO 8601>
//   url: <granola url>
//   attendees: email|Name; email|Name
//   task: <text>                  <- optional, repeatable
//   task: <text>|<owner>          <- owner means "waiting on them", not Tori
//   ---SUMMARY---
//   <markdown>
//   ---PRIVATE---                 <- optional
//   <markdown>
//   ===END===

import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
import { ingestBatch } from "../src/crm-ingest.mjs";

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const FILE = arg("file");
const ENV = arg("env", "dev");
const DRY = flag("dry-run");
const POST = flag("post");
const POST_URL = arg("post", "https://silverandsaltcapital.com/api/crm-ingest");

if (!FILE) {
  console.error("usage: node _scripts/import-granola-calls.mjs --file <export.txt> [--env dev|prod] [--dry-run]");
  process.exit(2);
}
if (ENV === "prod" && !flag("yes") && !DRY && !POST) {
  console.error("refusing to write to prod without --yes (this writes real member history)");
  process.exit(2);
}

// ── Parse ──────────────────────────────────────────────────────────────
// Granola's connector returns HTML-escaped text (&apos;, &amp;); store it plain.
const unescape = (t) =>
  String(t ?? "")
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

function parse(text) {
  text = unescape(text);
  const out = [];
  for (const block of text.split("===MEETING===").slice(1)) {
    const body = block.split("===END===")[0];
    const [head, rest = ""] = body.split("---SUMMARY---");
    const [summary = "", privateNotes = ""] = rest.split("---PRIVATE---");

    const headers = {};
    const tasks = [];
    for (const line of head.split("\n")) {
      const m = /^([a-z]+):\s*(.*)$/.exec(line.trim());
      if (!m) continue;
      if (m[1] === "task") tasks.push(m[2]);
      else headers[m[1]] = m[2];
    }

    const attendees = (headers.attendees || "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pair) => {
        const [email, name] = pair.split("|");
        return { email: (email || "").trim(), name: (name || "").trim() };
      });

    const occurredAt = headers.date ? Date.parse(headers.date) : NaN;

    out.push({
      sourceId: "granola",
      meetingId: headers.id,
      title: headers.title,
      url: headers.url,
      kind: "call",
      ...(Number.isFinite(occurredAt) ? { occurredAt } : {}),
      attendees,
      summary: summary.trim(),
      privateNotes: privateNotes.trim(),
      actionItems: tasks.map((t) => {
        const [text, owner] = t.split("|");
        return { text: (text || "").trim(), owner: (owner || "").trim(), due: "" };
      }),
    });
  }
  return out;
}

// ── Credentials ────────────────────────────────────────────────────────
function credentials(envName) {
  // Prefer the checked-out .dev.vars for dev; fall back to the local odla
  // credentials file (the pattern the other _scripts use) for prod.
  if (envName === "dev") {
    const vars = {};
    for (const line of readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").split("\n")) {
      const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line.trim());
      if (m) vars[m[1]] = m[2];
    }
    return { appId: vars.ODLA_TENANT, adminToken: vars.ODLA_API_KEY, endpoint: vars.ODLA_ENDPOINT };
  }
  const creds = JSON.parse(
    readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"),
  ).envs[envName];
  return { appId: creds.tenantId, adminToken: creds.dbKey, endpoint: "https://db.odla.ai" };
}

// ── Run ────────────────────────────────────────────────────────────────
const meetings = parse(readFileSync(FILE, "utf8"));

console.log(`parsed ${meetings.length} meetings from ${FILE}`);
for (const m of meetings) {
  const who = m.attendees.map((a) => a.email).join(", ") || "(none)";
  const bits = [
    `${m.summary.length} chars summary`,
    m.privateNotes ? `${m.privateNotes.length} chars private` : null,
    m.actionItems.length ? `${m.actionItems.length} tasks` : null,
  ].filter(Boolean);
  console.log(`  ${(m.title || "").slice(0, 52).padEnd(54)} ${who}`);
  console.log(`      ${new Date(m.occurredAt).toISOString().slice(0, 10)}  ${bits.join(", ")}`);
}

// Fail loudly rather than silently importing a malformed block.
const bad = meetings.filter((m) => !m.meetingId || !m.summary || !m.attendees.length);
if (bad.length) {
  console.error(`\n${bad.length} meeting(s) missing id, summary or attendees:`);
  for (const m of bad) console.error(`  - ${m.title || "(untitled)"}`);
  process.exit(1);
}

if (DRY) {
  console.log("\n--dry-run: nothing written");
  process.exit(0);
}

let report;
if (POST) {
  report = await postBatches(meetings);
} else {
  const creds = credentials(ENV);
  console.log(`\nwriting to ${ENV} (${creds.appId})`);
  const db = initAdmin(creds);
  report = await ingestBatch(db, { meetings });
}

console.log("\n=== result ===");
console.log(`people created:     ${report.peopleCreated.length}${report.peopleCreated.length ? " -> " + report.peopleCreated.join(", ") : ""}`);
console.log(`calls written:      ${report.activitiesWritten}  (already present: ${report.activitiesDuplicate})`);
console.log(`private notes:      ${report.privateNotesWritten}`);
console.log(`follow-up tasks:    ${report.tasksWritten}  (already present: ${report.tasksDuplicate})`);
if (report.unattached.length) {
  console.log(`unattached items:   ${report.unattached.length}`);
  for (const u of report.unattached) console.log(`  ! ${u}`);
}
if (report.errors.length) {
  console.log(`\nerrors: ${report.errors.length}`);
  for (const e of report.errors) console.log(`  ! ${e.meetingId}: ${e.error}`);
  process.exit(1);
}
console.log("\ndone");

// ── POST mode ──────────────────────────────────────────────────────────
async function postBatches(all) {
  let secret = "";
  for (const line of readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").split("\n")) {
    const m = /^CRM_INGEST_SECRET\s*=\s*"?([^"]*)"?\s*$/.exec(line.trim());
    if (m) secret = m[1];
  }
  if (!secret) {
    console.error("CRM_INGEST_SECRET is missing from .dev.vars (see _scripts/install-crm-ingest-secret.sh)");
    process.exit(2);
  }
  // Group meetings into bodies under ~48 KB, leaving room under the 64 KB cap.
  const LIMIT = 48 * 1024;
  const batches = [];
  let cur = [];
  for (const m of all) {
    const next = [...cur, m];
    if (cur.length && Buffer.byteLength(JSON.stringify({ meetings: next })) > LIMIT) {
      batches.push(cur);
      cur = [m];
    } else cur = next;
  }
  if (cur.length) batches.push(cur);

  console.log(`\nposting ${all.length} meetings to ${POST_URL} in ${batches.length} batch(es)`);
  const total = {
    peopleCreated: [], activitiesWritten: 0, activitiesDuplicate: 0, privateNotesWritten: 0,
    tasksWritten: 0, tasksDuplicate: 0, unattached: [], errors: [],
  };
  for (const batch of batches) {
    const res = await fetch(POST_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ meetings: batch }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status !== 200 && res.status !== 207) {
      console.error(`POST failed: ${res.status} ${JSON.stringify(body)}`);
      process.exit(1);
    }
    for (const k of ["peopleCreated", "unattached", "errors"]) total[k].push(...(body[k] || []));
    for (const k of ["activitiesWritten", "activitiesDuplicate", "privateNotesWritten", "tasksWritten", "tasksDuplicate"]) total[k] += body[k] || 0;
  }
  return total;
}
