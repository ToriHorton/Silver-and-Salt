// Signup labels: Type, Path and Action on every person (Signup Journeys v3.1,
// Signup Tracking Build Plan v3, both in the private Library).
//
// This module is the rules, with no I/O: which Actions exist, which are valid
// for a person, what Type each Action means, how the system-proven Action is
// worked out from Chapter's own rows, and the shape of every event. The
// labels job (src/labels-job.mjs) does the reading and writing.
//
// Three rules the code must never break:
//   1. Type is looked up from Action. It is never stored on its own authority.
//   2. Path is set once, from the first record, and never changes.
//   3. An Action that means money moved or access changed (Approved, Member
//      access, Refunded, Seat ended, Lapsed, Renewed, Paid) is only ever
//      written by the system, after reading that it happened. Tori starts
//      those operations from their own buttons; the label follows the fact.

export const TYPES = ["prospect", "applicant", "member", "former"];
export const TYPE_LABELS = { prospect: "Prospect", applicant: "Applicant", member: "Member", former: "Former" };

export const PATHS = ["relationship_first", "website_first", "second_seat"];
export const PATH_LABELS = {
  relationship_first: "Relationship first",
  website_first: "Website first",
  second_seat: "Second seat",
};

// Who may set an Action.
//   manual  Tori sets it in the Action tab
//   confirm Tori sets it, normally by confirming a detected proposal
//   system  only the labels job, from a record that proves it
//   pending the operation behind it does not exist yet; refused (none today:
//           Declined and Moved to Associate arrived with Chapter 0.57.0)
const A = (id, label, type, setBy, rank, when) => ({ id, label, type, setBy, rank, when });

