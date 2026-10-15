// Admin moves and cancel-and-rebook for onboarding calls
// (src/call-admin-route.mjs and the Calendar tab's call panel).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "preact-render-to-string";

const sent = vi.hoisted(() => []);
const sendResult = vi.hoisted(() => ({ next: null }));
vi.mock("@odla-ai/chapter", async (orig) => ({
  ...(await orig()),
  sendTemplated: vi.fn(async (_deps, msg) => { sent.push(msg); return sendResult.next ? sendResult.next(msg) : { sent: true }; }),
}));

const { makeCallAdminRoute, conflicts } = await import("../src/call-admin-route.mjs");
const { MeetingDetail, zonedTime } = await import("../src/app/admin/calendar.jsx");

const CHAPTER = "silver-and-salt-capital";
const HOUR = 3600e3;
const NOW = Date.UTC(2026, 9, 20, 16, 0);
const START = NOW + 48 * HOUR;
const MID = "0199f2a0-7c3e-7b10-9a51-3c2d1e0f4a5b";

function fakeDb(state) {
  return {
    state,
    query: vi.fn(async (q) => {
      const out = {};
      for (const ns of Object.keys(q)) {
        const where = q[ns].$?.where ?? {};
        out[ns] = (state[ns] ?? []).filter((row) => Object.entries(where).every(([k, v]) => row[k] === v));
      }
      return out;
    }),
    transact: vi.fn(async (ops) => {
      for (const op of ops) Object.assign(state[op.ns].find((r) => r.id === op.id), op.attrs);
      return {};
    }),
  };
}
const rows = () => ({
  meetings: [{ id: MID, applicationId: "a1", groupId: CHAPTER, status: "scheduled", startAt: START, endAt: START + 30 * 60e3, timezone: "America/Denver", googleEventId: "g1", meetUrl: "https://meet.google.com/abc" }],
  applications: [{ id: "a1", groupId: CHAPTER, stripeRuntime: "live", status: "call_scheduled", firstName: "Jane", preferredName: "Janie", email: "jane@example.com", meetingAt: START, stripeSubscriptionId: "sub_1" }],
  groups: [{ id: CHAPTER, name: "Silver & Salt Capital", schedulingJson: { timezone: "America/Denver", slotMinutes: 30 } }],
});
const fakeCal = (busy = []) => ({
  calls: [],
  availability: { freeBusy: vi.fn(async () => ({ busy })) },
  actions: {
    reschedule: vi.fn(async (...a) => ({ ok: true, a })),
    cancel: vi.fn(async (...a) => ({ ok: true, a })),
  },
});
const ctxFor = (db, admin = true) => ({ chapter: { id: CHAPTER, config: {} }, makeDb: () => db, verifyUser: async () => ({ userId: "tori" }), isAdmin: async () => admin });
const env = { ODLA_ENV: "prod", ODLA_RUNTIME: "live" };
const post = (route, db, path, body, admin) => {
  const req = new Request(`https://x.test${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
  return route(req, new URL(req.url), env, ctxFor(db, admin));
};

beforeEach(() => { sent.length = 0; sendResult.next = null; });

describe("moving a call", () => {
  it("moves to any future time, updates both rows and emails the new time", async () => {
    const cal = fakeCal();
    const route = makeCallAdminRoute({ calendar: () => cal, now: () => NOW });
    const db = fakeDb(rows());
    const to = NOW + 30 * HOUR + 30 * 60e3; // 7:30 am MDT, outside open hours
    const res = await post(route, db, `/api/admin/calls/${MID}/move`, { startAt: to });
    expect(res.status).toBe(200);
    expect(cal.actions.reschedule).toHaveBeenCalledWith("g1", expect.objectContaining({ startAt: to, endAt: to + 30 * 60e3 }));
    expect(db.state.meetings[0]).toMatchObject({ startAt: to, endAt: to + 30 * 60e3 });
    expect(db.state.applications[0].meetingAt).toBe(to);
    expect(sent[0]).toMatchObject({ template: "callMoved", to: "jane@example.com", dedupeKey: `call-moved:${MID}:${to}` });
    expect(sent[0].vars).toMatchObject({ firstName: "Janie", meetingLink: "https://meet.google.com/abc", rescheduleUrl: "https://silverandsaltcapital.com/join?application=a1" });
    expect(sent[0].vars.startAt).toMatch(/2026 at /);
  });

  it("asks before moving onto something already on the calendar, and moves when told to", async () => {
    const to = NOW + 30 * HOUR;
    const cal = fakeCal([{ start: to, end: to + HOUR, calendarId: "primary" }]);
    const route = makeCallAdminRoute({ calendar: () => cal, now: () => NOW });
    const db = fakeDb(rows());
    const res = await post(route, db, `/api/admin/calls/${MID}/move`, { startAt: to });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("busy");
    expect(cal.actions.reschedule).not.toHaveBeenCalled();
    const forced = await post(route, db, `/api/admin/calls/${MID}/move`, { startAt: to, force: true });
    expect(forced.status).toBe(200);
  });

  it("ignores the call's own slot when checking the calendar", () => {
    const own = { startAt: START, endAt: START + 30 * 60e3 };
    expect(conflicts([{ start: own.startAt, end: own.endAt }], START + 15 * 60e3, START + 45 * 60e3, own)).toEqual([]);
  });

  it("refuses a past time, a cancelled call, and anyone who is not an admin", async () => {
    const route = makeCallAdminRoute({ calendar: () => fakeCal(), now: () => NOW });
    expect((await post(route, fakeDb(rows()), `/api/admin/calls/${MID}/move`, { startAt: NOW - HOUR })).status).toBe(400);
    const cancelled = rows(); cancelled.meetings[0].status = "cancelled";
    expect((await post(route, fakeDb(cancelled), `/api/admin/calls/${MID}/move`, { startAt: NOW + 30 * HOUR })).status).toBe(409);
    expect((await post(route, fakeDb(rows()), `/api/admin/calls/${MID}/move`, { startAt: NOW + 30 * HOUR }, false)).status).toBe(403);
  });
});

describe("cancel and invite to rebook", () => {
  it("cancels without Google's notice, reopens booking and sends our email", async () => {
    const cal = fakeCal();
    const route = makeCallAdminRoute({ calendar: () => cal, now: () => NOW });
    const db = fakeDb(rows());
    const res = await post(route, db, `/api/admin/calls/${MID}/cancel-rebook`);
    expect(res.status).toBe(200);
    expect(cal.actions.cancel).toHaveBeenCalledWith("g1", expect.objectContaining({ notify: false }));
    expect(db.state.meetings[0].status).toBe("cancelled");
    expect(db.state.applications[0]).toMatchObject({ meetingAt: 0, meetingLink: "", status: "call_scheduled" });
    expect(sent.map((m) => m.template)).toEqual(["callCancelledRebook"]);
    expect(sent[0].vars.rescheduleUrl).toBe("https://silverandsaltcapital.com/join?application=a1");
  });

  it("falls back to the booking reminder until the email is installed", async () => {
    sendResult.next = (msg) => (msg.template === "callCancelledRebook" ? { sent: false, reason: "template-missing" } : { sent: true });
    const route = makeCallAdminRoute({ calendar: () => fakeCal(), now: () => NOW });
    const res = await post(route, fakeDb(rows()), `/api/admin/calls/${MID}/cancel-rebook`);
    expect((await res.json()).emailed).toBe(true);
    expect(sent.map((m) => m.template)).toEqual(["callCancelledRebook", "bookingReminder"]);
  });

  it("changes nothing when Google refuses", async () => {
    const cal = fakeCal();
    cal.actions.cancel = vi.fn(async () => { throw new Error("upstream"); });
    const route = makeCallAdminRoute({ calendar: () => cal, now: () => NOW });
    const db = fakeDb(rows());
    expect((await post(route, db, `/api/admin/calls/${MID}/cancel-rebook`)).status).toBe(502);
    expect(db.state.meetings[0].status).toBe("scheduled");
    expect(sent).toHaveLength(0);
  });
});

describe("the call panel", () => {
  const m = { id: "m1", status: "scheduled", startAt: START, endAt: START + 30 * 60e3, applicant: { name: "Jane Doe", email: "jane@example.com" }, drift: "none" };
  it("offers Move and Cancel on an upcoming call", () => {
    const html = render(<MeetingDetail m={m} tz="America/Denver" onChanged={() => {}} onClose={() => {}} now={NOW} />);
    expect(html).toContain("Move the call");
    expect(html).toContain("Cancel the call");
  });
  it("offers neither once the call has passed", () => {
    const html = render(<MeetingDetail m={m} tz="America/Denver" onChanged={() => {}} onClose={() => {}} now={START + HOUR} />);
    expect(html).not.toContain("Move the call");
    expect(html).not.toContain("Cancel the call");
  });
  it("reads a typed date and time in the calendar's timezone", () => {
    expect(zonedTime("2026-10-20", "07:30", "America/Denver")).toBe(Date.UTC(2026, 9, 20, 13, 30));
    expect(zonedTime("2026-12-01", "07:30", "America/Denver")).toBe(Date.UTC(2026, 11, 1, 14, 30));
  });
});
