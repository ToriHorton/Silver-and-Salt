// Upload Tori's contact list into the CRM on the Relationship first path
// (Tori, 2026-10-14). Two steps, and Tori approves between them:
//
//   node _scripts/upload-contacts.mjs prod <contacts.csv>           review list only, writes nothing
//   node _scripts/upload-contacts.mjs prod <contacts.csv> --apply   writes exactly what the list showed
//
// The CSV is the master contacts sheet, downloaded as CSV. Columns read:
// Name, Given Name, Family Name, Organization 1 - Name, Organization 1 - Title,
// E-mail 1 - Value, E-mail 2 - Value, Action, Waive call, Group.
//
// For each row:
//   - Group Partner or Team: the person gets the "partner" or "team" tag and
//     no Path or Action (src/relationship-groups.mjs).
//   - Group Community: Relationship first, with the Action from the sheet.
//     Waive call = Yes always means Invited.
//   - Waive call = Yes, in any group: a "Waive interview" decision for every
//     email on the row, so they can apply with either address and skip the
//     call. It must exist before they apply, which is why this runs first.
//   - Action "Do not upload" or "Already a member": skipped.
//
// Safe to run again: people are found by either email before anyone is
// created, including people who were archived (they come back with their call
// history rather than as a duplicate), a waiver is only added where none is live, labels are only set on
// someone who has none, and blank fields are filled without overwriting.
// Anyone who has already applied is reported and left alone.
//
// The review list is written to .odla/review/ (git-ignored, never deployed):
// it holds names and emails.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
import { addTag, createRecord, listRecords, setArchived, updateRecord } from "@odla-ai/crm";
import { crm } from "../src/crm.mjs";
import { loadWaivers } from "../src/labels-job.mjs";
import { ACTION_BY_ID, refusalFor, typeOf } from "../src/labels.mjs";

const [envName, csvPath] = process.argv.slice(2);
const apply = process.argv.includes("--apply");
const CHAPTER = "silver-and-salt-capital";
const ACTOR = "tori@silverandsaltcapital.com";
const now = Date.now();

const ACTIONS = {
  "identified": "identified", "contacted": "contacted", "introduction booked": "intro_booked", "introduction held": "intro_held",
  "soft commit": "soft_commit", "keep informed": "keep_informed", "invited": "invited",
};
const SKIP = new Set(["do not upload", "already a member"]);
const GROUPS = { partner: "partner", team: "team", community: null, "": null };

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const clean = (v) => (v ?? "").trim();
const lower = (v) => clean(v).toLowerCase();
const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/** One sheet row as what the upload will do with it. */
export function planRow(cols) {
  const name = clean(cols.name);
  const email = lower(cols.email);
  const second = lower(cols.email2);
  const sheetAction = lower(cols.action);
  const waive = lower(cols.waive) === "yes";
  const groupKey = lower(cols.group);
  if (!name && !email) return null;
  const base = { name, email, second, waive };
  if (SKIP.has(sheetAction)) return { ...base, skip: `Action is ${clean(cols.action)}` };
  if (!(groupKey in GROUPS)) return { ...base, skip: `unknown Group "${clean(cols.group)}"` };
  if (!isEmail(email)) return { ...base, skip: "no valid email" };
  if (second && !isEmail(second)) return { ...base, skip: "second email is not valid" };
  const group = GROUPS[groupKey];
  let action = null;
  if (!group) {
    action = waive ? "invited" : ACTIONS[sheetAction];
    if (!action) return { ...base, skip: `unknown Action "${clean(cols.action)}"` };
  }
  return {
    ...base, group, action,
    fields: { name, email, firstName: clean(cols.first), lastName: clean(cols.last), secondaryEmail: second, organization: clean(cols.org), title: clean(cols.title) },
  };
}

/**
 * Every person, live and archived. `archived: true` lists only the archived
 * ones and the default only the live ones, so this reads both.
 */
