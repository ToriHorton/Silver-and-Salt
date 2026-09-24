// Meeting and call ingest: external call notes -> CRM activity feed.
//
// This is the replacement for the old file-based dashboard intake
// (granola-inbox.js + task-decisions.json + a published static page). That
// design re-proposed the same work every morning, so a decision ledger had to
// be maintained by hand to suppress it. Everything that ledger did is done
// here by the database instead:
//
//   - `addActivity` takes a deterministic `mutationId` and returns
//     `{ id, duplicate }`, so replaying the same meeting is a no-op. Duplicate
//     suppression is structural, not a list of things to remember.
//   - A follow-up is a `kind: "task"` activity with status/dueAt/waitingOn.
//     Tori triages it in the admin CRM panel and the verdict lives in the row,
//     so "done" and "not a task" survive without a ledger file.
//   - Call history hangs off the person, not off a date. Opening a member
//     shows every call with them, in order.
//
// The pipeline stays authoritative in `applications.status` exactly as
// src/crm-sync.mjs describes: this module never calls setStage on a person who
// already exists, so an ingest can never move someone's application status.
// The one stage it ever sets is the initial `candidate` on a person it just
// created, who by definition has no application to contradict.
//
// Pure data + CRM calls, no HTTP: the route in src/worker.ts owns auth and
// parsing, and this owns the mapping. That split keeps it unit-testable
// without a Worker.

import { createRecord, updateRecord, addActivity, addTag, upsertRecordOrigin } from "@odla-ai/crm";
import { crm } from "./crm.mjs";

// The promoted slot columns behind the two relationship-temperature fields,
// read off the config rather than hardcoded, so moving a field to a different
// slot in src/crm.mjs does not silently break the counter read here.
const PERSON_FIELDS = crm.config.types.person.fields;
const CALL_COUNT_SLOT = PERSON_FIELDS.callCount?.slot;
const LAST_CALL_SLOT = PERSON_FIELDS.lastCallAt?.slot;

// Payload version stamped onto record origins, so a later mapper change can
// tell which shape a person was first created from.
export const INGEST_PAYLOAD_VERSION = 1;

// Activity kinds this module is allowed to write. Deliberately excludes
// `stage_change` and `system`, which belong to the operational flows, so a
// leaked ingest credential cannot forge pipeline history.
export const INGEST_ACTIVITY_KINDS = ["call", "meeting", "note"];

// Addresses that are Tori / the chapter itself. These are never turned into
// CRM people: the point of a call record is the other side of the call.
export const SELF_EMAILS = new Set([
  "tori@silverandsaltcapital.com",
]);

const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const normEmail = (v) => str(v).trim().toLowerCase();

/** True for addresses that belong to the chapter rather than a counterparty. */
export function isSelfEmail(email) {
  const e = normEmail(email);
  if (!e) return true;
  if (SELF_EMAILS.has(e)) return true;
  return e.endsWith("@silverandsaltcapital.com");
}

/**
 * Resolve a due date to an epoch-ms timestamp.
 * Accepts a number (passed through), or "YYYY-MM-DD", which is anchored at
 * 12:00 UTC rather than midnight so that rendering the date back in any US
 * timezone never rolls it to the previous day.
 * Returns undefined for anything unparseable, so a bad date drops the due
 * stamp instead of failing the whole meeting.
 */
export function parseDue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = str(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isFinite(ms) ? ms : undefined;
}

/** A display name for a person we only know from a calendar attendee line. */
function attendeeName(att) {
  const name = str(att?.name).trim();
  if (name) return name;
  const email = normEmail(att?.email);
  return email ? email.split("@")[0] : "";
}

/**
 * Find the CRM person for an email, creating one at `candidate` if absent.
 *
 * Resolution is by lowercased primary email, the same key src/crm-sync.mjs
 * uses, so a person the application flow later syncs lands on this same record
 * instead of forking a duplicate.
 *
 * A created record is marked `unsubscribed` on purpose. Someone who appeared
 * on a call has not opted into marketing, and the CRM's consent gate skips
 * unsubscribed contacts for `marketing`-class templates while still allowing
 * the `transactional` 1:1 `personal` template. So Tori can follow up
 * personally, and a candidate can never be swept into an announcement blast
 * they never asked for.
 */
