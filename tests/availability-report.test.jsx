// Open time for onboarding calls over the next 14 days
// (src/availability-report.mjs and the report under Settings > Calendar).
import { describe, expect, it, vi } from "vitest";
import { render } from "preact-render-to-string";
import {
  AVAILABILITY_NS,
  AVAILABILITY_REPORT_PATH,
  makeAvailabilityReportRoute,
  measureAvailability,
  takeDailyAvailabilitySnapshot,
} from "../src/availability-report.mjs";
import { AvailabilityView, dayNote, hours } from "../src/app/admin/availability-report.jsx";
import { showsCalendar, withAvailabilityReport } from "../src/app/admin/settings-workspace.jsx";

const CHAPTER = "silver-and-salt-capital";
const HOUR = 3600e3;
// Wednesday 14 October 2026, 08:00 Pacific. The 14 days run to Tuesday the 27th: ten weekdays.
const NOW = Date.UTC(2026, 9, 14, 15);
const SCHEDULING = { slotMinutes: 30, days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, timezone: "America/Los_Angeles", minNoticeHours: 0, windowDays: 21 };
// Thursday the 15th, 10:00 to 11:00 Pacific: an onboarding call then something else.
const THU_10 = Date.UTC(2026, 9, 15, 17);
const BUSY = [{ start: THU_10, end: THU_10 + HOUR }];
const MEETINGS = [
  { id: "m1", groupId: CHAPTER, status: "scheduled", startAt: THU_10, endAt: THU_10 + 0.5 * HOUR },
  { id: "m2", groupId: CHAPTER, status: "scheduled", startAt: NOW + 20 * 24 * HOUR, endAt: NOW + 20 * 24 * HOUR + 0.5 * HOUR },
];

function fakeDb(state) {
  return {
    state,
    writes: [],
    async query(q) {
      const out = {};
      for (const ns of Object.keys(q)) {
        const where = q[ns].$?.where ?? {};
        out[ns] = (state[ns] ?? []).filter((row) => Object.entries(where).every(([k, v]) => row[k] === v));
      }
      return out;
    },
    async transact(ops, opts) {
      this.writes.push({ ops, opts });
      for (const op of ops) (state[op.ns] ??= []).push(op.attrs);
    },
  };
}
const calendar = (busy = BUSY, extra = {}) => ({ availability: { freeBusy: vi.fn(async ({ timeMin, timeMax }) => ({ timeMin, timeMax, busy, ...extra })) } });
const state = () => ({ groups: [{ id: CHAPTER, schedulingJson: SCHEDULING }], meetings: MEETINGS.map((m) => ({ ...m })) });

describe("measureAvailability", () => {
  const m = measureAvailability({ busy: BUSY, scheduling: SCHEDULING, meetings: MEETINGS, now: NOW });

  it("counts open time the way the booking step offers it", () => {
    // Ten weekdays of 9 to 5, less the one busy hour on Thursday.
    expect(m.offeredMinutes).toBe(10 * 8 * 60);
    expect(m.openMinutes).toBe(10 * 8 * 60 - 60);
    expect(m.openSlots).toBe(m.openMinutes / 30);
    expect(m.targetMinutes).toBe(600);
    expect(m.firstOpenAt).toBe(Date.UTC(2026, 9, 14, 16)); // Wednesday 09:00 Pacific
  });

  it("lists all 14 days, weekends included, with Thursday's hour taken", () => {
    expect(m.days).toHaveLength(14);
    expect(m.days[0]).toEqual({ date: "2026-10-14", workday: true, offeredMinutes: 480, openMinutes: 480, noticeMinutes: 0 });
    expect(m.days[1]).toEqual({ date: "2026-10-15", workday: true, offeredMinutes: 480, openMinutes: 420, noticeMinutes: 0 });
    expect(m.days.find((d) => d.date === "2026-10-17")).toEqual({ date: "2026-10-17", workday: false, offeredMinutes: 0, openMinutes: 0, noticeMinutes: 0 });
  });

  it("counts only the calls inside the 14 days", () => {
    expect(m.callCount).toBe(1);
    expect(m.callMinutes).toBe(30);
  });

  it("leaves out time inside the minimum notice", () => {
    const soon = measureAvailability({ busy: [], scheduling: { ...SCHEDULING, minNoticeHours: 24 }, now: NOW });
    expect(soon.openMinutes).toBe(soon.offeredMinutes);
    expect(soon.firstOpenAt).toBe(Date.UTC(2026, 9, 15, 16)); // Thursday 09:00
    // Wednesday's hours are all inside the notice: shown as such, never as "Not offered".
    expect(soon.days[0]).toMatchObject({ offeredMinutes: 0, noticeMinutes: 480 });
    expect(render(<AvailabilityView live={soon} history={[]} />)).toContain("Inside notice");
  });
});

describe("the daily snapshot", () => {
  it("records the day once, in the scheduling timezone", async () => {
    const db = fakeDb(state());
    // 00:05 Pacific on Thursday the 15th.
    const at = Date.UTC(2026, 9, 15, 7, 5);
    expect(await takeDailyAvailabilitySnapshot(db, calendar(), CHAPTER, { now: at })).toMatchObject({ taken: "2026-10-15" });
    const row = db.writes[0].ops[0];
    expect(row.ns).toBe(AVAILABILITY_NS);
    expect(row.attrs).toMatchObject({ id: "availability:2026-10-15", day: "2026-10-15", takenAt: at, targetMinutes: 600, callCount: 1 });
    expect(row.attrs.detail.days).toHaveLength(14);
    expect(db.writes[0].opts).toEqual({ mutationId: "availability:2026-10-15" });

    expect(await takeDailyAvailabilitySnapshot(db, calendar(), CHAPTER, { now: at + 5 * 60e3 })).toEqual({ skipped: "taken", day: "2026-10-15" });
    expect(db.writes).toHaveLength(1);
  });

  it("writes nothing when the calendar reports an error", async () => {
    const db = fakeDb(state());
    await expect(takeDailyAvailabilitySnapshot(db, calendar([], { errors: [{ calendarId: "primary", reason: "notFound" }] }), CHAPTER, { now: NOW })).rejects.toThrow();
    expect(db.writes).toHaveLength(0);
  });
});