// `rank` orders Actions inside one stretch of the journey so an older signal
// can never move a person backwards. Relationship steps are below 10; signup
// steps run 10 to 80; endings are 90. `when` names the conditions under which
// the Action is valid (see validFor).
export const ACTIONS = [
  A("identified", "Identified", "prospect", "manual", 1, { path: ["relationship_first"] }),
  A("researched", "Researched", "prospect", "confirm", 2, { path: ["relationship_first"] }),
  A("contacted", "Contacted", "prospect", "confirm", 3, { path: ["relationship_first"] }),
  A("intro_booked", "Introduction booked", "prospect", "confirm", 4, { path: ["relationship_first"] }),
  A("intro_held", "Introduction held", "prospect", "confirm", 5, { path: ["relationship_first"] }),
  A("soft_commit", "Soft commit", "prospect", "manual", 6, { path: ["relationship_first"] }),
  A("keep_informed", "Keep informed", "prospect", "manual", 6, { path: ["relationship_first"] }),
  A("invited", "Invited", "prospect", "confirm", 7, { path: ["relationship_first"] }),
  A("seat_invited", "Seat invited", "prospect", "system", 7, { path: ["second_seat"] }),
  A("applied", "Applied", "applicant", "system", 10, {}),
  A("paid", "Paid", "applicant", "system", 20, { payment: ["required"] }),
  A("conversation_booked", "Conversation booked", "applicant", "system", 30, { admission: ["call_required"] }),
  A("conversation_held", "Conversation held", "applicant", "confirm", 40, { admission: ["call_required"] }),
  A("fit", "A fit", "applicant", "manual", 50, { admission: ["call_required"] }),
  A("not_paid_fit", "Not a paid fit", "applicant", "manual", 50, { admission: ["call_required"], payment: ["required"] }),
  A("not_fit", "Not a fit", "applicant", "manual", 50, { admission: ["call_required"] }),
  A("waiting_on_buyer", "Waiting on buying member", "member", "system", 55, { path: ["second_seat"] }),
  A("approved", "Approved", "member", "system", 60, {}),
  A("moved_to_associate", "Moved to Associate", "member", "system", 60, { payment: ["required"] }),
  A("member_access", "Member access", "member", "system", 70, {}),
  A("renewed", "Renewed", "member", "system", 80, {}),
  A("passed", "Passed", "former", "manual", 90, { path: ["relationship_first"], before: "applied" }),
  A("seat_declined", "Seat declined", "former", "manual", 90, { path: ["second_seat"] }),
  A("declined", "Declined", "former", "system", 90, {}),
  A("refunded", "Refunded", "former", "system", 90, { payment: ["required"] }),
  A("seat_ended", "Seat ended", "former", "system", 90, { path: ["second_seat"] }),
  A("lapsed", "Lapsed", "former", "system", 90, {}),
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
export const ACTION_IDS = ACTIONS.map((a) => a.id);

/** Type is always looked up from the Action. Unknown Actions read as null. */
export function typeOf(actionId) {
  return ACTION_BY_ID[actionId]?.type ?? null;
}

/**
 * Is an Action valid for a person with this Path, Admission and Payment?
 * Admission and Payment are unknown (null) before an application exists, which
 * only the relationship steps allow.
 */
export function validFor(actionId, person) {
  const a = ACTION_BY_ID[actionId];
  if (!a) return false;
  const { path = null, admission = null, payment = null, hasApplication = false } = person ?? {};
  const w = a.when;
  if (w.path && !w.path.includes(path)) return false;
  if (a.type === "prospect" && hasApplication) return false;
  if (w.before === "applied" && hasApplication) return false;
  if (w.admission && !w.admission.includes(admission)) return false;
  if (w.payment && !w.payment.includes(payment)) return false;
  return true;
}

/** The Actions Tori may set by hand for this person, in journey order. */
export function manualActionsFor(person) {
  return ACTIONS.filter((a) => (a.setBy === "manual" || a.setBy === "confirm") && validFor(a.id, person)).map((a) => a.id);
}

/**
 * Why Tori cannot set an Action by hand, or null when she can.
 * The operational Actions are named with the button that does the real work.
 */
export function refusalFor(actionId, person) {
  const a = ACTION_BY_ID[actionId];
  if (!a) return "Unknown action.";
  if (a.setBy === "system") {
    if (actionId === "approved") return "Approve from the application's Approve button; Approved is recorded once the approval has finished.";
    if (actionId === "refunded") return "Refund from the application's Refund button; Refunded is recorded once the refund has finished.";
    if (actionId === "declined") return "Decline from the Decision panel's Decline button; Declined is recorded once it has finished.";
    if (actionId === "moved_to_associate") return "Use Not a paid fit in the Decision panel (a refund that keeps them as an Associate); Moved to Associate is recorded once it has finished.";
    return `${a.label} is recorded by the system from the record that proves it.`;
  }
  if (a.setBy === "pending") return `${a.label} is not available yet.`;
  if (!validFor(actionId, person)) return `${a.label} does not apply to this person's path or application.`;
  return null;
}

// ── Facts read from Chapter's rows ───────────────────────────────────────────

const str = (v) => (typeof v === "string" ? v : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Admission from the application: a waiver counts only if it was on the application at submission. */
export function admissionOf(app) {
  if (!app) return { admission: null, waiverSource: null };
  if (num(app.interviewWaivedAt) !== null) {
    return {
      admission: "call_waived",
      waiverSource: str(app.admissionSource) === "returning_member" ? "returning_member" : "invitation",
    };
  }
  return { admission: "call_required", waiverSource: null };
}

/** Payment from the tier and the seat. */
export function paymentOf(app, freeTiers) {
  if (!app) return null;
  if (str(app.namedSeatId)) return "not_required";
  if (freeTiers?.has(str(app.tierId))) return "not_required";
  return "required";
}

/** The application attempt: the application, plus its restart if any. */
export function attemptOf(app) {
  if (!app) return null;
  const restart = str(app.membershipRestartId);
  return restart ? `${app.id}:${restart}` : String(app.id ?? "");
}

/**
 * Path, set once. A person on record before they applied (anything Tori did
 * first, or a call that created them) is Relationship first; a seat link is
 * Second seat; everyone else found us on the website.
 */
export function initialPath({ existingPath, app, knownBeforeApplying }) {
  if (existingPath && PATHS.includes(existingPath)) return existingPath;
  if (app && str(app.namedSeatId)) return "second_seat";
  if (knownBeforeApplying) return "relationship_first";
  if (app && admissionOf(app).waiverSource === "invitation") return "relationship_first";
  if (app) return "website_first";
  return "relationship_first";
}

// Membership states (the hub's authority, projected onto the application)
// that still allow access.
const ACCESS_STATUSES = new Set(["active", "cancel_at_term_end", "payment_grace"]);
// States that end or withhold access. The projection on the application is
// only refreshed by payment events, so right after approval it can still read
// "paid_pending_approval" while the member already has access (Shelly
// Leatham, 2026-10-14). Access is therefore "approval finished, and not in
// one of these", not "projection says active".
const NO_ACCESS_STATUSES = new Set(["lapsed", "canceled", "refunded", "refund_pending", "declined", "restarting", "superseded"]);

// Access continues this long after a failed renewal (Chapter 0.56.2; Tori kept 14 days, 2026-10-14).
export const GRACE_MS = 14 * 24 * 60 * 60 * 1000;

// Events that are recorded but change no Action.
export const EVENT_LABELS = {
  renewal_payment_failed: "Renewal payment failed",
  cancellation_scheduled: "Cancellation scheduled",
  reminder_sent: "Reminder sent",
  proposal_made: "Move proposed",
  revisit_task: "Revisit task added",
  no_show: "Call did not happen; invited to rebook",
  proposal_dismissed: "Proposal dismissed",
  reopened: "Reopened",
};

/**
 * The Action Chapter's own rows prove, with the events that prove it.
 * Pure: the caller supplies the application and the facts it read.
 *
 * facts: { freeTiers:Set, paidAt:Map<appId,{at,id}>, meeting:{id,at,startAt}|null,
 *          renewals:[{id,at}], continued:Set<appId>, path:string|null, now:number }
 */
export function systemEventsFor(app, facts) {
  const events = [];
  if (!app) return { action: null, events };
  const id = String(app.id ?? "");
  const attempt = attemptOf(app);
  const status = str(app.status);
  const seat = !!str(app.namedSeatId);
  // facts.now is when the job looked. Live, the job looks every five minutes,
  // so a date it observes is exact; a backfill passes nowQuality "estimated".
  const observed = facts.nowQuality ?? "estimated";
  const push = (event, occurredAt, sourceType, sourceId, dateQuality = "exact") =>
    events.push({ event, occurredAt, sourceType, sourceId: String(sourceId), dateQuality, attempt });

  const created = num(app.createdAt);
  push("applied", created ?? facts.now, "application", id, created === null ? observed : "exact");

  // The application status is proof on its own: a status past a step means
  // the step happened, even when its record (a payment receipt, a meeting
  // row) cannot be found. Then the date is the job's observation.
  const PAST_PAYMENT = ["paid_pending_vetting", "call_scheduled", "interviewed", "approved", "refunded"];
  const PAST_BOOKING = ["call_scheduled", "interviewed"];
  const payment = paymentOf(app, facts.freeTiers);
  const paid = facts.paidAt?.get(id);
  if (paid) push("paid", paid.at, "payment", paid.id);
  else if (payment === "required" && PAST_PAYMENT.includes(status) && !(status === "refunded" && !facts.refundAfterPayment)) {
    push("paid", facts.now, "payment", `${id}:paid-by-status`, observed);
  }

  const callRequired = admissionOf(app).admission === "call_required";
  // A booking Tori marked "Didn't happen" no longer counts as booked: the
  // person is invited to rebook, and a new time counts again.
  const meeting = facts.meeting && !facts.noShowKeys?.has(meetingKey(facts.meeting)) ? facts.meeting : null;
  const noShowOnly = facts.meeting && !meeting;
  if (meeting && callRequired) {
    push("conversation_booked", meeting.at ?? meeting.startAt ?? facts.now, "meeting", meeting.id);
  } else if (callRequired && PAST_BOOKING.includes(status) && !noShowOnly) {
    push("conversation_booked", facts.now, "meeting", `${id}:booked-by-status`, observed);
  }
  if (callRequired && status === "interviewed") push("conversation_held", facts.now, "application", `${id}:interviewed`, observed);

  const journeyApproved = num(app.journeyApprovedAt);
  if (seat && journeyApproved !== null && status !== "approved" && status !== "refunded") {
    push("waiting_on_buyer", journeyApproved, "seat", `${str(app.namedSeatId)}:waiting`);
  }

  const approvedish = status === "approved";
  if (approvedish) {
    push("approved", journeyApproved ?? facts.now, "application", `${id}:approved`, journeyApproved === null ? observed : "exact");
    // Not a paid fit (Chapter 0.57.0): the paid membership was refunded and the same application was kept
    // on the free tier. Chapter archives the purchase, which is the record that proves it.
    if (facts.continued?.has(id)) push("moved_to_associate", facts.now, "application", `${id}:continued`, observed);
    const ms = str(app.membershipStatus);
    const accessOk = app.approvalEffectsPending !== true && !NO_ACCESS_STATUSES.has(ms);
    if (accessOk) push("member_access", facts.now, "access", `${id}:access`, observed);
    for (const r of facts.renewals ?? []) push("renewed", r.at, "payment", r.id);
    for (const f of facts.renewalFailures ?? []) push("renewal_payment_failed", f.at, "payment", f.id);
    // The membership ends when its term passes without a renewal and the
    // 14-day grace for a failed renewal is over. A successful renewal moves
    // renewalAt forward, so a passed renewalAt plus grace means it lapsed.
    const renewalAt = num(app.renewalAt);
    const lapsedByDate = renewalAt !== null && renewalAt > 0 && facts.now > renewalAt + GRACE_MS && !ACCESS_STATUSES.has(ms);
    if (ms === "lapsed" || ms === "canceled" || lapsedByDate) push("lapsed", renewalAt && renewalAt > 0 ? renewalAt : facts.now, "membership", `${id}:lapsed:${renewalAt ?? 0}`, renewalAt && renewalAt > 0 ? "exact" : observed);
    if (ms === "cancel_at_term_end") push("cancellation_scheduled", facts.now, "membership", `${id}:cancel:${renewalAt ?? 0}`, observed);
  }

  if (status === "refunded" || str(app.membershipStatus) === "refunded") {
    push(seat ? "seat_ended" : "refunded", num(app.refundedAt) ?? facts.now, "refund", `${id}:refunded`, num(app.refundedAt) === null ? observed : "exact");
  }
  // A seat recipient the buyer replaced (Chapter 0.57.0 re-gift) is declined without a refund; their path
  // still says Second seat even though Chapter has released the seat binding from the row.
  if (status === "declined") push(seat || facts.path === "second_seat" ? "seat_declined" : "declined", facts.now, "application", `${id}:declined`, observed);

  // The current system Action is the highest-ranked event, latest wins a tie.
  let action = null;
  for (const e of events) {
    const a = ACTION_BY_ID[e.event];
    if (!a) continue; // an event that changes no Action (a failed renewal)
    if (!action || a.rank >= ACTION_BY_ID[action].rank) action = e.event;
  }
  return { action, events };
}

/** One booked time: the meeting and its start, so a rebooked time is a new key. */
export function meetingKey(meeting) {
  return `${meeting?.id ?? ""}:${meeting?.startAt ?? ""}`;
}

/**
 * The next current Action, given what is stored and what the system proves.
 * A stale or lower-ranked signal never moves a person backwards inside one
 * attempt; a new attempt (a restart) starts the ranking again; a manual
 * outcome (A fit, Not a fit) holds until the system proves something later.
 */
export function nextAction({ current, currentAttempt, systemAction, attempt }) {
  if (!systemAction) return current ?? null;
  if (!current) return systemAction;
  if (attempt && currentAttempt && attempt !== currentAttempt) return systemAction;
  const cur = ACTION_BY_ID[current];
  const sys = ACTION_BY_ID[systemAction];
  if (!cur) return systemAction;
  // A prospect who has now applied moves into the signup steps.
  if (cur.type === "prospect" && sys.type !== "prospect") return systemAction;
  if (sys.rank > cur.rank) return systemAction;
  // Renewed repeats at the same rank; an ending always lands.
  if (sys.rank === cur.rank && sys.type === "former" && cur.type !== "former") return systemAction;
  return current;
}

// ── Events ───────────────────────────────────────────────────────────────────

/**
 * The stable id of an event: the same person, event and source always give
 * the same id, so a retry or a replayed job can never write it twice.
 */
export function eventId({ personId, event, sourceType, sourceId }) {
  return `journey:${personId}:${event}:${sourceType}:${sourceId}`;
}

/** The activity meta an event is stored with. */
export function eventMeta(e, { personId, from, to, actor = "system", method = "automatic", recordedAt }) {
  return {
    journeyEvent: e.event,
    from: from ?? null,
    to: to ?? null,
    occurredAt: e.occurredAt,
    recordedAt,
    actor,
    method,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    dateQuality: e.dateQuality ?? "exact",
    attempt: e.attempt ?? null,
    personId,
  };
}

/** One readable line for the activity feed. */
export function eventBody(e, from, to) {
  const label = ACTION_BY_ID[e.event]?.label ?? EVENT_LABELS[e.event] ?? e.event;
  if (from && to && from !== to) return `Action: ${ACTION_BY_ID[from]?.label ?? from} → ${ACTION_BY_ID[to]?.label ?? to}`;
  return `Journey event: ${label}`;
}

// ── Flags ────────────────────────────────────────────────────────────────────

export const FLAG_TAGS = {
  needs_to_pay: "flag:needs-to-pay",
  needs_to_book: "flag:needs-to-book",
  reminded: "flag:reminded",
  outcome_due: "flag:outcome-due",
  attendance_unconfirmed: "flag:attendance-unconfirmed",
  revisit_due: "flag:revisit-due",
  payment_failed: "flag:payment-failed",
  cancels_at_term_end: "flag:cancels-at-term-end",
  waiting_on_buyer: "flag:waiting-on-buyer",
  move_to_confirm: "flag:move-to-confirm",
};

/** Which flags a person should carry right now. */
export function flagsFor({ action, app, facts, revisitAt, proposal = null }) {
  const out = new Set();
  const now = facts?.now ?? Date.now();
  const ms = str(app?.membershipStatus);
  if (action === "applied" && app && paymentOf(app, facts?.freeTiers) === "required") out.add("needs_to_pay");
  if ((action === "paid" || (action === "applied" && paymentOf(app, facts?.freeTiers) === "not_required")) && admissionOf(app).admission === "call_required") out.add("needs_to_book");
  if (facts?.reminded) out.add("reminded");
  if (action === "conversation_held") out.add("outcome_due");
  // Only once the job knows whether a call summary arrived (phase 4 reads
  // Granola). Unknown is not "no summary", so no flag until it is checked.
  if (action === "conversation_booked" && facts?.meeting?.startAt && facts.meeting.startAt + 60 * 60 * 1000 < now && facts.callSummaryAfterMeeting === false) out.add("attendance_unconfirmed");
  if (action === "keep_informed" && revisitAt && revisitAt <= now) out.add("revisit_due");
  if (ms === "payment_grace") out.add("payment_failed");
  if (ms === "cancel_at_term_end") out.add("cancels_at_term_end");
  if (action === "waiting_on_buyer") out.add("waiting_on_buyer");
  if (proposal) out.add("move_to_confirm");
  return [...out].map((f) => FLAG_TAGS[f]);
}

export const KEEP_INFORMED_DAYS = 90;

// ── Proposals (detected moves) ───────────────────────────────────────────────
//
// A proposal is one person, one target Action, one piece of evidence (build
// plan v3, Appendix A.5). Tori confirms or dismisses it in the Action tab.
//   - A dismissed proposal never returns from the same evidence.
//   - It is only offered if the target is a valid next step, later in the
//     journey than where the person is, and the evidence is newer than the
//     current Action (a stale signal never overrides a newer decision).

const CALL_KINDS = new Set(["call", "meeting"]);
const HOUR = 60 * 60 * 1000;

/**
 * The one move to propose for a person, or null.
 * input: { action, actionSince, path, hasApplication, admission, payment,
 *          activities:[{id, kind, occurredAt}], emails:[{id, sentAt}],
 *          meetingStartAt, waiverGrantId, prepNotes, linkedin, dismissed:Set }
 */
export function proposalFor(input) {
  const { action, actionSince = 0, dismissed = new Set() } = input;
  if (!action) return null;
  const person = { path: input.path, hasApplication: input.hasApplication, admission: input.admission, payment: input.payment };
  const cur = ACTION_BY_ID[action];
  const candidates = [];
  const add = (to, evidence, at, reason) => {
    if (!evidence || dismissed.has(`${to}:${evidence}`)) return false;
    if (!validFor(to, person)) return false;
    const target = ACTION_BY_ID[to];
    if (!target || !cur || (target.rank <= cur.rank && !(action === "keep_informed" && to === "contacted"))) return false;
    if (typeof at === "number" && at < actionSince) return false;
    candidates.push({ to, evidence, at: at ?? null, reason });
    return true;
  };
  const calls = (input.activities ?? []).filter((a) => CALL_KINDS.has(a.kind));
  // Each kind of evidence is tried oldest first until one is not dismissed.
  if (action === "intro_booked") {
    calls.filter((a) => a.occurredAt >= actionSince - 24 * HOUR).sort((a, b) => a.occurredAt - b.occurredAt)
      .some((c) => add("intro_held", `call:${c.id}`, Math.max(c.occurredAt, actionSince), "A call summary arrived from Granola."));
  }
  if (action === "conversation_booked" && input.meetingStartAt) {
    calls.filter((a) => a.occurredAt >= input.meetingStartAt - 2 * HOUR).sort((a, b) => a.occurredAt - b.occurredAt)
      .some((c) => add("conversation_held", `call:${c.id}`, Math.max(c.occurredAt, actionSince), "A call summary arrived from Granola after the booked time."));
  }
  // Emails: those sent from the admin console, and those the morning routine
  // found in Gmail (activity signal "email_sent").
  const gmail = (input.activities ?? [])
    .filter((a) => a.signal === "email_sent")
    .map((a) => ({ id: `gmail:${a.signalId ?? a.id}`, sentAt: a.occurredAt, from: "Gmail" }));
  const sent = [...(input.emails ?? []).map((e) => ({ ...e, from: "the admin console" })), ...gmail];
  if (["identified", "researched", "keep_informed"].includes(action)) {
    sent.filter((m) => typeof m.sentAt === "number" && m.sentAt >= actionSince).sort((a, b) => a.sentAt - b.sentAt)
      .some((e) => add("contacted", `email:${e.id}`, e.sentAt, `An email to them was sent from ${e.from}.`));
  }
  // Calendar: an event with them as a guest, found by the morning routine.
  if (["identified", "researched", "contacted", "keep_informed"].includes(action)) {
    (input.activities ?? []).filter((a) => a.signal === "calendar_event").sort((a, b) => a.occurredAt - b.occurredAt)
      .some((a) => add("intro_booked", `calendar:${a.signalId ?? a.id}`, Math.max(a.occurredAt, actionSince), "A calendar event with them as a guest was found."));
  }
  if (action === "identified" && str(input.prepNotes).trim() && str(input.linkedin).trim()) {
    add("researched", `prep:${str(input.prepNotes).trim().length}`, null, "Prep notes and LinkedIn are filled in.");
  }
  if (!input.hasApplication && input.waiverGrantId && !["invited", "passed"].includes(action)) {
    add("invited", `grant:${input.waiverGrantId}`, null, "Waive interview is recorded for their email.");
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => ACTION_BY_ID[b.to].rank - ACTION_BY_ID[a.to].rank)[0];
}

/** Did a call summary arrive after the booked time? null when not yet knowable. */
export function callSummaryAfter(activities, meetingStartAt) {
  if (!meetingStartAt) return null;
  return (activities ?? []).some((a) => CALL_KINDS.has(a.kind) && a.occurredAt >= meetingStartAt - 2 * HOUR);
}
