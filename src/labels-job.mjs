// The labels job: keeps Type, Path, Action and the event history current on
// every person who has an application, from Chapter's own rows. Runs on the
// five-minute cron (src/worker-chapter.ts) once SIGNUP_LABELS is "on", and is
// the same code the backfill (_scripts/backfill-labels.mjs) runs to build
// Tori's review list. Rules live in src/labels.mjs; this file reads and writes.
//
// Safe to run any number of times:
//   - every event is written with a stable mutation id (labels.eventId), so a
//     replay is refused as a duplicate by the database;
//   - labels are written with the record's last-updated time, so if anyone
//     changed the person first the write is refused and the next run retries
//     from fresh reads;
//   - the job never touches the CRM stage, which Chapter's sync owns, and
//     never writes a person who has no application (Tori labels those, and the
//     backfill only writes after her review).

import { addActivity, listRecords, updateRecord } from "@odla-ai/crm";
import { crm } from "./crm.mjs";
import {
  ACTION_BY_ID, admissionOf, attemptOf, eventBody, eventId, eventMeta, flagsFor, initialPath,
  nextAction, paymentOf, systemEventsFor, typeOf,
} from "./labels.mjs";

const REMINDER_TEMPLATES = ["bookingReminder", "bookingReminderFree", "paymentReminder"];
const str = (v) => (typeof v === "string" ? v : "");
const lower = (v) => str(v).trim().toLowerCase();

function inRuntime(app, runtime) {
  if (runtime) return app.stripeRuntime === runtime;
  return app.stripeRuntime === undefined || app.stripeRuntime === "default";
}

/** Every person record, paged. */
export async function loadPeople(db) {
  const deps = { crm, db };
  const out = [];
  for (let offset = 0; offset < 5000; offset += 200) {
    const { records, total } = await listRecords(deps, { type: "person", limit: 200, offset, archived: false });
    out.push(...records);
    if (out.length >= total || !records.length) break;
  }
  return out;
}

/** Everything the rules need, read once per run. */
export async function loadFacts(db, chapterId, runtime) {
  const data = await db.query({
    applications: { $: { where: { groupId: chapterId }, limit: 1000 } },
    meetings: { $: { where: { groupId: chapterId }, limit: 1000 } },
    tiers: { $: { where: { groupId: chapterId }, limit: 50 } },
  });
  // One read per receipt kind: a single query is capped at 1,000 rows.
  const receiptReads = await Promise.all(
    ["first_payment", "renewal", "renewal_failed"].map((kind) =>
      db.query({ stripeEventReceipts: { $: { where: { kind }, limit: 1000 } } }),
    ),
  );
  data.stripeEventReceipts = receiptReads.flatMap((r) => r.stripeEventReceipts ?? []);
  const logs = await Promise.all(
    REMINDER_TEMPLATES.map((template) => db.query({ emailLog: { $: { where: { template }, limit: 1000 } } })),
  );
  const apps = (data.applications ?? []).filter((a) => inRuntime(a, runtime));
  const freeTiers = new Set(
    (data.tiers ?? []).filter((t) => t.free === true || t.priceCents === 0).map((t) => String(t.id ?? "")),
  );
  const paidAt = new Map();
  const renewals = new Map();
  const failures = new Map();
  for (const r of data.stripeEventReceipts ?? []) {
    const appId = str(r.applicationId);
    const at = typeof r.receivedAt === "number" ? r.receivedAt : null;
    if (!appId || at === null) continue;
    const item = { id: String(r.id ?? r.eventId), at };
    if (r.kind === "first_payment") {
      const prior = paidAt.get(appId);
      if (!prior || at < prior.at) paidAt.set(appId, item);
    } else if (r.kind === "renewal") {
      renewals.set(appId, [...(renewals.get(appId) ?? []), item]);
    } else if (r.kind === "renewal_failed") {
      failures.set(appId, [...(failures.get(appId) ?? []), item]);
    }
  }
  // The newest booked meeting per application that was not cancelled.
  const meetingFor = new Map();
  for (const m of data.meetings ?? []) {
    if (str(m.status) === "canceled" || str(m.status) === "cancelled") continue;
    const appId = str(m.applicationId);
    const at = typeof m.createdAt === "number" ? m.createdAt : null;
    const startAt = typeof m.startAt === "number" ? m.startAt : null;
    const prior = meetingFor.get(appId);
    if (!prior || (at ?? 0) > (prior.at ?? 0)) meetingFor.set(appId, { id: String(m.id), at, startAt });
  }
  const reminders = new Map();
  logs.forEach((res, i) => {
    for (const row of res.emailLog ?? []) {
      if (row.error && row.deliveryState !== "sent") continue;
      const appId = str(row.applicationId);
      if (!appId) continue;
      const at = typeof row.sentAt === "number" ? row.sentAt : typeof row.createdAt === "number" ? row.createdAt : null;
      reminders.set(appId, [...(reminders.get(appId) ?? []), { id: String(row.id), at, type: REMINDER_TEMPLATES[i] }]);
    }
  });
  return { apps, freeTiers, paidAt, renewals, failures, meetingFor, reminders };
}