describe("GET /api/admin/availability-report", () => {
  const ctxFor = (db, { user = { id: "u1" }, admin = true } = {}) => ({
    chapter: { id: CHAPTER },
    verifyUser: async () => user,
    isAdmin: async () => admin,
    makeDb: () => db,
  });
  const get = (route, ctx) => route(new Request("https://x" + AVAILABILITY_REPORT_PATH), new URL("https://x" + AVAILABILITY_REPORT_PATH), {}, ctx);

  it("ignores other paths", async () => {
    const route = makeAvailabilityReportRoute({ calendar: () => calendar(), now: () => NOW });
    expect(await route(new Request("https://x/api/other"), new URL("https://x/api/other"), {}, ctxFor(fakeDb(state())))).toBeNull();
  });

  it("is for admins only", async () => {
    const route = makeAvailabilityReportRoute({ calendar: () => calendar(), now: () => NOW });
    expect((await get(route, ctxFor(fakeDb(state()), { user: null }))).status).toBe(401);
    expect((await get(route, ctxFor(fakeDb(state()), { admin: false }))).status).toBe(403);
  });

  it("answers with the live numbers and the history, oldest first", async () => {
    const db = fakeDb({ ...state(), [AVAILABILITY_NS]: [
      { id: "availability:2026-10-13", day: "2026-10-13", takenAt: 1, openMinutes: 700, offeredMinutes: 4800, callCount: 0, targetMinutes: 600 },
      { id: "availability:2026-10-12", day: "2026-10-12", takenAt: 0, openMinutes: 500, offeredMinutes: 4800, callCount: 2, targetMinutes: 600 },
    ] });
    const route = makeAvailabilityReportRoute({ calendar: () => calendar(), now: () => NOW });
    const res = await get(route, ctxFor(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.live.openMinutes).toBe(4740);
    expect(body.history.map((h) => h.day)).toEqual(["2026-10-12", "2026-10-13"]);
  });

  it("still answers with the history when the calendar cannot be read", async () => {
    const route = makeAvailabilityReportRoute({ calendar: () => ({ availability: { freeBusy: async () => { throw new Error("down"); } } }), now: () => NOW });
    const body = await (await get(route, ctxFor(fakeDb(state())))).json();
    expect(body.live).toBeNull();
    expect(body.error).toMatch(/could not be read/);
  });
});

describe("the report under the hours form", () => {
  const live = measureAvailability({ busy: BUSY, scheduling: SCHEDULING, meetings: MEETINGS, now: NOW });

  it("shows the open hours against the target, day by day", () => {
    const html = render(<AvailabilityView live={live} history={[]} />);
    expect(html).toContain("79 hours open");
    expect(html).toContain("of a 10-hour target");
    expect(html).toContain("On target");
    expect(html).toContain("7h of 8h");
    expect(html).toContain("Not offered");
    expect(html).toContain("The daily record starts");
    // House style: no em or en dashes in anything Tori reads.
    expect(html).not.toMatch(/[–—]/);
  });

  it("says how far short a thin fortnight is", () => {
    const thin = measureAvailability({ busy: [{ start: NOW, end: NOW + 13 * 24 * HOUR }], scheduling: SCHEDULING, now: NOW });
    const html = render(<AvailabilityView live={thin} history={[]} />);
    expect(html).toContain(`${hours(thin.openMinutes)} open`);
    expect(html).toContain("short");
  });

  it("labels each day for what it is", () => {
    expect(dayNote({ workday: true, offeredMinutes: 480, openMinutes: 420, noticeMinutes: 0 }, 3)).toBe("7h of 8h");
    expect(dayNote({ workday: false, offeredMinutes: 0, openMinutes: 0, noticeMinutes: 0 }, 3)).toBe("Not offered");
    expect(dayNote({ workday: true, offeredMinutes: 0, openMinutes: 0, noticeMinutes: 240 }, 1)).toBe("Inside notice");
    // Today, after the day's hours: passed, not withheld.
    expect(dayNote({ workday: true, offeredMinutes: 0, openMinutes: 0, noticeMinutes: 0 }, 0)).toBe("Done for today");
  });

  it("draws the trend once there are two mornings", () => {
    const history = [
      { day: "2026-10-12", openMinutes: 500, callCount: 2, targetMinutes: 600 },
      { day: "2026-10-13", openMinutes: 700, callCount: 0, targetMinutes: 600 },
    ];
    const html = render(<AvailabilityView live={live} history={history} />);
    expect(html).toContain("On target 1 of 2 days");
  });

  it("sits under Calendar only, in the owner console's Settings", () => {
    const settings = { id: "settings", defaultViewId: "calendar", render: () => "tabs" };
    const leader = { id: "settings", defaultViewId: "email", render: () => "tabs" };
    const [wrapped] = withAvailabilityReport()([settings]);
    expect(wrapped.render).not.toBe(settings.render);
    expect(withAvailabilityReport()([leader])[0]).toBe(leader);
    expect(showsCalendar({ viewId: undefined })).toBe(true);
    expect(showsCalendar({ viewId: "calendar" })).toBe(true);
    expect(showsCalendar({ viewId: "email" })).toBe(false);
  });
});
