// Open time for onboarding calls over the next 14 days (Tori, 2026-10-15).
//
// "Open" means exactly what an applicant sees on the booking step: a slot
// inside the hours set in Admin > Settings > Calendar, after the minimum
// notice, with nothing on the Google Calendar at that time. Booked calls are
// on the calendar, so they are not open. "Offered" is the same hours with an
// empty calendar, so offered minus open is time taken by calls and everything
// else. Set hours inside the minimum notice are counted apart, as noticeMinutes
// per day, since no one can book them yet. The target is 10 open hours in the next 14 days (Tori, 2026-10-15).
//
// The report reads FreeBusy blocks only, never event titles or guests.
//
// Two ways in:
//   GET /api/admin/availability-report   admins only; the live numbers plus
//        the daily history, shown under the hours form (settings-workspace.jsx).
//   availabilitySnapshotTick             the Worker cron; the first run after
//        midnight in the scheduling timezone records that day's numbers, one
//        availabilitySnapshots row per day, keyed `availability:<YYYY-MM-DD>`.

import { resolveScheduling } from "@odla-ai/chapter";
import { computeBookableSlots, initCalendar } from "@odla-ai/calendar";

export const AVAILABILITY_NS = "availabilitySnapshots";
export const AVAILABILITY_REPORT_PATH = "/api/admin/availability-report";
export const REPORT_DAYS = 14;
export const TARGET_OPEN_MINUTES = 10 * 60;
export const HISTORY_DAYS = 60;
const DAY = 864e5;
const MINUTE = 6e4;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** YYYY-MM-DD for an instant, in the given timezone. */
export const localDate = (ms, timezone) => new Date(ms).toLocaleDateString("en-CA", { timeZone: timezone });

const calendarFor = (env) => initCalendar({ appId: env.ODLA_APP_ID, env: env.ODLA_ENV, adminToken: env.ODLA_API_KEY, endpoint: env.ODLA_PLATFORM });

/**
 * The 14-day numbers from the calendar's busy blocks, the live scheduling
 * settings and the scheduled calls. Pure: everything it needs is passed in.
 */
export function measureAvailability({ busy, scheduling, meetings = [], now, days = REPORT_DAYS, targetMinutes = TARGET_OPEN_MINUTES }) {
  const cfg = resolveScheduling(scheduling ?? undefined);
  const from = now;
  const to = now + days * DAY;
  const options = {
    from,
    to,
    timezone: cfg.timezone,
    slotMinutes: cfg.slotMinutes,
    businessHours: { days: [...cfg.days], startHour: cfg.startHour, endHour: cfg.endHour },
    minNoticeMs: cfg.minNoticeHours * 36e5,
    now,
  };
  const offered = computeBookableSlots([], options);
  // Set hours that fall inside the minimum notice: working time no one can book yet.
  const withinNotice = computeBookableSlots([], { ...options, minNoticeMs: 0 }).filter((s) => s.startAt < now + options.minNoticeMs);
  const open = computeBookableSlots(busy ?? [], options);
  const minutes = (slots) => slots.length * cfg.slotMinutes;

  // Every calendar day in the window, weekends included, so a gap shows as a gap.
  const byDay = new Map();
  for (let i = 0; i < days; i++) {
    const date = localDate(now + i * DAY, cfg.timezone);
    // A working day is one of the weekdays set in the hours form.
    const workday = cfg.days.includes(new Date(date + "T12:00:00Z").getUTCDay());
    byDay.set(date, { workday, offeredMinutes: 0, openMinutes: 0, noticeMinutes: 0 });
  }
  const tally = (slots, key) => {
    for (const s of slots) {
      const day = byDay.get(localDate(s.startAt, cfg.timezone));
      if (day) day[key] += cfg.slotMinutes;
    }
  };
  tally(offered, "offeredMinutes");
  tally(open, "openMinutes");
  tally(withinNotice, "noticeMinutes");

  const calls = meetings.filter((m) => m?.status === "scheduled" && Number(m.startAt) >= from && Number(m.startAt) < to);
  const callMinutes = calls.reduce((sum, m) => {
    const length = Number(m.endAt) - Number(m.startAt);
    return sum + (Number.isFinite(length) && length > 0 ? Math.round(length / MINUTE) : cfg.slotMinutes);
  }, 0);

  return {
    from,
    to,
    timezone: cfg.timezone,
    slotMinutes: cfg.slotMinutes,
    targetMinutes,
    offeredMinutes: minutes(offered),
    openMinutes: minutes(open),
    openSlots: open.length,
    callCount: calls.length,
    callMinutes,
    firstOpenAt: open[0]?.startAt ?? null,
    days: [...byDay].map(([date, d]) => ({ date, ...d })),
  };
}