/**
 * What one person's labels and events should be. Pure apart from its inputs,
 * so the backfill can show it without writing it.
 */
export function planPerson(record, app, all, { now, nowQuality, pathOverride = null }) {
  const f = record.fields ?? {};
  const appId = app ? String(app.id) : null;
  const facts = {
    freeTiers: all.freeTiers,
    paidAt: all.paidAt,
    meeting: appId ? all.meetingFor.get(appId) ?? null : null,
    renewals: appId ? all.renewals.get(appId) ?? [] : [],
    renewalFailures: appId ? all.failures.get(appId) ?? [] : [],
    reminded: appId ? (all.reminders.get(appId) ?? []).length > 0 : false,
    now,
    nowQuality,
  };
  const knownBeforeApplying = !!app && typeof app.createdAt === "number" && record.createdAt < app.createdAt - 60_000;
  // Tori's answer for a person already on record wins over the guess (backfill only).
  const path = initialPath({ existingPath: str(f.journeyPath) || pathOverride, app, knownBeforeApplying });
  const { admission, waiverSource } = admissionOf(app);
  const payment = paymentOf(app, all.freeTiers);
  const attempt = attemptOf(app);
  const sys = systemEventsFor(app, facts);
  const reminderEvents = (appId ? all.reminders.get(appId) ?? [] : []).map((r) => ({
    event: "reminder_sent", occurredAt: r.at ?? now, sourceType: "email", sourceId: r.id, dateQuality: r.at ? "exact" : nowQuality ?? "estimated", attempt, reminderType: r.type,
  }));
  const current = str(f.journeyAction) || null;
  const action = nextAction({ current, currentAttempt: str(f.attempt) || null, systemAction: sys.action, attempt });
  const since = action !== current
    ? (sys.events.filter((e) => e.event === action).at(-1)?.occurredAt ?? now)
    : (typeof f.actionSince === "number" ? f.actionSince : null);
  const flags = flagsFor({ action, app, facts, revisitAt: typeof f.revisitAt === "number" ? f.revisitAt : null });
  const labels = {
    journeyPath: path,
    journeyAction: action,
    journeyType: typeOf(action),
    admission,
    waiverSource,
    payment,
    attempt,
    ...(since !== null ? { actionSince: since } : {}),
    journeyFlags: flags.join(","),
  };
  const changed = Object.entries(labels).some(([k, v]) => (f[k] ?? null) !== (v ?? null));
  return { recordId: record.id, current, labels, changed, events: [...sys.events, ...reminderEvents] };
}