export async function resolvePerson(db, attendee) {
  const email = normEmail(attendee?.email);
  if (!email) return null;

  const deps = { crm, db };
  const { crm_record } = await db.query({
    crm_record: { $: { where: { type: "person", primaryEmail: email }, limit: 1 } },
  });
  const existing = crm_record?.[0] ?? null;
  if (existing) return { recordId: existing.id, created: false, email, row: existing };

  const created = await createRecord(deps, {
    type: "person",
    input: { name: attendeeName(attendee) || email, email },
    stage: "candidate",
    emailConsent: { state: "unsubscribed", source: "crm-ingest:auto-created" },
    mutationId: `ingest:person:${email}`,
  });

  // Provenance, so an auto-created person is distinguishable from an applicant
  // in both the tag rail and the record's origin list.
  await addTag(deps, {
    recordId: created.id,
    tag: "auto-created",
    mutationId: `ingest:tag:auto:${created.id}`,
  }).catch(() => {});

  return { recordId: created.id, created: true, email, row: null };
}

/**
 * Bump the relationship-temperature counters after a call actually landed.
 *
 * Only ever called for a NON-duplicate activity, so a replay cannot inflate
 * the count. `lastCallAt` moves forward only, so ingesting an older meeting
 * after a newer one does not rewrite the person as colder than they are.
 *
 * Best-effort: a counter is a convenience for sorting, and must never be the
 * reason a call fails to be recorded. The activity is already written by the
 * time this runs.
 */