async function loadEveryone(db) {
  const out = [];
  for (const archived of [false, true]) {
    const part = [];
    for (let offset = 0; offset < 5000; offset += 200) {
      const { records, total } = await listRecords({ crm, db }, { type: "person", limit: 200, offset, archived });
      part.push(...records.map((r) => ({ ...r, archived })));
      if (part.length >= total || !records.length) break;
    }
    out.push(...part);
  }
  return out;
}

async function main() {
  if (!["dev", "prod"].includes(envName) || !csvPath) throw new Error("usage: upload-contacts.mjs <dev|prod> <contacts.csv> [--apply]");
  const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
  const env = creds.envs?.[envName];
  const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
  const deps = { crm, db };

  const [header, ...lines] = parseCsv(readFileSync(csvPath, "utf8"));
  const col = (title) => {
    const i = header.findIndex((h) => clean(h).toLowerCase() === title.toLowerCase());
    if (i === -1) throw new Error(`The CSV has no "${title}" column.`);
    return i;
  };
  const idx = {
    name: col("Name"), first: col("Given Name"), last: col("Family Name"), org: col("Organization 1 - Name"), title: col("Organization 1 - Title"),
    email: col("E-mail 1 - Value"), email2: col("E-mail 2 - Value"), action: col("Action"), waive: col("Waive call"), group: col("Group"),
  };

  // Later wins: second emails, then main emails; archived, then live. So a
  // live record beats an archived one, and a main address beats a second one.
  const people = await loadEveryone(db);
  const ordered = [...people.filter((p) => p.archived), ...people.filter((p) => !p.archived)];
  const byEmail = new Map();
  for (const p of ordered) { const s = lower(p.fields?.secondaryEmail); if (s) byEmail.set(s, p); }
  for (const p of ordered) { const e = lower(p.primaryEmail ?? p.fields?.email); if (e) byEmail.set(e, p); }
  const waivers = await loadWaivers(db);

  const rows = [];
  for (const line of lines) {
    const cols = Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, line[i]]));
    const plan = planRow(cols);
    if (!plan) continue;
    if (plan.skip) { rows.push({ ...plan, result: "skipped", note: plan.skip }); continue; }
    const existing = byEmail.get(plan.email) ?? (plan.second ? byEmail.get(plan.second) : null) ?? null;
    const f = existing?.fields ?? {};
    const notes = [];
    if (existing && f.applicationId) {
      rows.push({ ...plan, result: "skipped", note: "already applied; the signup flow owns them now" });
      continue;
    }
    const grants = plan.waive ? [plan.email, plan.second].filter(Boolean).filter((e) => !waivers.has(e)) : [];
    if (plan.waive && !grants.length) notes.push("waiver already recorded");
    let labels = null;
    if (plan.action) {
      if (f.journeyAction) notes.push(`keeps current Action ${ACTION_BY_ID[f.journeyAction]?.label ?? f.journeyAction}`);
      else {
        const refusal = refusalFor(plan.action, { path: "relationship_first", admission: null, payment: null, hasApplication: false });
        if (refusal) { rows.push({ ...plan, result: "skipped", note: refusal }); continue; }
        labels = { journeyAction: plan.action, journeyType: typeOf(plan.action), journeyPath: "relationship_first", actionSince: now };
      }
    }
    // Fill blanks only: never overwrite what is already on the record.
    const fill = {};
    for (const [k, v] of Object.entries(plan.fields)) {
      if (!v || k === "name" || k === "email") continue;
      if (existing && clean(String(f[k] ?? ""))) continue;
      if (k === "secondaryEmail" && lower(existing?.primaryEmail) === v) continue;
      fill[k] = v;
    }
    const result = !existing ? "create" : existing.archived ? "restore" : "update";
    rows.push({ ...plan, existing, grants, labels, fill, result, note: notes.join("; ") });
  }

  mkdirSync(new URL("../.odla/review/", import.meta.url), { recursive: true });
  const out = new URL(`../.odla/review/upload-contacts-${envName}.tsv`, import.meta.url);
  const tsv = [["Result", "Name", "Email", "Second email", "Group", "Action", "Waivers for", "Fills", "Note"].join("\t")]
    .concat(rows.map((r) => [
      r.result, r.name, r.email, r.second, r.group ?? "community", r.labels ? ACTION_BY_ID[r.labels.journeyAction].label : "",
      (r.grants ?? []).join(" "), Object.keys(r.fill ?? {}).join(" "), r.note ?? "",
    ].join("\t")));
  writeFileSync(out, tsv.join("\n") + "\n");

  const count = (pred) => rows.filter(pred).length;
  console.log(`${envName}: ${rows.length} rows`);
  console.log(`  create ${count((r) => r.result === "create")}, restore from archive ${count((r) => r.result === "restore")}, update ${count((r) => r.result === "update")}, skip ${count((r) => r.result === "skipped")}`);
  for (const id of Object.values(ACTIONS)) {
    const n = count((r) => r.labels?.journeyAction === id);
    if (n) console.log(`  ${ACTION_BY_ID[id].label}: ${n}`);
  }
  console.log(`  partner ${count((r) => r.group === "partner")}, team ${count((r) => r.group === "team")}`);
  console.log(`  waivers to record: ${rows.reduce((n, r) => n + (r.grants?.length ?? 0), 0)} emails`);
  for (const r of rows.filter((x) => x.result === "skipped")) console.log(`  skipped ${r.name}: ${r.note}`);
  console.log(`Review list: ${out.pathname}`);
  if (!apply) { console.log("Nothing written. Add --apply to write exactly this."); return; }

  let done = 0;
  for (const r of rows) {
    if (r.result === "skipped") continue;
    for (const email of r.grants) {
      const sourceGrantId = crypto.randomUUID();
      const id = `admission:local:${CHAPTER}:${sourceGrantId}`;
      await db.transact([{ t: "update", ns: "admissionGrants", id, attrs: {
        id, sourceGrantId, sourceScope: "local", sourceId: CHAPTER, targetId: CHAPTER, email, emailNormalized: email,
        decision: "waive_interview", note: "Relationship first: known to Tori, call waived (contact list upload)",
        active: true, createdAt: now, createdBy: ACTOR, updatedAt: now, updatedBy: ACTOR,
      } }], { mutationId: `upload-contacts:waiver:${email}` });
    }
    let recordId = r.existing?.id;
    if (r.result === "restore") {
      await setArchived(deps, { id: recordId, archived: false, mutationId: `upload-contacts:restore:${recordId}:${now}` });
      const { getRecord } = await import("@odla-ai/crm");
      r.existing = await getRecord(deps, recordId);
    }
    if (!recordId) {
      const created = await createRecord(deps, {
        type: "person",
        input: { name: r.name, email: r.email, ...r.fill },
        stage: "prospect",
        // Community starts unsubscribed, like call ingest: they have not opted
        // into updates yet. Partners and Team are left unasked, so updates
        // can reach them.
        ...(r.group ? {} : { emailConsent: { state: "unsubscribed", source: "upload-contacts" } }),
      });
      recordId = created.id;
    } else if (Object.keys(r.fill).length) {
      await updateRecord(deps, { id: recordId, input: r.fill, expectedUpdatedAt: r.existing.updatedAt });
    }
    if (r.group) await addTag(deps, { recordId, tag: r.group, mutationId: `upload-contacts:tag:${recordId}:${r.group}` }).catch(() => {});
    if (r.labels) {
      const { getRecord } = await import("@odla-ai/crm");
      const fresh = await getRecord(deps, recordId);
      await updateRecord(deps, {
        id: recordId, input: r.labels, expectedUpdatedAt: fresh.updatedAt,
        audit: {
          id: `journey-upload:${recordId}:${r.labels.journeyAction}`,
          body: `Action: None → ${ACTION_BY_ID[r.labels.journeyAction].label} (contact list upload)`,
          authorId: ACTOR,
          meta: {
            journeyEvent: "action_changed", from: null, to: r.labels.journeyAction, reopened: false,
            occurredAt: now, recordedAt: now, actor: ACTOR, method: "manual",
            sourceType: "upload", sourceId: `upload-contacts:${now}`, dateQuality: "exact", personId: recordId,
          },
        },
      });
    }
    done++;
  }
  console.log(`Wrote ${done} people.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