async function loadGroup(db, chapterId) {
  const { groups } = await db.query({ groups: { $: { where: { id: chapterId }, limit: 1 } } });
  return groups?.[0] ?? null;
}

/** Live numbers: the group's settings, the calendar and the scheduled calls. Throws when the calendar cannot answer. */
export async function liveAvailability(db, cal, chapterId, now) {
  const group = await loadGroup(db, chapterId);
  const scheduling = group?.schedulingJson ?? undefined;
  const fb = await cal.availability.freeBusy({ timeMin: now, timeMax: now + REPORT_DAYS * DAY });
  if (fb.errors?.length) throw new Error("calendar_unavailable");
  const { meetings } = await db.query({ meetings: { $: { where: { groupId: chapterId, status: "scheduled" }, limit: 500 } } });
  return measureAvailability({ busy: fb.busy, scheduling, meetings: meetings ?? [], now });
}

const snapshotId = (day) => `availability:${day}`;

/** The newest daily snapshots, oldest first, for the trend. */
export async function listAvailabilitySnapshots(db, limit = HISTORY_DAYS) {
  const res = await db.query({ [AVAILABILITY_NS]: { $: { order: { day: "desc" }, limit } } });
  return (res?.[AVAILABILITY_NS] ?? [])
    .map((r) => ({ day: r.day, takenAt: r.takenAt, openMinutes: r.openMinutes, offeredMinutes: r.offeredMinutes, callCount: r.callCount, targetMinutes: r.targetMinutes }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

/**
 * Record today's numbers once, on the first cron run of the day in the
 * scheduling timezone. Every later run is one lookup that finds it taken.
 */
export async function takeDailyAvailabilitySnapshot(db, cal, chapterId, { now = Date.now() } = {}) {
  const group = await loadGroup(db, chapterId);
  const timezone = resolveScheduling(group?.schedulingJson ?? undefined).timezone;
  const day = localDate(now, timezone);
  const id = snapshotId(day);
  const existing = await db.query({ [AVAILABILITY_NS]: { $: { where: { id }, limit: 1 } } });
  if (existing?.[AVAILABILITY_NS]?.length) return { skipped: "taken", day };
  const m = await liveAvailability(db, cal, chapterId, now);
  await db.transact(
    [{
      t: "update",
      ns: AVAILABILITY_NS,
      id,
      attrs: {
        id,
        day,
        takenAt: now,
        openMinutes: m.openMinutes,
        offeredMinutes: m.offeredMinutes,
        callCount: m.callCount,
        targetMinutes: m.targetMinutes,
        detail: { days: m.days, firstOpenAt: m.firstOpenAt, slotMinutes: m.slotMinutes, timezone: m.timezone, callMinutes: m.callMinutes },
      },
    }],
    { mutationId: id },
  );
  return { taken: day, openMinutes: m.openMinutes };
}

/** The cron entry: Worker env in, a one-line summary out. */
export async function availabilitySnapshotTick(context, env, { now = Date.now(), calendar = calendarFor } = {}) {
  return takeDailyAvailabilitySnapshot(context.makeDb(env), calendar(env), context.chapter.id, { now });
}

/** @param {{ calendar?: (env) => ReturnType<typeof initCalendar>, now?: () => number }} [deps] */
export function makeAvailabilityReportRoute(deps = {}) {
  const calendar = deps.calendar ?? calendarFor;
  const clock = deps.now ?? (() => Date.now());
  return async (req, url, env, ctx) => {
    if (url.pathname !== AVAILABILITY_REPORT_PATH) return null;
    if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
    const user = await ctx.verifyUser(req, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    const db = ctx.makeDb(env);
    if (!(await ctx.isAdmin(db, user))) return json({ error: "forbidden" }, 403);
    const history = await listAvailabilitySnapshots(db).catch(() => []);
    try {
      return json({ live: await liveAvailability(db, calendar(env), ctx.chapter.id, clock()), history });
    } catch (err) {
      console.error("availability-report", err?.message);
      return json({ live: null, history, error: "Your calendar could not be read just now. Try again in a minute." });
    }
  };
}

export const availabilityReportRoute = makeAvailabilityReportRoute();
