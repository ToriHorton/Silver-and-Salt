// The morning routine's outreach signals -> the live CRM ingest endpoint
// (Signup Journeys v3.1; build plan v3, phase 4).
//
// The routine writes a JSON file of emails Tori sent from Gmail and calendar
// events, then runs:
//
//   node _scripts/post-outreach.mjs --file <signals.json>          prints what would be sent
//   node _scripts/post-outreach.mjs --file <signals.json> --post   sends it
//
// File shape (an array, or { "outreach": [...] }):
//
//   [{ "kind": "email_sent",     "signalId": "<Gmail message id>", "occurredAt": "<ISO or epoch ms>",
//      "emails": ["recipient@…", …], "subject": "…" },
//    { "kind": "calendar_event", "signalId": "<calendar event id>", "occurredAt": "<when the event was created or found>",
//      "startAt": "<event start, ISO or epoch ms>", "emails": ["guest@…", …], "title": "…" }]
//
// Each signal attaches only to people already in the CRM (it never creates
// anyone) and only as evidence: the labels job turns it into a proposal Tori
// confirms or dismisses. Replays write nothing, so overlapping windows are safe.
// Uses CRM_INGEST_SECRET from the git-ignored .dev.vars, the same as the
// Granola import (_scripts/import-granola-calls.mjs --post).

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const FILE = arg("file");
const POST = argv.includes("--post");
const URL_ = arg("url") ?? "https://silverandsaltcapital.com/api/crm-ingest";
if (!FILE) {
  console.error("usage: node _scripts/post-outreach.mjs --file <signals.json> [--post]");
  process.exit(2);
}

const ms = (v) => (typeof v === "number" ? v : Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
const raw = JSON.parse(readFileSync(FILE, "utf8"));
const list = Array.isArray(raw) ? raw : raw.outreach ?? [];
const outreach = list
  .map((s) => ({
    kind: s.kind,
    sourceId: s.sourceId ?? (s.kind === "email_sent" ? "gmail" : "calendar"),
    signalId: String(s.signalId ?? ""),
    occurredAt: ms(s.occurredAt),
    ...(s.startAt ? { startAt: ms(s.startAt) } : {}),
    emails: (Array.isArray(s.emails) ? s.emails : [s.email]).filter(Boolean),
    ...(s.subject ? { subject: String(s.subject) } : {}),
    ...(s.title ? { title: String(s.title) } : {}),
  }))
  .filter((s) => s.signalId && s.occurredAt && s.emails.length);

console.log(`${outreach.length} signals (${outreach.filter((s) => s.kind === "email_sent").length} emails, ${outreach.filter((s) => s.kind === "calendar_event").length} calendar events)`);
if (!POST) {
  console.log("not sent: add --post to send");
  process.exit(0);
}

let secret = "";
for (const line of readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").split("\n")) {
  const m = /^CRM_INGEST_SECRET\s*=\s*"?([^"]*)"?\s*$/.exec(line.trim());
  if (m) secret = m[1];
}
if (!secret) {
  console.error("CRM_INGEST_SECRET is missing from .dev.vars (see _scripts/install-crm-ingest-secret.sh)");
  process.exit(2);
}
// Bodies under ~48 KB, under the Worker's 64 KB cap.
const batches = [];
let cur = [];
for (const s of outreach) {
  const next = [...cur, s];
  if (cur.length && Buffer.byteLength(JSON.stringify({ outreach: next })) > 48 * 1024) { batches.push(cur); cur = [s]; } else cur = next;
}
if (cur.length) batches.push(cur);
const total = { written: 0, unmatched: new Set(), errors: [] };
for (const batch of batches) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify({ outreach: batch }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200 && res.status !== 207) {
    console.error(`POST failed: ${res.status} ${JSON.stringify(body)}`);
    process.exit(1);
  }
  total.written += body.signalsWritten ?? 0;
  for (const e of body.signalsUnmatched ?? []) total.unmatched.add(e);
  total.errors.push(...(body.errors ?? []));
}
console.log(`written: ${total.written}; not in the CRM (skipped): ${total.unmatched.size}; errors: ${total.errors.length}`);
if (total.errors.length) console.log(JSON.stringify(total.errors, null, 2));
