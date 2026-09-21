import { SIGNUP_EMAIL_EVENTS } from "../src/email-events.mjs";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn(async () => ({ sent: true })) }));
vi.mock("@odla-ai/chapter", () => ({
  sendTemplated: send,
  emailGroupFrom: (row) => ({ id: row.id, name: row.name, replyTo: row.replyTo, emailTemplates: row.emailTemplates ?? {} }),
}));

import {
  MILESTONE_LOOKBACK_MS,
  REMINDER_AFTER_MS,
  classifyPath,
  meetingTimeLabel,
  notifyAdminOfMilestones,
  paidAtOf,
  remindUnbooked,
  signupPathsRoute,
} from "../src/signup-paths.ts";

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const CHAPTER = "silver-and-salt-capital";

const facts = (over = {}) => ({
  scheduled: new Set(),
  reminded: new Set(),
  paidAt: new Map(),
  freeTiers: new Set(["associate"]),
  remindedFree: new Set(),
  remindedPayment: new Set(),
  ...over,
});

describe("classifyPath", () => {
  it("splits the applied-and-left stalls by tier: an Associate needs to book, a paid tier needs to pay", () => {
    expect(classifyPath({ id: "a", status: "submitted", tierId: "associate" }, facts())).toBe("free_awaiting_booking");
    expect(classifyPath({ id: "a", status: "submitted", tierId: "associate" }, facts({ remindedFree: new Set(["a"]) }))).toBe("free_reminded");
    expect(classifyPath({ id: "a", status: "submitted", tierId: "standard" }, facts())).toBe("unpaid");
    expect(classifyPath({ id: "a", status: "payment_pending", tierId: "steward" }, facts())).toBe("unpaid");
    expect(classifyPath({ id: "a", status: "submitted", tierId: "standard" }, facts({ remindedPayment: new Set(["a"]) }))).toBe("unpaid_reminded");
    // A booked Associate is booked, whatever her tier.
    expect(classifyPath({ id: "a", status: "call_scheduled", tierId: "associate" }, facts())).toBe("booked");
  });

  it("names the three paths and the states around them", () => {
    expect(classifyPath({ id: "a", status: "approved", interviewWaivedAt: NOW }, facts())).toBe("waived");
    expect(classifyPath({ id: "a", status: "paid_pending_vetting", interviewWaivedAt: NOW }, facts())).toBe("waived");
    expect(classifyPath({ id: "a", status: "paid_pending_vetting" }, facts({ scheduled: new Set(["a"]) }))).toBe("booked");
    expect(classifyPath({ id: "a", status: "paid_pending_vetting", meetingAt: NOW }, facts())).toBe("booked");
    expect(classifyPath({ id: "a", status: "call_scheduled" }, facts())).toBe("booked");
    expect(classifyPath({ id: "a", status: "approved" }, facts())).toBe("booked");
    expect(classifyPath({ id: "a", status: "paid_pending_vetting" }, facts())).toBe("awaiting_booking");
    expect(classifyPath({ id: "a", status: "paid_pending_vetting", meetingAt: 0 }, facts())).toBe("awaiting_booking");
    expect(classifyPath({ id: "a", status: "paid_pending_vetting" }, facts({ reminded: new Set(["a"]) }))).toBe("reminded");
    expect(classifyPath({ id: "a", status: "submitted" }, facts())).toBe("unpaid");
    expect(classifyPath({ id: "a", status: "refunded" }, facts())).toBe("closed");
    expect(classifyPath({ id: "a", status: "paid_pending_vetting", canceled: true }, facts())).toBe("closed");
  });
});

describe("paidAtOf", () => {
  it("prefers the Stripe receipt, then the seat acceptance, then the application time", () => {
    expect(paidAtOf({ id: "a", createdAt: 1, namedSeatAcceptedAt: 2 }, facts({ paidAt: new Map([["a", 3]]) }))).toBe(3);
    expect(paidAtOf({ id: "a", createdAt: 1, namedSeatAcceptedAt: 2 }, facts())).toBe(2);
    expect(paidAtOf({ id: "a", createdAt: 1 }, facts())).toBe(1);
    expect(paidAtOf({ id: "a" }, facts())).toBeNull();
  });
});

function fakeDb(state) {
  return {
    query: vi.fn(async (q) => {
      const out = {};
      for (const ns of Object.keys(q)) {
        const where = q[ns].$?.where ?? {};
        out[ns] = (state[ns] ?? []).filter((row) => Object.entries(where).every(([k, v]) => row[k] === v));
      }
      return out;
    }),
    transact: vi.fn(async () => ({})),
  };
}

