// Admin routes behind the person's Action tab (src/app/admin/action-tab.jsx).
//
//   GET  /api/admin/labels/person?recordId=…   labels, history, and the Actions
//                                              Tori may set by hand
//   POST /api/admin/labels/person/action       set one Action by hand
//
// Setting goes through the same rules as the job (src/labels.mjs): an Action
// that moves money or access is refused here, with the name of the button that
// does the real work, because the label must follow the operation, never the
// other way round. Writes carry the record's last-updated time, so two people
// editing at once cannot overwrite each other silently.

import { addActivity, getRecord, listActivities, listRecords, updateRecord } from "@odla-ai/crm";
import { crm } from "./crm.mjs";
import {
  ACTION_BY_ID, EVENT_LABELS, KEEP_INFORMED_DAYS, PATH_LABELS, TYPE_LABELS, manualActionsFor, refusalFor, typeOf,
} from "./labels.mjs";

export const LABELS_PERSON_PATH = "/api/admin/labels/person";
export const LABELS_ACTION_PATH = "/api/admin/labels/person/action";
export const LABELS_PEOPLE_PATH = "/api/admin/labels/people";
export const LABELS_DISMISS_PATH = "/api/admin/labels/person/dismiss";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const str = (v) => (typeof v === "string" ? v : "");

/** Who this person is, for the validity rules. */
export function personFacts(record) {
  const f = record?.fields ?? {};
  const hasApplication = !!str(f.applicationId);
  return {
    path: str(f.journeyPath) || (hasApplication ? null : "relationship_first"),
    admission: str(f.admission) || null,
    payment: str(f.payment) || null,
    hasApplication,
  };
}

/** The labels as the tab shows them. */
export function labelsView(record) {
  const f = record?.fields ?? {};
  const action = str(f.journeyAction) || null;
  return {
    action,
    actionLabel: action ? ACTION_BY_ID[action]?.label ?? action : null,
    type: typeOf(action),
    typeLabel: TYPE_LABELS[typeOf(action)] ?? null,
    path: str(f.journeyPath) || null,
    pathLabel: PATH_LABELS[str(f.journeyPath)] ?? null,
    admission: str(f.admission) || null,
    waiverSource: str(f.waiverSource) || null,
    payment: str(f.payment) || null,
    actionSince: typeof f.actionSince === "number" ? f.actionSince : null,
    revisitAt: typeof f.revisitAt === "number" ? f.revisitAt : null,
    flags: str(f.journeyFlags).split(",").filter(Boolean),
    proposal: str(f.proposedAction)
      ? { action: str(f.proposedAction), label: ACTION_BY_ID[str(f.proposedAction)]?.label ?? str(f.proposedAction), evidence: str(f.proposalEvidence), reason: str(f.proposalReason) }
      : null,
  };
}

const CLEAR_PROPOSAL = { proposedAction: "", proposalEvidence: "", proposalReason: "" };

/** The history, oldest first, from the person's activity log. */
export function historyFrom(activities) {
  return (activities ?? [])
    .map((a) => {
      const m = typeof a.meta === "string" ? safeJson(a.meta) : a.meta ?? {};
      if (!m || !m.journeyEvent) return null;
      const label = ACTION_BY_ID[m.journeyEvent]?.label ?? EVENT_LABELS[m.journeyEvent] ?? null;
      return {
        id: a.id,
        event: m.journeyEvent,
        label: m.journeyEvent === "action_changed" ? `${ACTION_BY_ID[m.from]?.label ?? m.from ?? "None"} → ${ACTION_BY_ID[m.to]?.label ?? m.to}` : label ?? m.journeyEvent,
        occurredAt: typeof m.occurredAt === "number" ? m.occurredAt : a.createdAt,
        recordedAt: typeof m.recordedAt === "number" ? m.recordedAt : a.createdAt,
        actor: m.actor ?? a.authorId ?? "system",
        method: m.method ?? "automatic",
        sourceType: m.sourceType ?? null,
        dateQuality: m.dateQuality ?? "exact",
        reminderType: m.reminderType ?? null,
      };
    })
    .filter(Boolean)
    .sort((x, y) => x.occurredAt - y.occurredAt || x.recordedAt - y.recordedAt);
}

/**
 * The events a person's curves are drawn from: every journey event, plus each
 * hand-set Action change read as reaching that Action on that day.
 */
