import { describe, expect, it } from "vitest";
import {
  ACTIONS, typeOf, validFor, manualActionsFor, refusalFor, admissionOf, paymentOf, attemptOf,
  initialPath, systemEventsFor, nextAction, eventId, flagsFor, FLAG_TAGS, GRACE_MS,
} from "../src/labels.mjs";

const NOW = Date.UTC(2026, 9, 14, 18);
const DAY = 864e5;
const free = new Set(["associate"]);
const facts = (over = {}) => ({ freeTiers: free, paidAt: new Map(), meeting: null, renewals: [], renewalFailures: [], now: NOW, ...over });

describe("vocabulary", () => {
  it("gives every Action exactly one Type", () => {
    for (const a of ACTIONS) expect(["prospect", "applicant", "member", "former"]).toContain(typeOf(a.id));
  });
  it("reads Type from Action", () => {
    expect(typeOf("keep_informed")).toBe("prospect");
    expect(typeOf("paid")).toBe("applicant");
    expect(typeOf("renewed")).toBe("member");
    expect(typeOf("seat_ended")).toBe("former");
    expect(typeOf("nonsense")).toBeNull();
  });
});

describe("admission is separate from path", () => {
  it("a Relationship-first prospect who applies uninvited needs the call", () => {
    const app = { id: "a1", status: "submitted", tierId: "standard" };
    const person = { path: "relationship_first", hasApplication: true, ...admissionOf(app), payment: paymentOf(app, free) };
    expect(person.admission).toBe("call_required");
    expect(validFor("conversation_booked", person)).toBe(true);
    expect(validFor("intro_held", person)).toBe(false);
  });
  it("a waiver on the application waives the call", () => {
    expect(admissionOf({ interviewWaivedAt: 1 })).toEqual({ admission: "call_waived", waiverSource: "invitation" });
    expect(admissionOf({ interviewWaivedAt: 1, admissionSource: "returning_member" }).waiverSource).toBe("returning_member");
    const person = { path: "relationship_first", hasApplication: true, admission: "call_waived", payment: "required" };
    expect(validFor("conversation_booked", person)).toBe(false);
    expect(validFor("paid", person)).toBe(true);
  });
  it("Associates and seat holders do not pay", () => {
    expect(paymentOf({ tierId: "associate" }, free)).toBe("not_required");
    expect(paymentOf({ tierId: "standard", namedSeatId: "seat_1" }, free)).toBe("not_required");
    expect(paymentOf({ tierId: "standard" }, free)).toBe("required");
  });
});

describe("path is set once", () => {
  it("keeps an existing path", () => {
    expect(initialPath({ existingPath: "website_first", app: { namedSeatId: "s" }, knownBeforeApplying: true })).toBe("website_first");
  });
  it("seat link, known before, invitation, website", () => {
    expect(initialPath({ app: { namedSeatId: "s" } })).toBe("second_seat");
    expect(initialPath({ app: { id: "a" }, knownBeforeApplying: true })).toBe("relationship_first");
    expect(initialPath({ app: { id: "a", interviewWaivedAt: 1 } })).toBe("relationship_first");
    expect(initialPath({ app: { id: "a" } })).toBe("website_first");
  });
});