const app = (id, over = {}) => ({
  id,
  groupId: CHAPTER,
  stripeRuntime: "live",
  status: "paid_pending_vetting",
  firstName: "Jane",
  lastName: "Doe",
  email: `${id}@example.com`,
  phone: "555",
  state: "UT",
  createdAt: NOW - 30 * HOUR,
  ...over,
});

const group = { id: CHAPTER, name: "Silver & Salt Capital", replyTo: "tori@silverandsaltcapital.com", notificationEmail: "tori@silverandsaltcapital.com" };
const stallTiers = [
  { id: "standard", groupId: CHAPTER, name: "Standard Membership", priceCents: 100000 },
  { id: "steward", groupId: CHAPTER, name: "Community Steward", priceCents: 500000 },
  { id: "associate", groupId: CHAPTER, name: "Associate", priceCents: 0 },
];
const env = { ODLA_ENV: "prod", ODLA_RUNTIME: "live", EMAIL_FROM: "tori@silverandsaltcapital.com", SEND_EMAIL: { send: async () => ({ messageId: "m" }) } };
const contextFor = (db) => ({ chapter: { id: CHAPTER, config: { emails: { events: SIGNUP_EMAIL_EVENTS } } }, makeDb: () => db });

describe("remindUnbooked", () => {
  beforeEach(() => send.mockClear());

  it("sends the member reminder and the admin copy once each for a paid, unbooked application older than 24 hours", async () => {
    const db = fakeDb({ applications: [app("due")], groups: [group] });
    const run = await remindUnbooked(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    const [deps, member] = send.mock.calls[0];
    expect(deps.envName).toBe("prod");
    expect(deps.from).toBe("tori@silverandsaltcapital.com");
    expect(member).toMatchObject({
      template: "bookingReminder",
      to: "due@example.com",
      dedupeKey: "booking-reminder:due",
      applicationId: "due",
      vars: { firstName: "Jane", lastName: "Doe", email: "due@example.com", phone: "555", state: "UT" },
    });
    const [, admin] = send.mock.calls[1];
    expect(admin).toMatchObject({ template: "bookingReminderAdmin", to: "tori@silverandsaltcapital.com", dedupeKey: "booking-reminder:due:admin" });
  });

  it("uses the Stripe receipt time when one names the application", async () => {
    const db = fakeDb({
      applications: [app("late", { createdAt: NOW - 100 * HOUR })],
      stripeEventReceipts: [{ id: "r", kind: "first_payment", applicationId: "late", receivedAt: NOW - 2 * HOUR }],
      groups: [group],
    });
    const run = await remindUnbooked(contextFor(db), env, { now: NOW });
    expect(run.due).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("leaves everyone else alone", async () => {
    const db = fakeDb({
      applications: [
        app("fresh", { createdAt: NOW - 2 * HOUR }),
        app("booked"),
        app("staged", { status: "call_scheduled" }),
        app("waived", { interviewWaivedAt: NOW - 30 * HOUR }),
        app("reminded"),
        app("fresh-free", { status: "submitted", tierId: "associate", createdAt: NOW - 2 * HOUR }),
        app("fresh-unpaid", { status: "submitted", tierId: "standard", createdAt: NOW - 2 * HOUR }),
        app("reminded-free", { status: "submitted", tierId: "associate" }),
        app("reminded-unpaid", { status: "payment_pending", tierId: "standard" }),
        app("gone", { canceled: true }),
        app("other", { stripeRuntime: "cory" }),
        app("elsewhere", { groupId: "another-chapter" }),
      ],
      meetings: [{ id: "m", groupId: CHAPTER, applicationId: "booked", status: "scheduled" }],
      tiers: stallTiers,
      emailLog: [
        { id: "e", template: "bookingReminder", applicationId: "reminded" },
        { id: "e2", template: "bookingReminderFree", applicationId: "reminded-free" },
        { id: "e3", template: "paymentReminder", applicationId: "reminded-unpaid" },
      ],
      groups: [group],
    });
    const run = await remindUnbooked(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ due: 0, sent: 0, skipped: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the Associate booking reminder, without an admin copy, 24 hours after an unbooked free application", async () => {
    const db = fakeDb({ applications: [app("assoc", { status: "submitted", tierId: "associate" })], tiers: stallTiers, groups: [group] });
    const run = await remindUnbooked(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [, member] = send.mock.calls[0];
    expect(member).toMatchObject({
      template: "bookingReminderFree",
      to: "assoc@example.com",
      dedupeKey: "booking-reminder-free:assoc",
      applicationId: "assoc",
      vars: { firstName: "Jane", membersUrl: "https://silverandsaltcapital.com/members/" },
    });
  });

  it("sends the payment reminder, without an admin copy, 24 hours after a paid-tier application that never paid", async () => {
    const db = fakeDb({ applications: [app("unpaid", { status: "payment_pending", tierId: "steward" })], tiers: stallTiers, groups: [group] });
    const run = await remindUnbooked(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ due: 1, sent: 1, skipped: 0, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [, member] = send.mock.calls[0];
    expect(member).toMatchObject({ template: "paymentReminder", dedupeKey: "payment-reminder:unpaid", vars: { membersUrl: "https://silverandsaltcapital.com/members/" } });
  });

  it("a template that is not installed stops only its own stall; the others still send", async () => {
    send.mockImplementation(async (_deps, msg) => (msg.template === "paymentReminder" ? { sent: false, reason: "template-missing" } : { sent: true }));
    const db = fakeDb({
      applications: [
        app("unpaid-1", { status: "submitted", tierId: "standard" }),
        app("unpaid-2", { status: "submitted", tierId: "standard" }),
        app("assoc", { status: "submitted", tierId: "associate" }),
        app("paid"),
      ],
      tiers: stallTiers,
      groups: [group],
    });
    const run = await remindUnbooked(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ due: 4, sent: 2, skipped: 2, failed: 0, reason: "template-missing" });
    const templates = send.mock.calls.map(([, m]) => m.template);
    expect(templates.filter((t) => t === "paymentReminder")).toHaveLength(1);
    expect(templates).toContain("bookingReminderFree");
    expect(templates).toContain("bookingReminder");
    expect(templates).toContain("bookingReminderAdmin");
    send.mockImplementation(async () => ({ sent: true }));
  });

  it("stops and reports when the template is not installed yet", async () => {
    send.mockResolvedValueOnce({ sent: false, reason: "template-missing" });
    const db = fakeDb({ applications: [app("a"), app("b")], groups: [group] });
    const run = await remindUnbooked(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ due: 2, sent: 0, skipped: 2, failed: 0, reason: "template-missing" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("counts a transport failure and moves on without the admin copy", async () => {
    send.mockResolvedValueOnce({ sent: false, reason: "E_SEND" });
    const db = fakeDb({ applications: [app("a"), app("b")], groups: [group] });
    const run = await remindUnbooked(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ due: 2, sent: 1, skipped: 0, failed: 1 });
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe("signupPathsRoute", () => {
  it("is admin-only and reports each application's path by email", async () => {
    const db = fakeDb({
      applications: [app("a", { email: "A@Example.com" }), app("b", { status: "submitted", email: "b@example.com" })],
    });
    const ctx = { chapter: { id: CHAPTER, config: { emails: { events: SIGNUP_EMAIL_EVENTS } } }, makeDb: () => db, verifyUser: async () => ({ userId: "u" }), isAdmin: async () => true };
    const req = new Request("https://silverandsaltcapital.com/api/admin/signup-paths");
    const res = await signupPathsRoute(req, new URL(req.url), env, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paths["a@example.com"]).toMatchObject({ applicationId: "a", path: "awaiting_booking", label: "Paid, needs to book", reminderDueAt: NOW - 30 * HOUR + REMINDER_AFTER_MS });
    // Applied for a paid tier and never paid: the payment reminder falls due 24 hours after the application.
    expect(body.paths["b@example.com"]).toMatchObject({ path: "unpaid", label: "Applied, unpaid", paidAt: null, reminderDueAt: NOW - 30 * HOUR + REMINDER_AFTER_MS });

    const denied = await signupPathsRoute(req, new URL(req.url), env, { ...ctx, isAdmin: async () => false });
    expect(denied.status).toBe(403);
    const anon = await signupPathsRoute(req, new URL(req.url), env, { ...ctx, verifyUser: async () => null });
    expect(anon.status).toBe(401);
    expect(await signupPathsRoute(new Request("https://x/api/other"), new URL("https://x/api/other"), env, ctx)).toBeNull();
  });
});

describe("notifyAdminOfMilestones", () => {
  beforeEach(() => send.mockClear());
  const mountain = { ...group, schedulingJson: { timezone: "America/Denver" } };
  const tiers = [{ id: "standard", groupId: CHAPTER, name: "Standard Membership" }, { id: "associate", groupId: CHAPTER, name: "Associate" }];

  it("formats the meeting time in the chapter's booking timezone", () => {
    // 2027-01-15 17:00 UTC is 10:00 AM Mountain Standard Time.
    expect(meetingTimeLabel(Date.UTC(2027, 0, 15, 17, 0), "America/Denver")).toBe("Fri, Jan 15, 10:00 AM MST");
    expect(meetingTimeLabel(0, "Not/AZone")).toBe("1970-01-01T00:00:00.000Z");
  });

  it("tells Tori once per booked call, with the tier and the time", async () => {
    const db = fakeDb({
      applications: [app("booked", { tierId: "associate", status: "call_scheduled" })],
      meetings: [{ id: "m1", groupId: CHAPTER, applicationId: "booked", status: "scheduled", startAt: Date.UTC(2027, 0, 15, 17, 0), createdAt: NOW - HOUR }],
      tiers,
      groups: [mountain],
    });
    const run = await notifyAdminOfMilestones(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ booked: 1, approved: 0, sent: 1, failed: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const [, call] = send.mock.calls[0];
    expect(call).toMatchObject({
      template: "callBookedAdmin",
      to: "tori@silverandsaltcapital.com",
      dedupeKey: "call-booked:m1:admin",
      applicationId: "booked",
      vars: { firstName: "Jane", lastName: "Doe", tierName: "Associate", meetingTime: "Fri, Jan 15, 10:00 AM MST", adminUrl: "https://silverandsaltcapital.com/admin/" },
    });
  });

  it("tells Tori when a waived member is paid and approved", async () => {
    const db = fakeDb({
      applications: [app("known", { tierId: "standard", status: "approved", interviewWaivedAt: NOW - 2 * HOUR, approvedAt: NOW - HOUR })],
      tiers,
      groups: [mountain],
    });
    const run = await notifyAdminOfMilestones(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ booked: 0, approved: 1, sent: 1, failed: 0 });
    const [, call] = send.mock.calls[0];
    expect(call).toMatchObject({ template: "paidApprovedAdmin", dedupeKey: "paid-approved:known:admin", vars: { tierName: "Standard Membership" } });
    expect(call.vars.meetingTime).toBeUndefined();
  });

  it("skips what was already sent, what is old, and approvals that were not waived", async () => {
    const db = fakeDb({
      applications: [
        app("booked", { status: "call_scheduled" }),
        app("old", { status: "call_scheduled" }),
        app("manual", { status: "approved", approvedAt: NOW - HOUR }),
        app("stale", { status: "approved", interviewWaivedAt: NOW - 2 * MILESTONE_LOOKBACK_MS, approvedAt: NOW - 2 * MILESTONE_LOOKBACK_MS }),
        app("done", { status: "approved", interviewWaivedAt: NOW - HOUR, approvedAt: NOW - HOUR }),
      ],
      meetings: [
        { id: "m1", groupId: CHAPTER, applicationId: "booked", status: "scheduled", startAt: NOW, createdAt: NOW - HOUR },
        { id: "m2", groupId: CHAPTER, applicationId: "old", status: "scheduled", startAt: NOW, createdAt: NOW - 2 * MILESTONE_LOOKBACK_MS },
      ],
      emailLog: [
        { id: "e1", template: "callBookedAdmin", dedupeKey: "call-booked:m1:admin", deliveryState: "sent" },
        { id: "e2", template: "paidApprovedAdmin", dedupeKey: "paid-approved:done:admin", deliveryState: "sent" },
      ],
      groups: [mountain],
    });
    const run = await notifyAdminOfMilestones(contextFor(db), env, { now: NOW });
    expect(run).toEqual({ booked: 0, approved: 0, sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("stops when the template is not installed, and says nothing without a notification address", async () => {
    send.mockResolvedValueOnce({ sent: false, reason: "template-missing" });
    const meetings = [{ id: "m1", groupId: CHAPTER, applicationId: "a", status: "scheduled", startAt: NOW, createdAt: NOW - HOUR }];
    const db = fakeDb({ applications: [app("a")], meetings, groups: [mountain] });
    expect(await notifyAdminOfMilestones(contextFor(db), env, { now: NOW })).toEqual({ booked: 1, approved: 0, sent: 0, failed: 0, reason: "template-missing" });
    const quiet = fakeDb({ applications: [app("a")], meetings, groups: [{ ...mountain, notificationEmail: "" }] });
    expect(await notifyAdminOfMilestones(contextFor(quiet), env, { now: NOW })).toMatchObject({ reason: "notification-email-missing" });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