export async function bumpCallCounters(db, person, occurredAt) {
  if (!CALL_COUNT_SLOT && !LAST_CALL_SLOT) return;
  const row = person.row ?? {};
  const priorCount = Number(row[CALL_COUNT_SLOT]) || 0;
  const priorLast = Number(row[LAST_CALL_SLOT]) || 0;
  const when = typeof occurredAt === "number" && Number.isFinite(occurredAt) ? occurredAt : Date.now();

  const input = { callCount: priorCount + 1 };
  if (when > priorLast) input.lastCallAt = when;

  try {
    await updateRecord({ crm, db }, { id: person.recordId, input });
  } catch (err) {
    console.error(
      "crm-ingest: call counters not updated (non-fatal)",
      person.email,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Ingest one meeting.
 *
 * Shape:
 *   {
 *     sourceId: "granola",
 *     meetingId: "<stable upstream id>",   // the idempotency anchor
 *     title, summary, url,
 *     kind: "call" | "meeting" | "note",
 *     occurredAt: <epoch ms>,
 *     attendees: [{ email, name }],
 *     actionItems: [{ text, owner, due }],
 *   }
 *
 * The meeting activity is written to EVERY external attendee, so the call
 * shows up on each of their timelines. Follow-up tasks are written only to the
 * primary (first resolved) attendee, so a 3-person call does not triple every
 * action item. Action items with no resolvable person are returned as
 * `unattached` rather than being parked on an arbitrary record.
 */
export async function ingestMeeting(db, meeting) {
  const deps = { crm, db };
  const sourceId = str(meeting?.sourceId) || "granola";
  const meetingId = str(meeting?.meetingId).trim();
  if (!meetingId) throw new Error("crm-ingest: meetingId is required");

  const kind = INGEST_ACTIVITY_KINDS.includes(str(meeting?.kind))
    ? str(meeting.kind)
    : "meeting";

  const title = str(meeting?.title).trim() || "Untitled meeting";
  const summary = str(meeting?.summary).trim();
  const url = str(meeting?.url).trim();
  const occurredAt =
    typeof meeting?.occurredAt === "number" && Number.isFinite(meeting.occurredAt)
      ? meeting.occurredAt
      : undefined;

  // External attendees only, de-duplicated by address.
  const seen = new Set();
  const externals = [];
  for (const att of Array.isArray(meeting?.attendees) ? meeting.attendees : []) {
    const email = normEmail(att?.email);
    if (!email || seen.has(email) || isSelfEmail(email)) continue;
    seen.add(email);
    externals.push(att);
  }

  const people = [];
  const createdPeople = [];
  for (const att of externals) {
    const resolved = await resolvePerson(db, att);
    if (!resolved) continue;
    people.push(resolved);
    if (resolved.created) createdPeople.push(resolved.email);

    // Bind the upstream identity for provenance and future re-matching.
    await upsertRecordOrigin(deps, {
      recordId: resolved.recordId,
      sourceId,
      sourceRecordId: resolved.email,
      ...(url ? { sourceUrl: url } : {}),
      payloadVersion: INGEST_PAYLOAD_VERSION,
      mutationId: `ingest:origin:${sourceId}:${resolved.email}`,
    }).catch(() => {});
  }

  // The call body. Kept as plain text so it reads correctly in the record
  // panel without a renderer.
  const body = [title, summary].filter(Boolean).join("\n\n");

  let activitiesWritten = 0;
  let activitiesDuplicate = 0;
  for (const person of people) {
    const res = await addActivity(deps, {
      recordId: person.recordId,
      kind,
      body,
      authorId: "system",
      meta: {
        source: sourceId,
        meetingId,
        title,
        ...(url ? { url } : {}),
        ...(occurredAt ? { occurredAt } : {}),
        attendees: externals.map((a) => normEmail(a.email)).filter(Boolean),
      },
      // The idempotency anchor: same meeting + same person = same id forever.
      mutationId: `ingest:${sourceId}:${meetingId}:${person.recordId}`,
    });
    if (res.duplicate) {
      activitiesDuplicate++;
    } else {
      activitiesWritten++;
      // Only on a real write, so a replay never inflates the count.
      await bumpCallCounters(db, person, occurredAt);
    }
  }

  // Follow-ups, attached to the primary attendee.
  const primary = people[0] ?? null;
  const items = Array.isArray(meeting?.actionItems) ? meeting.actionItems : [];
  let tasksWritten = 0;
  let tasksDuplicate = 0;
  const unattached = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = str(item?.text).trim();
    if (!text) continue;
    if (!primary) {
      unattached.push(text);
      continue;
    }
    const due = parseDue(item?.due);
    const owner = str(item?.owner).trim();
    const res = await addActivity(deps, {
      recordId: primary.recordId,
      kind: "task",
      body: text,
      authorId: "system",
      ...(due ? { dueAt: due } : {}),
      // `waitingOn` is the CRM's own "this is somebody else's move" field, so
      // a delegated item lands on the waiting board instead of Tori's open list.
      ...(owner ? { waitingOn: owner } : {}),
      meta: { source: sourceId, meetingId, title, ...(url ? { url } : {}) },
      // Index-based, so the same meeting replays onto the same task rows.
      mutationId: `ingest:${sourceId}:${meetingId}:task:${i}`,
    });
    if (res.duplicate) tasksDuplicate++;
    else tasksWritten++;
  }

  return {
    meetingId,
    title,
    people: people.map((p) => p.email),
    createdPeople,
    activitiesWritten,
    activitiesDuplicate,
    tasksWritten,
    tasksDuplicate,
    unattached,
  };
}

/**
 * Ingest a batch of meetings. One failure never sinks the batch: the error is
 * captured per meeting and the rest still land, because a morning pull that
 * drops everything over one malformed note is worse than a partial one.
 */
export async function ingestBatch(db, payload) {
  const meetings = Array.isArray(payload?.meetings) ? payload.meetings : [];
  const results = [];
  const errors = [];
  for (const meeting of meetings) {
    try {
      results.push(await ingestMeeting(db, meeting));
    } catch (err) {
      errors.push({
        meetingId: str(meeting?.meetingId),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const sum = (k) => results.reduce((n, r) => n + r[k], 0);
  return {
    meetings: results.length,
    peopleCreated: results.flatMap((r) => r.createdPeople),
    activitiesWritten: sum("activitiesWritten"),
    activitiesDuplicate: sum("activitiesDuplicate"),
    tasksWritten: sum("tasksWritten"),
    tasksDuplicate: sum("tasksDuplicate"),
    unattached: results.flatMap((r) => r.unattached),
    results,
    errors,
  };
}
