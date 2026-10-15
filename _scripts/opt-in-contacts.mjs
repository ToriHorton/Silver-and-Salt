// Record that everyone on Tori's contact list has opted in to updates (Tori,
// 2026-10-14). The upload and the call ingest create people opted out by
// default ("unsubscribed"), so the update email cannot reach them; this moves
// each person's main email to subscribed with the CRM's "contact.optin"
// event. Two steps, and Tori approves between them:
//
//   node _scripts/opt-in-contacts.mjs prod <contacts.csv>           review only, writes nothing
//   node _scripts/opt-in-contacts.mjs prod <contacts.csv> --apply   writes exactly what it showed
//
// Never overrides a person's own choice: an email someone unsubscribed from
// with a link, one that bounced, or one Tori suppressed is reported and left.
// Only the default opt-out from the upload or the call ingest, or no answer
// at all, is changed. Rows marked "Do not upload" are skipped. Safe to run
// again: subscribed emails are left as they are.

import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
import { applyConsent, listChannels } from "@odla-ai/crm";
import { crm } from "../src/crm.mjs";
import { loadPeople } from "../src/labels-job.mjs";
import { parseCsv } from "./upload-contacts.mjs";

const clean = (v) => (v ?? "").trim();
const lower = (v) => clean(v).toLowerCase();

// Opt-outs the system set on its own, never by the person.
const DEFAULT_SOURCES = new Set(["crm-ingest:auto-created", "upload-contacts"]);

/** What to do with one email channel: "optin", "already", or why it is left. */
export function decide(channel) {
  if (!channel) return "no email on the record";
  const consent = channel.consent ?? null;
  if (consent === "subscribed") return "already";
  if (consent === null) return "optin";
  if (consent === "unsubscribed" && (DEFAULT_SOURCES.has(clean(channel.consentSource)) || !clean(channel.consentSource))) return "optin";
  return `left alone: ${consent}${channel.consentSource ? ` (${channel.consentSource})` : ""}`;
}

async function main() {
  const [envName, csvPath] = process.argv.slice(2);
  const apply = process.argv.includes("--apply");
  if (!["dev", "prod"].includes(envName) || !csvPath) throw new Error("usage: opt-in-contacts.mjs <dev|prod> <contacts.csv> [--apply]");
  const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
  const env = creds.envs?.[envName];
  const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
  const deps = { crm, db };

  const [header, ...lines] = parseCsv(readFileSync(csvPath, "utf8"));
  const col = (title) => {
    const i = header.findIndex((h) => lower(h) === title.toLowerCase());
    if (i === -1) throw new Error(`The CSV has no "${title}" column.`);
    return i;
  };
  const idx = { email: col("E-mail 1 - Value"), email2: col("E-mail 2 - Value"), action: col("Action") };

  const people = await loadPeople(db);
  const byEmail = new Map();
  for (const p of people) { const s = lower(p.fields?.secondaryEmail); if (s) byEmail.set(s, p); }
  for (const p of people) { const e = lower(p.primaryEmail ?? p.fields?.email); if (e) byEmail.set(e, p); }

  const optins = [];
  const notes = [];
  let already = 0;
  const seen = new Set();
  for (const line of lines) {
    const email = lower(line[idx.email]);
    if (!email || lower(line[idx.action]) === "do not upload") continue;
    const record = byEmail.get(email) ?? (lower(line[idx.email2]) ? byEmail.get(lower(line[idx.email2])) : null);
    if (!record) { notes.push(`${email}: not in the CRM`); continue; }
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const channels = await listChannels(deps, record.id);
    const channel = channels.find((c) => c.kind === "email" && c.isPrimary) ?? channels.find((c) => c.kind === "email") ?? null;
    const verdict = decide(channel);
    if (verdict === "optin") optins.push({ record, channel });
    else if (verdict === "already") already++;
    else notes.push(`${record.name}: ${verdict}`);
  }

  console.log(`${envName}: ${optins.length} people to opt in, ${already} already opted in`);
  for (const { record, channel } of optins) console.log(`  ${record.name} (${channel.value ?? record.primaryEmail}): ${channel.consent ?? "not asked"} → subscribed`);
  for (const n of notes) console.log(`  ${n}`);
  if (!apply) { console.log("Nothing written. Add --apply to write exactly this."); return; }

  let done = 0;
  for (const { channel } of optins) {
    await applyConsent(deps, { channelId: channel.id, event: "contact.optin", mutationId: `opt-in-contacts:${channel.id}` });
    done++;
  }
  console.log(`Opted in ${done}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
