// Full names and preferred names from Tori's contact list onto the CRM
// (Tori, 2026-10-14). Records made from Granola calls carry short names such
// as "Rocky" or "Maile K."; this sets each person's full name, first and last
// name, and the preferred name emails greet them by (src/greeting-name.mjs).
// Two steps, and Tori approves between them:
//
//   node _scripts/set-contact-names.mjs prod <contacts.csv>           review only, writes nothing
//   node _scripts/set-contact-names.mjs prod <contacts.csv> --apply   writes exactly what it showed
//
// Columns read: Name, Given Name, Family Name, E-mail 1 - Value,
// E-mail 2 - Value, Preferred name. The first name is the Name column without
// the family name ("Patricia Jones Horton" gives Patricia), else Given Name.
// The preferred name is the sheet's Preferred name, else Given Name.
//
// Only live records are changed, found by either email. Anyone who has
// applied is left alone: their own application answers are their names.
// Safe to run again: a record that already matches is not written.

import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
import { updateRecord } from "@odla-ai/crm";
import { crm } from "../src/crm.mjs";
import { loadPeople } from "../src/labels-job.mjs";
import { parseCsv } from "./upload-contacts.mjs";

const clean = (v) => (v ?? "").replace(/\s+/g, " ").trim();
const lower = (v) => clean(v).toLowerCase();

/** The names one sheet row gives, or null for a row with no person. */
export function namesFor({ name, given, family, preferred }) {
  const full = clean(name);
  const last = clean(family);
  const g = clean(given);
  let first = g;
  if (full && last && full.toLowerCase().endsWith(" " + last.toLowerCase())) first = full.slice(0, full.length - last.length).trim();
  if (!first) first = full;
  if (!first) return null;
  return { name: [first, last].filter(Boolean).join(" "), firstName: first, lastName: last, preferredName: clean(preferred) || g || first };
}

async function main() {
  const [envName, csvPath] = process.argv.slice(2);
  const apply = process.argv.includes("--apply");
  if (!["dev", "prod"].includes(envName) || !csvPath) throw new Error("usage: set-contact-names.mjs <dev|prod> <contacts.csv> [--apply]");
  const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
  const env = creds.envs?.[envName];
  const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });

  const [header, ...lines] = parseCsv(readFileSync(csvPath, "utf8"));
  const col = (title) => {
    const i = header.findIndex((h) => lower(h) === title.toLowerCase());
    if (i === -1) throw new Error(`The CSV has no "${title}" column.`);
    return i;
  };
  const idx = { name: col("Name"), given: col("Given Name"), family: col("Family Name"), email: col("E-mail 1 - Value"), email2: col("E-mail 2 - Value"), preferred: col("Preferred name") };

  const people = await loadPeople(db);
  const byEmail = new Map();
  for (const p of people) { const s = lower(p.fields?.secondaryEmail); if (s) byEmail.set(s, p); }
  for (const p of people) { const e = lower(p.primaryEmail ?? p.fields?.email); if (e) byEmail.set(e, p); }

  const changes = [];
  const notes = [];
  for (const line of lines) {
    const row = Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, line[i]]));
    const names = namesFor(row);
    if (!names) continue;
    const record = byEmail.get(lower(row.email)) ?? (lower(row.email2) ? byEmail.get(lower(row.email2)) : null);
    if (!record) { if (lower(row.email)) notes.push(`${names.name}: not in the CRM`); continue; }
    if (clean(record.fields?.applicationId)) { notes.push(`${record.name}: has applied, keeps their own names`); continue; }
    const f = record.fields ?? {};
    const input = {};
    for (const k of ["firstName", "lastName", "preferredName"]) if (clean(f[k]) !== names[k]) input[k] = names[k];
    if (clean(record.name) !== names.name) input.name = names.name;
    if (Object.keys(input).length) changes.push({ record, input, names });
  }

  console.log(`${envName}: ${changes.length} people to update`);
  for (const { record, names } of changes) {
    const nameChange = clean(record.name) !== names.name ? `${record.name} → ${names.name}` : names.name;
    console.log(`  ${nameChange}, goes by ${names.preferredName}`);
  }
  for (const n of notes) console.log(`  left alone: ${n}`);
  if (!apply) { console.log("Nothing written. Add --apply to write exactly this."); return; }

  let done = 0;
  for (const { record, input } of changes) {
    await updateRecord({ crm, db }, { id: record.id, input, expectedUpdatedAt: record.updatedAt });
    done++;
  }
  console.log(`Updated ${done}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
