// One-off repair for the 2026-10-14 contact upload (Tori). The upload ran
// before it knew about archived people, so twenty people archived that
// morning got a second, new record. The archived one is the real record: it
// holds their Granola call history. Two steps, and Tori approves between them:
//
//   node _scripts/repair-upload-duplicates.mjs prod            review only, writes nothing
//   node _scripts/repair-upload-duplicates.mjs prod --apply    writes exactly what it showed
//
// For every email that has exactly one live record and one archived record:
//   1. the archived original comes back from the archive;
//   2. it takes the new record's Path, Action and Type (only if it has no
//      Action of its own), its partner or team tag, and any profile field it
//      is missing (first and last name, second email, organization, title);
//   3. the new duplicate is archived. Nothing is deleted.
// Anything else (two live records, no archived one) is reported and left.
// Waivers are per email, so they need no repair. Safe to run again: once an
// email has its older original live, there is nothing left to do.

import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
import { addTag, getRecord, listRecords, listTags, setArchived, updateRecord } from "@odla-ai/crm";
import { crm } from "../src/crm.mjs";
import { ACTION_BY_ID } from "../src/labels.mjs";

const envName = process.argv[2];
const apply = process.argv.includes("--apply");
if (!["dev", "prod"].includes(envName)) throw new Error("usage: repair-upload-duplicates.mjs <dev|prod> [--apply]");
const creds = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const env = creds.envs?.[envName];
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: "https://db.odla.ai" });
const deps = { crm, db };
const ACTOR = "tori@silverandsaltcapital.com";
const now = Date.now();
const PROFILE = ["firstName", "lastName", "secondaryEmail", "organization", "title"];
const LABELS = ["journeyAction", "journeyType", "journeyPath", "actionSince"];
const GROUP_TAGS = ["partner", "team"];
const str = (v) => (typeof v === "string" ? v.trim() : "");

async function load(archived) {
  const out = [];
  for (let offset = 0; offset < 5000; offset += 200) {
    const { records, total } = await listRecords(deps, { type: "person", limit: 200, offset, archived });
    out.push(...records);
    if (out.length >= total || !records.length) break;
  }
  return out;
}

const byEmail = new Map();
for (const [archived, list] of [[false, await load(false)], [true, await load(true)]]) {
  for (const r of list) {
    const e = str(r.primaryEmail).toLowerCase();
    if (!e) continue;
    const slot = byEmail.get(e) ?? { live: [], archived: [] };
    slot[archived ? "archived" : "live"].push(r);
    byEmail.set(e, slot);
  }
}

const plans = [];
const odd = [];
for (const [email, { live, archived }] of byEmail) {
  if (!archived.length) continue;
  if (!live.length) continue; // only archived: not touched by the upload
  if (live.length !== 1 || archived.length !== 1) { odd.push(`${email}: ${live.length} live, ${archived.length} archived`); continue; }
  const dup = live[0];
  const orig = archived[0];
  // The duplicate is the newer record. Once repaired, the live one is the
  // older original, so a second run leaves the pair alone.
  if (!((dup.createdAt ?? 0) > (orig.createdAt ?? 0))) continue;
  const df = dup.fields ?? {};
  const of = orig.fields ?? {};
  // Only repair a duplicate the upload made: it has no application.
  if (str(df.applicationId)) { odd.push(`${email}: the live record has an application`); continue; }
  const input = {};
  for (const k of PROFILE) if (str(df[k]) && !str(of[k])) input[k] = df[k];
  const takesLabels = str(df.journeyAction) && !str(of.journeyAction) && !str(of.applicationId);
  if (takesLabels) for (const k of LABELS) if (df[k] !== undefined) input[k] = df[k];
  const tags = (await listTags(deps, dup.id)).map((t) => t.tag ?? t).filter((t) => GROUP_TAGS.includes(t));
  plans.push({ email, name: orig.name, dup, orig, input, tags, takesLabels, keeps: str(of.journeyAction) });
}

console.log(`${envName}: ${plans.length} duplicates to repair`);
for (const p of plans) {
  const action = p.takesLabels ? ACTION_BY_ID[p.input.journeyAction]?.label : p.keeps ? `keeps ${ACTION_BY_ID[p.keeps]?.label ?? p.keeps}` : "no Action";
  console.log(`  ${p.name}: restore original, ${action}${p.tags.length ? `, tag ${p.tags.join(" ")}` : ""}, fills ${Object.keys(p.input).filter((k) => PROFILE.includes(k)).join(" ") || "nothing"}`);
}
for (const o of odd) console.log(`  left alone: ${o}`);
if (!apply) { console.log("Nothing written. Add --apply to write exactly this."); process.exit(0); }

let done = 0;
for (const p of plans) {
  // The original goes live first, so the person is never missing.
  await setArchived(deps, { id: p.orig.id, archived: false, mutationId: `repair-upload:restore:${p.orig.id}:${now}` });
  const fresh = await getRecord(deps, p.orig.id);
  if (Object.keys(p.input).length) {
    await updateRecord(deps, {
      id: p.orig.id, input: p.input, expectedUpdatedAt: fresh.updatedAt,
      ...(p.takesLabels ? { audit: {
        id: `journey-upload-repair:${p.orig.id}:${p.input.journeyAction}`,
        body: `Action: None → ${ACTION_BY_ID[p.input.journeyAction].label} (contact list upload)`,
        authorId: ACTOR,
        meta: {
          journeyEvent: "action_changed", from: null, to: p.input.journeyAction, reopened: false,
          occurredAt: p.input.actionSince ?? now, recordedAt: now, actor: ACTOR, method: "manual",
          sourceType: "upload", sourceId: `repair-upload:${p.dup.id}`, dateQuality: "exact", personId: p.orig.id,
        },
      } } : {}),
    });
  }
  for (const tag of p.tags) await addTag(deps, { recordId: p.orig.id, tag, mutationId: `repair-upload:tag:${p.orig.id}:${tag}` }).catch(() => {});
  await setArchived(deps, { id: p.dup.id, archived: true, mutationId: `repair-upload:archive:${p.dup.id}:${now}` });
  done++;
}
console.log(`Repaired ${done}.`);