export function curveEvents(activities) {
  const seen = new Set();
  const out = [];
  for (const a of activities ?? []) {
    const m = typeof a.meta === "string" ? safeJson(a.meta) : a.meta ?? {};
    if (!m?.journeyEvent) continue;
    const event = m.journeyEvent === "action_changed" ? m.to : m.journeyEvent;
    if (!event) continue;
    const occurredAt = typeof m.occurredAt === "number" ? m.occurredAt : a.createdAt;
    const key = `${event}:${m.attempt ?? ""}:${occurredAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ event, occurredAt, dateQuality: m.dateQuality ?? "exact", attempt: m.attempt ?? null });
  }
  return out.sort((x, y) => x.occurredAt - y.occurredAt);
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

async function adminOrError(req, env, ctx) {
  const user = await ctx.verifyUser(req, env);
  if (!user) return { error: json({ error: "unauthorized" }, 401) };
  const db = ctx.makeDb(env);
  if (!(await ctx.isAdmin(db, user))) return { error: json({ error: "forbidden" }, 403) };
  return { user, db };
}

/** Is there a live "Waive interview" decision for this email? Invited needs one. */
async function hasWaiver(db, email) {
  const e = str(email).trim().toLowerCase();
  if (!e) return false;
  const { admissionGrants } = await db.query({ admissionGrants: { $: { where: { emailNormalized: e }, limit: 20 } } });
  const now = Date.now();
  return (admissionGrants ?? []).some(
    (g) => str(g.decision || "waive_interview") === "waive_interview" && g.active !== false && !(typeof g.expiresAt === "number" && g.expiresAt <= now),
  );
}

export const labelsRoute = async (req, url, env, ctx) => {
  if (url.pathname === LABELS_PERSON_PATH && req.method === "GET") {
    const auth = await adminOrError(req, env, ctx);
    if (auth.error) return auth.error;
    const recordId = url.searchParams.get("recordId") ?? "";
    const deps = { crm, db: auth.db };
    const record = await getRecord(deps, recordId);
    if (!record || record.type !== "person") return json({ error: "not found" }, 404);
    const activities = await listActivities(deps, { recordId, limit: 500 });
    const person = personFacts(record);
    return json({
      recordId,
      updatedAt: record.updatedAt,
      labels: labelsView(record),
      history: historyFrom(activities),
      options: manualActionsFor(person).map((id) => ({ id, label: ACTION_BY_ID[id].label })),
    });
  }

  if (url.pathname === LABELS_PEOPLE_PATH && req.method === "GET") {
    const auth = await adminOrError(req, env, ctx);
    if (auth.error) return auth.error;
    const deps = { crm, db: auth.db };
    const records = [];
    for (let offset = 0; offset < 5000; offset += 200) {
      const { records: page, total } = await listRecords(deps, { type: "person", limit: 200, offset, archived: false });
      records.push(...page);
      if (records.length >= total || !page.length) break;
    }
    const people = [];
    for (const r of records) {
      const f = r.fields ?? {};
      const action = str(f.journeyAction) || null;
      const activities = await listActivities(deps, { recordId: r.id, limit: 500 });
      people.push({
        id: r.id,
        name: r.name,
        type: typeOf(action),
        path: str(f.journeyPath) || null,
        action,
        tier: str(f.tier) || str(r.s4) || null,
        admission: str(f.admission) || null,
        payment: str(f.payment) || null,
        actionSince: typeof f.actionSince === "number" ? f.actionSince : null,
        flags: str(f.journeyFlags).split(",").filter(Boolean),
        events: curveEvents(activities),
      });
    }
    return json({ people, now: Date.now() });
  }

  if (url.pathname === LABELS_ACTION_PATH && req.method === "POST") {
    const auth = await adminOrError(req, env, ctx);
    if (auth.error) return auth.error;
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
    const recordId = str(body?.recordId);
    const action = str(body?.action);
    const method = body?.method === "confirmed" ? "confirmed" : "manual";
    const evidence = str(body?.evidence);
    const deps = { crm, db: auth.db };
    const record = await getRecord(deps, recordId);
    if (!record || record.type !== "person") return json({ error: "not found" }, 404);
    const person = personFacts(record);
    const refusal = refusalFor(action, person);
    if (refusal) return json({ error: refusal }, 400);
    if (action === "invited" && !(await hasWaiver(auth.db, record.primaryEmail ?? record.fields?.email))) {
      return json({ error: "Record Waive interview for their email under Admission first; Invited needs it, because a waiver only counts if it exists before they apply." }, 400);
    }
    const f = record.fields ?? {};
    // Confirming checks the proposal is still the one Tori saw; if the person
    // moved on since, the proposal is stale and nothing changes.
    if (method === "confirmed" && (str(f.proposedAction) !== action || str(f.proposalEvidence) !== evidence)) {
      return json({ error: "This proposal is out of date: the person changed since it was made. Refresh to see where they are now." }, 409);
    }
    const now = Date.now();
    const from = str(f.journeyAction) || null;
    const reopened = from && typeOf(from) === "former";
    const input = {
      journeyAction: action,
      journeyType: typeOf(action),
      journeyPath: person.path ?? "relationship_first",
      actionSince: now,
      // Any decision, by hand or by confirming, settles the open proposal.
      ...CLEAR_PROPOSAL,
    };
    if (action === "keep_informed") {
      const r = typeof body?.revisitAt === "number" && body.revisitAt > now ? body.revisitAt : now + KEEP_INFORMED_DAYS * 864e5;
      input.revisitAt = r;
    }
    const sourceId = crypto.randomUUID();
    try {
      await updateRecord(deps, {
        id: recordId,
        input,
        expectedUpdatedAt: typeof body?.expectedUpdatedAt === "number" ? body.expectedUpdatedAt : record.updatedAt,
        audit: {
          id: `journey-manual:${recordId}:${sourceId}`,
          body: `Action: ${ACTION_BY_ID[from]?.label ?? from ?? "None"} → ${ACTION_BY_ID[action].label}${reopened ? " (reopened)" : ""}`,
          authorId: auth.user.userId,
          meta: {
            journeyEvent: "action_changed", from, to: action, reopened: !!reopened,
            occurredAt: now, recordedAt: now, actor: auth.user.userId, method,
            sourceType: method === "confirmed" ? "proposal" : "manual", sourceId: method === "confirmed" ? evidence : sourceId,
            dateQuality: "exact", personId: recordId,
          },
        },
      });
    } catch (err) {
      return json({ error: "This person changed since you opened them. Refresh and try again.", detail: err instanceof Error ? err.message : String(err) }, 409);
    }
    // Keep informed puts a follow-up on Tori's open list for the revisit date,
    // beside the call follow-ups. The Action stays Keep informed until fresh
    // outreach is recorded or confirmed (Appendix A.3).
    if (action === "keep_informed" && input.revisitAt) {
      await addActivity(deps, {
        recordId,
        kind: "task",
        body: `Revisit ${record.name}: kept informed since ${new Date(now).toISOString().slice(0, 10)}. Reach out again.`,
        authorId: auth.user.userId,
        dueAt: input.revisitAt,
        meta: { journeyEvent: "revisit_task", revisitAt: input.revisitAt, occurredAt: now },
        mutationId: `journey-revisit:${recordId}:${input.revisitAt}`,
      }).catch((err) => console.error("labels: revisit task not written", recordId, err instanceof Error ? err.message : err));
    }
    const fresh = await getRecord(deps, recordId);
    return json({ ok: true, updatedAt: fresh?.updatedAt, labels: labelsView(fresh) });
  }

  if (url.pathname === LABELS_DISMISS_PATH && req.method === "POST") {
    const auth = await adminOrError(req, env, ctx);
    if (auth.error) return auth.error;
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
    const recordId = str(body?.recordId);
    const action = str(body?.action);
    const evidence = str(body?.evidence);
    const deps = { crm, db: auth.db };
    const record = await getRecord(deps, recordId);
    if (!record || record.type !== "person") return json({ error: "not found" }, 404);
    const f = record.fields ?? {};
    if (str(f.proposedAction) !== action || str(f.proposalEvidence) !== evidence) {
      return json({ error: "This proposal is out of date. Refresh to see where they are now." }, 409);
    }
    const now = Date.now();
    try {
      await updateRecord(deps, {
        id: recordId,
        input: { ...CLEAR_PROPOSAL, journeyFlags: str(f.journeyFlags).split(",").filter((x) => x && x !== "flag:move-to-confirm").join(",") },
        expectedUpdatedAt: typeof body?.expectedUpdatedAt === "number" ? body.expectedUpdatedAt : record.updatedAt,
        audit: {
          id: `journey-dismiss:${recordId}:${action}:${evidence}`,
          body: `Proposal dismissed: ${ACTION_BY_ID[action]?.label ?? action}`,
          authorId: auth.user.userId,
          // The job reads this so the same evidence never proposes again.
          meta: { journeyEvent: "proposal_dismissed", to: action, evidence, occurredAt: now, recordedAt: now, actor: auth.user.userId, method: "manual", sourceType: "proposal", sourceId: evidence, dateQuality: "exact", personId: recordId },
        },
      });
    } catch {
      return json({ error: "This person changed since you opened them. Refresh and try again." }, 409);
    }
    const fresh = await getRecord(deps, recordId);
    return json({ ok: true, updatedAt: fresh?.updatedAt, labels: labelsView(fresh) });
  }

  return null;
};