describe("system events record every milestone", () => {
  it("a waived free Associate: Applied, Approved and Member access as three events", () => {
    const app = { id: "a1", status: "approved", tierId: "associate", interviewWaivedAt: 5, createdAt: NOW - 1000, journeyApprovedAt: NOW - 900 };
    const r = systemEventsFor(app, facts({ nowQuality: "exact" }));
    expect(r.events.find((e) => e.event === "member_access").dateQuality).toBe("exact");
    expect(r.events.map((e) => e.event)).toEqual(["applied", "approved", "member_access"]);
    expect(r.action).toBe("member_access");
  });
  it("a paid invited applicant: Applied, Paid, Approved, Member access", () => {
    const app = { id: "a2", status: "approved", tierId: "standard", interviewWaivedAt: 5, createdAt: NOW - 3000, journeyApprovedAt: NOW - 1000 };
    const r = systemEventsFor(app, facts({ paidAt: new Map([["a2", { at: NOW - 2000, id: "stripe-event:evt_1" }]]) }));
    expect(r.events.map((e) => e.event)).toEqual(["applied", "paid", "approved", "member_access"]);
  });
  it("a backfill marks observed dates as estimated", () => {
    const app = { id: "b1", status: "approved", tierId: "associate", interviewWaivedAt: 5, createdAt: 1 };
    const r = systemEventsFor(app, facts());
    expect(r.events.find((e) => e.event === "approved").dateQuality).toBe("estimated");
    expect(r.events.find((e) => e.event === "applied").dateQuality).toBe("exact");
  });
  it("approval is not access while the approval effects are still pending", () => {
    const app = { id: "a3", status: "approved", tierId: "standard", approvalEffectsPending: true, createdAt: 1 };
    expect(systemEventsFor(app, facts()).action).toBe("approved");
  });
  it("a website applicant who paid and booked", () => {
    const app = { id: "a4", status: "call_scheduled", tierId: "standard", createdAt: 1 };
    const r = systemEventsFor(app, facts({ paidAt: new Map([["a4", { at: 2, id: "p" }]]), meeting: { id: "m1", at: 3, startAt: NOW + DAY } }));
    expect(r.action).toBe("conversation_booked");
  });
  it("every renewal is its own event, and the same payment never twice", () => {
    const app = { id: "a5", status: "approved", tierId: "standard", createdAt: 1, journeyApprovedAt: 2, renewalAt: NOW + 300 * DAY };
    const r = systemEventsFor(app, facts({ renewals: [{ id: "stripe-event:r1", at: 10 }, { id: "stripe-event:r2", at: 20 }] }));
    const ids = r.events.filter((e) => e.event === "renewed").map((e) => eventId({ personId: "p", event: e.event, sourceType: e.sourceType, sourceId: e.sourceId }));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(eventId({ personId: "p", event: "renewed", sourceType: "payment", sourceId: "stripe-event:r1" })).toBe(ids[0]);
  });
  it("a status past a step proves the step when its record is missing", () => {
    const paidNoReceipt = { id: "s1", status: "paid_pending_vetting", tierId: "standard", createdAt: 1 };
    expect(systemEventsFor(paidNoReceipt, facts()).action).toBe("paid");
    const bookedNoMeeting = { id: "s2", status: "call_scheduled", tierId: "standard", createdAt: 1 };
    const r = systemEventsFor(bookedNoMeeting, facts());
    expect(r.action).toBe("conversation_booked");
    expect(r.events.find((e) => e.event === "paid").dateQuality).toBe("estimated");
    const freeBooked = { id: "s3", status: "call_scheduled", tierId: "associate", createdAt: 1 };
    expect(systemEventsFor(freeBooked, facts()).events.map((e) => e.event)).not.toContain("paid");
  });
  it("lapses once the term and the 14-day grace have passed", () => {
    const app = { id: "a6", status: "approved", tierId: "standard", createdAt: 1, journeyApprovedAt: 2, renewalAt: NOW - GRACE_MS - DAY };
    expect(systemEventsFor(app, facts()).action).toBe("lapsed");
    const inGrace = { ...app, renewalAt: NOW - DAY, membershipStatus: "payment_grace" };
    expect(systemEventsFor(inGrace, facts()).action).not.toBe("lapsed");
  });
  it("a seat holder whose buyer was refunded ends as Seat ended", () => {
    const app = { id: "a7", status: "refunded", tierId: "standard", namedSeatId: "seat_1", createdAt: 1 };
    expect(systemEventsFor(app, facts()).action).toBe("seat_ended");
  });
  it("a seat holder approved before the buyer waits on the buyer", () => {
    const app = { id: "a8", status: "call_scheduled", tierId: "standard", namedSeatId: "seat_1", createdAt: 1, journeyApprovedAt: 9 };
    expect(systemEventsFor(app, facts()).action).toBe("waiting_on_buyer");
  });
});

describe("the current Action only moves forward", () => {
  it("a recorded outcome holds against an older booking signal", () => {
    expect(nextAction({ current: "fit", systemAction: "conversation_booked", attempt: "a", currentAttempt: "a" })).toBe("fit");
  });
  it("approval moves past an outcome", () => {
    expect(nextAction({ current: "fit", systemAction: "approved", attempt: "a", currentAttempt: "a" })).toBe("approved");
  });
  it("a prospect who applies moves into the signup steps", () => {
    expect(nextAction({ current: "soft_commit", systemAction: "applied" })).toBe("applied");
  });
  it("a new attempt starts again", () => {
    expect(nextAction({ current: "lapsed", systemAction: "applied", attempt: "a:r1", currentAttempt: "a" })).toBe("applied");
  });
  it("an ending lands", () => {
    expect(nextAction({ current: "renewed", systemAction: "lapsed", attempt: "a", currentAttempt: "a" })).toBe("lapsed");
  });
});

describe("labels reflect completed operations", () => {
  const applicant = { path: "website_first", hasApplication: true, admission: "call_required", payment: "required" };
  it("refuses the operational Actions by hand, and names the button", () => {
    expect(refusalFor("approved", applicant)).toMatch(/Approve button/);
    expect(refusalFor("refunded", applicant)).toMatch(/Refund button/);
    expect(refusalFor("member_access", applicant)).toMatch(/system/);
    expect(refusalFor("declined", applicant)).toMatch(/fa96b11c/);
    expect(refusalFor("moved_to_associate", applicant)).toMatch(/f7bc92ee/);
  });
  it("allows outcomes and refuses steps that do not fit the path", () => {
    expect(refusalFor("fit", applicant)).toBeNull();
    expect(refusalFor("soft_commit", applicant)).toMatch(/does not apply/);
    expect(manualActionsFor({ path: "relationship_first", hasApplication: false })).toEqual(
      ["identified", "researched", "contacted", "intro_booked", "intro_held", "soft_commit", "keep_informed", "invited", "passed"],
    );
  });
});