/** Write one plan: events first, then the labels. */
export async function applyPlan(db, record, plan, { now, method = "automatic" }) {
  const deps = { crm, db };
  let written = 0;
  for (const e of plan.events) {
    const res = await addActivity(deps, {
      recordId: record.id,
      kind: "system",
      body: eventBody(e),
      authorId: "system",
      meta: { ...eventMeta(e, { personId: record.id, actor: "system", method, recordedAt: now }), ...(e.reminderType ? { reminderType: e.reminderType } : {}) },
      mutationId: eventId({ personId: record.id, event: e.event, sourceType: e.sourceType, sourceId: e.sourceId }),
    });
    if (!res.duplicate) written++;
  }
  if (!plan.changed) return { events: written, labels: false };
  const from = plan.current;
  const to = plan.labels.journeyAction;
  const moved = to && from !== to;
  try {
    await updateRecord(deps, {
      id: record.id,
      input: plan.labels,
      expectedUpdatedAt: record.updatedAt,
      ...(moved
        ? {
            audit: {
              id: `journey-action:${record.id}:${plan.labels.attempt ?? "none"}:${from ?? "none"}:${to}`,
              body: eventBody({ event: to }, from, to),
              authorId: "system",
              meta: { journeyEvent: "action_changed", from, to, recordedAt: now, actor: "system", method },
            },
          }
        : {}),
    });
    return { events: written, labels: true };
  } catch (err) {
    // Someone changed the person first: the next run recomputes from fresh reads.
    console.error("labels: update refused, will retry", record.id, err instanceof Error ? err.message : err);
    return { events: written, labels: false, retry: true };
  }
}

/**
 * One pass over every applicant. `write: false` returns the plans without
 * writing (the backfill's review list).
 */
export async function runLabels(db, chapterId, runtime, { now = Date.now(), nowQuality = "exact", write = true, pathOverrides = new Map() } = {}) {
  const [people, all] = await Promise.all([loadPeople(db), loadFacts(db, chapterId, runtime)]);
  const byAppId = new Map();
  const byEmail = new Map();
  for (const p of people) {
    const appId = str(p.fields?.applicationId);
    if (appId) byAppId.set(appId, p);
    const email = lower(p.primaryEmail ?? p.fields?.email);
    if (email) byEmail.set(email, p);
  }
  const plans = [];
  const summary = { people: 0, events: 0, labels: 0, retries: 0, unmatched: 0 };
  for (const app of all.apps) {
    const record = byAppId.get(String(app.id)) ?? byEmail.get(lower(app.email));
    if (!record) { summary.unmatched++; continue; }
    const plan = planPerson(record, app, all, { now, nowQuality, pathOverride: pathOverrides.get(lower(record.primaryEmail ?? app.email)) ?? null });
    plans.push({ record, app, plan });
    summary.people++;
    if (!write) continue;
    const res = await applyPlan(db, record, plan, { now });
    summary.events += res.events;
    if (res.labels) summary.labels++;
    if (res.retry) summary.retries++;
  }
  // Prospects already labelled by Tori: keep their flags current (Revisit due).
  for (const p of people) {
    const f = p.fields ?? {};
    if (str(f.applicationId) || !str(f.journeyAction)) continue;
    const flags = flagsFor({ action: f.journeyAction, app: null, facts: { now }, revisitAt: typeof f.revisitAt === "number" ? f.revisitAt : null }).join(",");
    if ((f.journeyFlags ?? "") === flags) continue;
    plans.push({ record: p, app: null, plan: { recordId: p.id, current: f.journeyAction, labels: { journeyFlags: flags }, changed: true, events: [] } });
    if (write) {
      try {
        await updateRecord({ crm, db }, { id: p.id, input: { journeyFlags: flags }, expectedUpdatedAt: p.updatedAt });
      } catch { summary.retries++; }
    }
  }
  return { summary, plans };
}

/** The cron entry: does nothing until SIGNUP_LABELS is "on". */
export async function labelsTick(context, env, { now = Date.now() } = {}) {
  if (env?.SIGNUP_LABELS !== "on") return { skipped: "off" };
  const runtime = typeof env.ODLA_RUNTIME === "string" ? env.ODLA_RUNTIME : undefined;
  const { summary } = await runLabels(context.makeDb(env), context.chapter.id, runtime, { now, nowQuality: "exact", write: true });
  return summary;
}

export { ACTION_BY_ID };
