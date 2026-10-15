// Reminders before the onboarding call (src/call-reminders.ts).
import { describe, expect, it, vi } from "vitest";
import { render } from "preact-render-to-string";
import { h } from "preact";

const sent = vi.hoisted(() => []);
const outcome = vi.hoisted(() => ({ next: null }));
vi.mock("@odla-ai/chapter", async (orig) => ({
  ...(await orig()),
  sendTemplated: vi.fn(async (_deps, msg) => {
    sent.push(msg);
    return outcome.next ? outcome.next(msg) : { sent: true };
  }),
}));

const { reminderDue, remindBeforeCalls, callTimeLabel, DAY_BEFORE_TEMPLATE, HOUR_BEFORE_TEMPLATE } = await import("../src/call-reminders.ts");
const { rescheduleUrl } = await import("../src/call-links.mjs");
const { ChangeTime } = await import("../src/app/join-change-time.jsx");

const CHAPTER = "silver-and-salt-capital";
const HOUR = 3600e3;
const NOW = Date.UTC(2026, 9, 20, 16, 0);
const meeting = (over = {}) => ({ id: "m1", applicationId: "a1", groupId: CHAPTER, status: "scheduled", startAt: NOW + 20 * HOUR, createdAt: NOW - 3 * 24 * HOUR, timezone: "America/Denver", meetUrl: "https://meet.google.com/abc", ...over });

describe("reminderDue", () => {
  it("sends the day-before reminder between 24 and 3 hours ahead", () => {
    expect(reminderDue(meeting({ startAt: NOW + 25 * HOUR }), NOW)).toBeNull();
    expect(reminderDue(meeting({ startAt: NOW + 20 * HOUR }), NOW)).toEqual({ template: DAY_BEFORE_TEMPLATE, key: `call-reminder-day:m1:${NOW + 20 * HOUR}` });
    expect(reminderDue(meeting({ startAt: NOW + 2 * HOUR }), NOW)).toBeNull();
  });
  it("skips the day-before reminder for a call booked less than a day ahead", () => {
    expect(reminderDue(meeting({ startAt: NOW + 20 * HOUR, createdAt: NOW - HOUR }), NOW)).toBeNull();
  });
  it("sends the hour reminder in the last 65 minutes, unless the call was booked inside that window", () => {
    const startAt = NOW + 50 * 60e3;
    expect(reminderDue(meeting({ startAt }), NOW)).toEqual({ template: HOUR_BEFORE_TEMPLATE, key: `call-reminder-hour:m1:${startAt}` });
    expect(reminderDue(meeting({ startAt, createdAt: NOW - 10 * 60e3 }), NOW)).toBeNull();
    expect(reminderDue(meeting({ startAt: NOW - 60e3 }), NOW)).toBeNull();
  });
  it("gives a moved call its own reminders", () => {
    expect(reminderDue(meeting({ startAt: NOW + 20 * HOUR }), NOW).key).not.toBe(reminderDue(meeting({ startAt: NOW + 21 * HOUR }), NOW).key);
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
const app = (over = {}) => ({ id: "a1", groupId: CHAPTER, stripeRuntime: "live", status: "call_scheduled", firstName: "Jane", email: "jane@example.com", ...over });
const context = (db) => ({ chapter: { id: CHAPTER, config: { emails: { events: {} } } }, makeDb: () => db });
const env = { ODLA_ENV: "prod", ODLA_RUNTIME: "live" };
const state = (over = {}) => ({ meetings: [meeting()], applications: [app()], groups: [{ id: CHAPTER, name: "Silver & Salt Capital", schedulingJson: { timezone: "America/Denver" } }], emailLog: [], ...over });

describe("remindBeforeCalls", () => {
  it("sends the day-before reminder with the time, the video link and the rebook link", async () => {
    sent.length = 0; outcome.next = null;
    const run = await remindBeforeCalls(context(fakeDb(state())), env, { now: NOW });
    expect(run).toMatchObject({ due: 1, sent: 1 });
    expect(sent[0]).toMatchObject({ template: DAY_BEFORE_TEMPLATE, to: "jane@example.com", applicationId: "a1" });
    expect(sent[0].vars).toMatchObject({
      firstName: "Jane",
      startAt: callTimeLabel(NOW + 20 * HOUR, "America/Denver"),
      meetingLink: "https://meet.google.com/abc",
      rescheduleUrl: "https://silverandsaltcapital.com/join?application=a1",
    });
  });

  it("greets by the preferred name when the applicant gave one", async () => {
    sent.length = 0; outcome.next = null;
    await remindBeforeCalls(context(fakeDb(state({ applications: [app({ firstName: "Patricia", preferredName: "Pat" })] }))), env, { now: NOW });
    expect(sent[0].vars.firstName).toBe("Pat");
  });

  it("skips a reminder already delivered, and closed or other-runtime applications", async () => {
    sent.length = 0; outcome.next = null;
    const key = `call-reminder-day:m1:${NOW + 20 * HOUR}`;
    expect((await remindBeforeCalls(context(fakeDb(state({ emailLog: [{ template: DAY_BEFORE_TEMPLATE, dedupeKey: key }] }))), env, { now: NOW })).due).toBe(0);
    expect((await remindBeforeCalls(context(fakeDb(state({ applications: [app({ status: "declined" })] }))), env, { now: NOW })).due).toBe(0);
    expect((await remindBeforeCalls(context(fakeDb(state({ applications: [app({ stripeRuntime: "cory" })] }))), env, { now: NOW })).due).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing while the template is not installed", async () => {
    sent.length = 0; outcome.next = () => ({ sent: false, reason: "template-missing" });
    const run = await remindBeforeCalls(context(fakeDb(state())), env, { now: NOW });
    expect(run).toMatchObject({ sent: 0, skipped: 1, reason: "template-missing" });
    outcome.next = null;
  });

  it("formats the time the way the booking confirmation does", () => {
    expect(callTimeLabel(Date.UTC(2026, 8, 23, 16, 0), "America/Denver")).toBe("Wednesday, September 23, 2026 at 10:00 AM MDT");
  });
});

describe("Pick a new time", () => {
  it("is offered on the confirmation screen and links nowhere else", () => {
    const html = render(h(ChangeTime, { applicationId: "a1", onMoved: () => {} }));
    expect(html).toContain("Need a different time?");
    expect(html).toContain("Pick a new one");
  });
  it("is reached from the email by the application link", () => {
    expect(rescheduleUrl("a 1")).toBe("https://silverandsaltcapital.com/join?application=a%201");
  });
});