describe("flags", () => {
  it("Attendance unconfirmed, never a no-show, when a booked time passes with no summary", () => {
    const app = { id: "a", status: "call_scheduled", tierId: "standard" };
    const meeting = { startAt: NOW - 2 * 60 * 60 * 1000 };
    expect(flagsFor({ action: "conversation_booked", app, facts: facts({ meeting, callSummaryAfterMeeting: false }) })).toContain(FLAG_TAGS.attendance_unconfirmed);
    // Not checked yet (no Granola read) is not the same as no summary.
    expect(flagsFor({ action: "conversation_booked", app, facts: facts({ meeting }) })).not.toContain(FLAG_TAGS.attendance_unconfirmed);
  });
  it("Revisit due keeps the Action", () => {
    expect(flagsFor({ action: "keep_informed", app: null, facts: facts(), revisitAt: NOW - 1 })).toContain(FLAG_TAGS.revisit_due);
  });
});

describe("attempts", () => {
  it("a restart is its own attempt", () => {
    expect(attemptOf({ id: "a" })).toBe("a");
    expect(attemptOf({ id: "a", membershipRestartId: "r1" })).toBe("a:r1");
  });
});

import { proposalFor, callSummaryAfter } from "../src/labels.mjs";

describe("proposals", () => {
  const prospect = { path: "relationship_first", hasApplication: false };
  it("a Granola summary after an introduction was booked proposes Introduction held", () => {
    const p = proposalFor({ ...prospect, action: "intro_booked", actionSince: 100, activities: [{ id: "c1", kind: "call", occurredAt: 200 }] });
    expect(p).toMatchObject({ to: "intro_held", evidence: "call:c1" });
  });
  it("a dismissed proposal never returns from the same evidence", () => {
    const input = { ...prospect, action: "intro_booked", actionSince: 100, activities: [{ id: "c1", kind: "call", occurredAt: 200 }] };
    expect(proposalFor({ ...input, dismissed: new Set(["intro_held:call:c1"]) })).toBeNull();
    const fresh = proposalFor({ ...input, dismissed: new Set(["intro_held:call:c1"]), activities: [...input.activities, { id: "c2", kind: "meeting", occurredAt: 300 }] });
    expect(fresh).toMatchObject({ evidence: "call:c2" });
  });
  it("an email older than the current Action proposes nothing", () => {
    expect(proposalFor({ ...prospect, action: "identified", actionSince: 500, emails: [{ id: "e1", sentAt: 400 }] })).toBeNull();
    expect(proposalFor({ ...prospect, action: "identified", actionSince: 500, emails: [{ id: "e2", sentAt: 600 }] })).toMatchObject({ to: "contacted" });
  });
  it("fresh outreach after Keep informed proposes Contacted", () => {
    expect(proposalFor({ ...prospect, action: "keep_informed", actionSince: 10, emails: [{ id: "e3", sentAt: 20 }] })).toMatchObject({ to: "contacted" });
  });
  it("a waiver proposes Invited for someone who has not applied", () => {
    expect(proposalFor({ ...prospect, action: "soft_commit", waiverGrantId: "g1" })).toMatchObject({ to: "invited", evidence: "grant:g1" });
    expect(proposalFor({ ...prospect, hasApplication: true, action: "applied", waiverGrantId: "g1" })).toBeNull();
  });
  it("a summary after the booked time proposes Conversation held; before it, nothing", () => {
    const base = { path: "website_first", hasApplication: true, admission: "call_required", payment: "required", action: "conversation_booked", actionSince: 0, meetingStartAt: 10 * 3600e3 };
    expect(proposalFor({ ...base, activities: [{ id: "c", kind: "call", occurredAt: 10 * 3600e3 + 60e3 }] })).toMatchObject({ to: "conversation_held" });
    expect(proposalFor({ ...base, activities: [{ id: "c", kind: "call", occurredAt: 1 }] })).toBeNull();
  });
  it("knows whether a summary arrived after the booked time", () => {
    expect(callSummaryAfter([{ kind: "note", occurredAt: 99 }], 50)).toBe(false);
    expect(callSummaryAfter([{ kind: "call", occurredAt: 99 }], 50)).toBe(true);
    expect(callSummaryAfter([], null)).toBeNull();
  });
});

describe("outreach signals from the morning routine", () => {
  const prospect = { path: "relationship_first", hasApplication: false };
  it("an email found in Gmail proposes Contacted", () => {
    const p = proposalFor({ ...prospect, action: "identified", actionSince: 10, activities: [{ id: "a1", kind: "note", occurredAt: 20, signal: "email_sent", signalId: "m1" }] });
    expect(p).toMatchObject({ to: "contacted", evidence: "email:gmail:m1" });
    expect(p.reason).toMatch(/Gmail/);
  });
  it("a calendar event proposes Introduction booked, but a note is never a call", () => {
    const acts = [{ id: "a2", kind: "note", occurredAt: 30, signal: "calendar_event", signalId: "ev1", startAt: 99 }];
    expect(proposalFor({ ...prospect, action: "contacted", actionSince: 10, activities: acts })).toMatchObject({ to: "intro_booked", evidence: "calendar:ev1" });
    expect(proposalFor({ ...prospect, action: "intro_booked", actionSince: 10, activities: acts })).toBeNull();
  });
});
