// Reminders before the onboarding call (Tori, 2026-10-14): one the day before,
// with a link to pick a new time for anyone who is going to miss it, and one an
// hour before with the video link. The booking confirmation (Chapter's
// prepEmail) is still the only email at booking.
//
//   callReminderDayBefore  from 24 hours before the call until 3 hours before.
//                          Skipped for a call booked less than a day ahead,
//                          whose confirmation has only just gone out.
//   callReminderHour       in the last 65 minutes before the call. Skipped
//                          for a call booked inside that window.
//
// Each reminder is keyed to the meeting AND its start time, so a call moved to
// a new time gets its own reminders, and the cron (every five minutes) can
// never deliver one twice. Like the stall emails in src/signup-paths.ts, a
// template that is not installed or is switched off sends nothing.

import { emailGroupFrom, sendTemplated } from "@odla-ai/chapter";
import type { ChapterEnv, WorkerContext } from "@odla-ai/chapter/worker";
import { rescheduleUrl } from "./call-links.mjs";

export const DAY_BEFORE_TEMPLATE = "callReminderDayBefore";
export const HOUR_BEFORE_TEMPLATE = "callReminderHour";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
export const DAY_BEFORE_OPENS = DAY;
export const DAY_BEFORE_CLOSES = 3 * HOUR;
export const HOUR_BEFORE_OPENS = 65 * 60 * 1000;
// Statuses whose call is still on: anything closed gets no reminder.
const CLOSED = new Set(["approved", "declined", "refunded", "canceled"]);

type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "Tuesday, September 23, 2026 at 10:00 AM MDT", the prepEmail's own format. */
export function callTimeLabel(startAt: number, timezone: string): string {
  try {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(startAt);
    const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(startAt);
    return `${day} at ${time}`;
  } catch {
    return new Date(startAt).toISOString();
  }
}


/** Which reminder, if any, a scheduled meeting is due right now. */
export function reminderDue(meeting: Row, now: number): { template: string; key: string } | null {
  const startAt = num(meeting.startAt);
  if (startAt === null || startAt <= now) return null;
  const bookedAt = num(meeting.createdAt) ?? 0;
  const left = startAt - now;
  const id = `${String(meeting.id)}:${startAt}`;
  if (left <= HOUR_BEFORE_OPENS) {
    if (startAt - bookedAt <= HOUR_BEFORE_OPENS) return null;
    return { template: HOUR_BEFORE_TEMPLATE, key: `call-reminder-hour:${id}` };
  }
  if (left <= DAY_BEFORE_OPENS && left > DAY_BEFORE_CLOSES) {
    if (startAt - bookedAt < DAY_BEFORE_OPENS) return null;
    return { template: DAY_BEFORE_TEMPLATE, key: `call-reminder-day:${id}` };
  }
  return null;
}

export interface CallReminderRun { due: number; sent: number; skipped: number; failed: number; reason?: string }

export async function remindBeforeCalls(
  context: WorkerContext,
  env: ChapterEnv,
  opts: { now?: number; limit?: number } = {},
): Promise<CallReminderRun> {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 25;
  const chapter = context.chapter;
  const db = context.makeDb(env);
  const e = env as unknown as Record<string, unknown>;
  const runtime = typeof e.ODLA_RUNTIME === "string" ? e.ODLA_RUNTIME : undefined;

  const data = await db.query({
    meetings: { $: { where: { groupId: chapter.id, status: "scheduled" }, limit: 500 } },
    applications: { $: { where: { groupId: chapter.id }, limit: 500 } },
    groups: { $: { where: { id: chapter.id }, limit: 1 } },
    emailLog: { $: { where: { template: DAY_BEFORE_TEMPLATE }, limit: 500 } },
  });
  const hourLog = await db.query({ emailLog: { $: { where: { template: HOUR_BEFORE_TEMPLATE }, limit: 500 } } });
  // Reminders already delivered; sendTemplated would short-circuit them too,
  // but skipping here keeps each five-minute tick from counting them again.
  const sentKeys = new Set(
    [...(data.emailLog ?? []), ...(hourLog.emailLog ?? [])]
      .filter((r: Row) => !r.error || r.deliveryState === "sent")
      .map((r: Row) => String(r.dedupeKey ?? "")),
  );
  const apps = new Map(
    (data.applications ?? [])
      .filter((a: Row) => !runtime || typeof a.stripeRuntime !== "string" || a.stripeRuntime === runtime)
      .map((a: Row) => [String(a.id), a]),
  );
  const due: Array<{ meeting: Row; app: Row; template: string; key: string }> = [];
  for (const meeting of (data.meetings ?? []) as Row[]) {
    const app = apps.get(String(meeting.applicationId ?? ""));
    if (!app || !text(app.email) || app.canceled === true || CLOSED.has(text(app.status))) continue;
    const r = reminderDue(meeting, now);
    if (r && !sentKeys.has(r.key)) due.push({ meeting, app, ...r });
  }
  const run: CallReminderRun = { due: due.length, sent: 0, skipped: 0, failed: 0 };
  if (!due.length) return run;

  const groupRow = Array.isArray(data.groups) ? (data.groups[0] as Row | undefined) : undefined;
  if (!groupRow) return { ...run, skipped: due.length, reason: "group-missing" };
  const group = emailGroupFrom(groupRow);
  const scheduling = (groupRow.schedulingJson ?? {}) as Row;
  const fallbackTz = text(scheduling.timezone) || "America/Denver";
  const deps = {
    db,
    envName: text(e.ODLA_ENV),
    sender: e.SEND_EMAIL as Parameters<typeof sendTemplated>[0]["sender"],
    from: typeof e.EMAIL_FROM === "string" ? e.EMAIL_FROM : undefined,
    debugEmail: typeof e.ODLA_DEBUG_EMAIL === "string" ? e.ODLA_DEBUG_EMAIL : undefined,
    now: () => now,
    newId: () => crypto.randomUUID(),
  };

  const dead = new Set<string>();
  let attempted = 0;
  for (const { meeting, app, template, key } of due) {
    if (attempted >= limit) break;
    if (dead.has(template)) { run.skipped++; continue; }
    attempted++;
    const id = String(app.id);
    const result = await sendTemplated(deps, {
      group,
      template,
      event: chapter.config.emails?.events?.[template],
      to: text(app.email),
      vars: {
        firstName: text(app.firstName),
        lastName: text(app.lastName),
        email: text(app.email),
        phone: text(app.phone),
        state: text(app.state),
        startAt: callTimeLabel(num(meeting.startAt) ?? now, text(meeting.timezone) || fallbackTz),
        meetingLink: text(meeting.meetUrl) || text(meeting.htmlLink),
        rescheduleUrl: rescheduleUrl(id),
      },
      dedupeKey: key,
      applicationId: id,
    });
    if (result.sent) { run.sent++; continue; }
    if (["template-missing", "disabled", "template-retired", "template-invalid"].includes(result.reason ?? "")) {
      dead.add(template);
      run.skipped++;
      run.reason = run.reason ?? result.reason;
      continue;
    }
    run.failed++;
  }
  return run;
}
