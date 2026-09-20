// The three signup paths (Tori, 2026-09-19) and the one piece of them the
// Chapter package does not provide: the 24-hour booking reminder.
//
//   1. waived            Tori already knows her: an admission grant waives the
//                        call, payment approves her on the spot (Chapter).
//   2. booked            she paid and booked her call in one sitting; the
//                        prepEmail template is the single confirmation (Chapter).
//   3. awaiting_booking  she paid and left. Twenty-four hours after payment
//                        with no call on the calendar, this module sends her
//                        the bookingReminder template and Tori the
//                        bookingReminderAdmin copy, once per application.
//
// Everything here reads Chapter's own rows and sends through Chapter's own
// sendTemplated, so the reminder lands in the same email history, obeys the
// same dev redirect, and can never deliver twice (dedupeKey).
//
// Path classification is also served to the admin console at
// GET /api/admin/signup-paths so the People list can show the path at a glance.
//
// Tori's inbox (decision 2026-09-19): Chapter's own adminNotification is off
// (sends.adminNotification: "never" in chapter.config.mjs), because it fired
// at submit for people who then abandoned checkout. Both moments still show on
// the People list. The two notices she does want come from this module on the
// same cron: callBookedAdmin when a call lands on the calendar, and
// paidApprovedAdmin when a waived member pays and is approved without a call.

import { emailGroupFrom, sendTemplated, type ChapterDb } from "@odla-ai/chapter";
import type { ChapterEnv, Route, WorkerContext } from "@odla-ai/chapter/worker";

export const REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;
export const REMINDER_TEMPLATE = "bookingReminder";
export const REMINDER_ADMIN_TEMPLATE = "bookingReminderAdmin";
export const SIGNUP_PATHS_PATH = "/api/admin/signup-paths";
export const CALL_BOOKED_ADMIN_TEMPLATE = "callBookedAdmin";
export const PAID_APPROVED_ADMIN_TEMPLATE = "paidApprovedAdmin";
// A notice is only worth sending while it is news; older rows (a first deploy,
// a long outage) are left alone rather than flooding the inbox.
export const MILESTONE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_URL = "https://silverandsaltcapital.com/admin/";

type Row = Record<string, unknown>;

export type SignupPath = "waived" | "booked" | "awaiting_booking" | "reminded" | "unpaid" | "closed";

export const SIGNUP_PATH_LABELS: Record<SignupPath, string> = {
  waived: "Known to Tori, no call",
  booked: "Call booked",
  awaiting_booking: "Paid, needs to book",
  reminded: "Reminded, needs to book",
  unpaid: "Applied, unpaid",
  closed: "Closed",
};

const CLOSED = new Set(["refunded", "declined", "canceled"]);
const CALL_STAGES = new Set(["call_scheduled", "interviewed", "approved"]);

export interface PathFacts {
  // Application ids with a scheduled meeting row.
  scheduled: Set<string>;
  // Application ids that already received the reminder (a non-failed emailLog row).
  reminded: Set<string>;
  // Application id -> epoch ms of the first successful payment, when a Stripe
  // receipt names the application. Absent rows fall back to createdAt.
  paidAt: Map<string, number>;
}

export function classifyPath(app: Row, facts: PathFacts): SignupPath {
  const id = String(app.id ?? "");
  const status = String(app.status ?? "");
  if (app.canceled === true || CLOSED.has(status)) return "closed";
  if (typeof app.interviewWaivedAt === "number") return "waived";
  const meetingAt = typeof app.meetingAt === "number" ? app.meetingAt : 0;
  if (facts.scheduled.has(id) || meetingAt > 0 || CALL_STAGES.has(status)) return "booked";
  if (status === "paid_pending_vetting") return facts.reminded.has(id) ? "reminded" : "awaiting_booking";
  return "unpaid";
}

// When her membership became paid for. A Stripe first-payment receipt is the
// precise answer; a named (gift) seat is paid the moment she accepts it; and
// because payment follows the application within the same sitting, the
// application's own timestamp is a safe floor for everything else.
export function paidAtOf(app: Row, facts: PathFacts): number | null {
  const fromReceipt = facts.paidAt.get(String(app.id ?? ""));
  if (typeof fromReceipt === "number") return fromReceipt;
  if (typeof app.namedSeatAcceptedAt === "number") return app.namedSeatAcceptedAt;
  return typeof app.createdAt === "number" ? app.createdAt : null;
}

// Mirrors Chapter's own runtime scoping: on the shared dev tenant, each
// developer Worker sees only the applications its Stripe runtime created.
function inRuntime(app: Row, runtime: string | undefined): boolean {
  if (runtime) return app.stripeRuntime === runtime;
  return app.stripeRuntime === undefined || app.stripeRuntime === "default";
}

export async function loadSignupPaths(db: ChapterDb, chapterId: string, runtime: string | undefined) {
  const data = await db.query({
    applications: { $: { where: { groupId: chapterId }, limit: 500 } },
    meetings: { $: { where: { groupId: chapterId, status: "scheduled" }, limit: 500 } },
    emailLog: { $: { where: { template: REMINDER_TEMPLATE }, limit: 500 } },
    stripeEventReceipts: { $: { where: { kind: "first_payment" }, limit: 500 } },
  });
  const rows = (data.applications ?? []).filter((app) => inRuntime(app, runtime));
  const scheduled = new Set((data.meetings ?? []).map((m) => String(m.applicationId ?? "")));
  const reminded = new Set(
    (data.emailLog ?? [])
      .filter((r) => !r.error || r.error === "" || r.deliveryState === "sent")
      .map((r) => String(r.applicationId ?? "")),
  );
  const paidAt = new Map<string, number>();
  for (const receipt of data.stripeEventReceipts ?? []) {
    const appId = typeof receipt.applicationId === "string" ? receipt.applicationId : null;
    const at = typeof receipt.receivedAt === "number" ? receipt.receivedAt : null;
    if (!appId || at === null) continue;
    const prior = paidAt.get(appId);
    if (prior === undefined || at < prior) paidAt.set(appId, at);
  }
  return { rows, facts: { scheduled, reminded, paidAt } as PathFacts };
}

export interface ReminderRun {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Send the 24-hour reminder to every paid, unbooked application that is due,
 * and the admin copy to the group's notification inbox. Safe to run on every
 * cron tick: dedupeKey makes each application a single durable delivery.
 */
export async function remindUnbooked(
  context: WorkerContext,
  env: ChapterEnv,
  opts: { now?: number; limit?: number } = {},
): Promise<ReminderRun> {
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 25;
  const chapter = context.chapter;
  const db = context.makeDb(env);
  const e = env as unknown as Record<string, unknown>;
  const runtime = typeof e.ODLA_RUNTIME === "string" ? e.ODLA_RUNTIME : undefined;

  const { rows, facts } = await loadSignupPaths(db, chapter.id, runtime);
  const due = rows.filter((app) => {
    if (classifyPath(app, facts) !== "awaiting_booking") return false;
    if (!text(app.email)) return false;
    const paidAt = paidAtOf(app, facts);
    return paidAt !== null && paidAt + REMINDER_AFTER_MS <= now;
  });
  const run: ReminderRun = { due: due.length, sent: 0, skipped: 0, failed: 0 };
  if (!due.length) return run;

  const groups = (await db.query({ groups: { $: { where: { id: chapter.id }, limit: 1 } } })).groups;
  const groupRow = Array.isArray(groups) ? groups[0] : undefined;
  if (!groupRow) return { ...run, skipped: due.length, reason: "group-missing" };
  const group = emailGroupFrom(groupRow);
  const deps = {
    db,
    envName: text(e.ODLA_ENV),
    sender: e.SEND_EMAIL as Parameters<typeof sendTemplated>[0]["sender"],
    from: typeof e.EMAIL_FROM === "string" ? e.EMAIL_FROM : undefined,
    debugEmail: typeof e.ODLA_DEBUG_EMAIL === "string" ? e.ODLA_DEBUG_EMAIL : undefined,
    now: () => now,
    newId: () => crypto.randomUUID(),
  };

  for (const app of due.slice(0, limit)) {
    const id = String(app.id);
    const vars = {
      firstName: text(app.firstName),
      lastName: text(app.lastName),
      email: text(app.email),
      phone: text(app.phone),
      state: text(app.state),
    };
    const member = await sendTemplated(deps, {
      group,
      template: REMINDER_TEMPLATE,
      to: vars.email,
      vars,
      dedupeKey: `booking-reminder:${id}`,
      applicationId: id,
    });
    if (!member.sent) {
      if (member.reason === "template-missing" || member.reason === "disabled") {
        // Nothing will send until the template exists; stop rather than loop.
        return { ...run, skipped: due.length - run.sent - run.failed, reason: member.reason };
      }
      run.failed++;
      continue;
    }
    run.sent++;
    const notify = text(groupRow.notificationEmail);
    if (notify) {
      await sendTemplated(deps, {
        group,
        template: REMINDER_ADMIN_TEMPLATE,
        to: notify,
        vars,
        dedupeKey: `booking-reminder:${id}:admin`,
        applicationId: id,
      });
    }
  }
  return run;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * Admin-only: the signup path of every application, keyed by lower-cased
 * email (the People list's own key) and by application id. Redacted to the
 * path, the payment time, and when the reminder falls due.
 */
export const signupPathsRoute: Route = async (req, url, env, ctx) => {
  if (req.method !== "GET" || url.pathname !== SIGNUP_PATHS_PATH) return null;
  const user = await ctx.verifyUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = ctx.makeDb(env);
  if (!(await ctx.isAdmin(db, user))) return json({ error: "forbidden" }, 403);
  const e = env as unknown as Record<string, unknown>;
  const runtime = typeof e.ODLA_RUNTIME === "string" ? e.ODLA_RUNTIME : undefined;
  const { rows, facts } = await loadSignupPaths(db, ctx.chapter.id, runtime);
  const byEmail: Record<string, { applicationId: string; path: SignupPath; label: string; paidAt: number | null; reminderDueAt: number | null }> = {};
  for (const app of rows) {
    const email = text(app.email).toLowerCase();
    if (!email) continue;
    const path = classifyPath(app, facts);
    const paidAt = path === "awaiting_booking" || path === "reminded" ? paidAtOf(app, facts) : null;
    byEmail[email] = {
      applicationId: String(app.id),
      path,
      label: SIGNUP_PATH_LABELS[path],
      paidAt,
      reminderDueAt: path === "awaiting_booking" && paidAt !== null ? paidAt + REMINDER_AFTER_MS : null,
    };
  }
  return json({ paths: byEmail });
};

// ── Admin milestone notices ──────────────────────────────────────────────────

export interface MilestoneRun {
  booked: number;
  approved: number;
  sent: number;
  failed: number;
  reason?: string;
}

/** "Tue, Sep 23, 10:00 AM MDT", in the chapter's booking timezone. */
export function meetingTimeLabel(startAt: number, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(startAt));
  } catch {
    return new Date(startAt).toISOString();
  }
}

const deliveredKeys = (rows: Row[] | undefined) =>
  new Set(
    (rows ?? [])
      .filter((r) => !r.error || r.error === "" || r.deliveryState === "sent")
      .map((r) => String(r.dedupeKey ?? "")),
  );

/**
 * Tell Tori when a call is booked and when a waived member is paid and
 * approved. Runs on every cron tick; each meeting and each approval is a single
 * durable delivery (dedupeKey), and nothing older than the lookback is sent.
 */
export async function notifyAdminOfMilestones(
  context: WorkerContext,
  env: ChapterEnv,
  opts: { now?: number; limit?: number } = {},
): Promise<MilestoneRun> {
  const now = opts.now ?? Date.now();
  const since = now - MILESTONE_LOOKBACK_MS;
  const limit = opts.limit ?? 25;
  const chapter = context.chapter;
  const db = context.makeDb(env);
  const e = env as unknown as Record<string, unknown>;
  const runtime = typeof e.ODLA_RUNTIME === "string" ? e.ODLA_RUNTIME : undefined;
  const run: MilestoneRun = { booked: 0, approved: 0, sent: 0, failed: 0 };

  const data = await db.query({
    applications: { $: { where: { groupId: chapter.id }, limit: 500 } },
    meetings: { $: { where: { groupId: chapter.id, status: "scheduled" }, limit: 500 } },
    tiers: { $: { where: { groupId: chapter.id }, limit: 50 } },
    groups: { $: { where: { id: chapter.id }, limit: 1 } },
    emailLog: { $: { where: { template: CALL_BOOKED_ADMIN_TEMPLATE }, limit: 500 } },
  });
  const approvedLog = await db.query({ emailLog: { $: { where: { template: PAID_APPROVED_ADMIN_TEMPLATE }, limit: 500 } } });
  const sentKeys = new Set([...deliveredKeys(data.emailLog), ...deliveredKeys(approvedLog.emailLog)]);

  const groupRow = Array.isArray(data.groups) ? data.groups[0] : undefined;
  const notify = text(groupRow?.notificationEmail);
  if (!groupRow || !notify) return { ...run, reason: groupRow ? "notification-email-missing" : "group-missing" };
  const scheduling = (groupRow.schedulingJson ?? {}) as Row;
  const timezone = text(scheduling.timezone) || "America/Denver";
  const apps = new Map((data.applications ?? []).filter((app) => inRuntime(app, runtime)).map((app) => [String(app.id), app]));
  const tierName = (tierId: unknown) => {
    const tier = (data.tiers ?? []).find((t) => t.id === tierId);
    return text(tier?.name) || text(tierId);
  };

  type Job = { template: string; dedupeKey: string; app: Row; vars: Record<string, string> };
  const jobs: Job[] = [];
  for (const meeting of data.meetings ?? []) {
    const app = apps.get(String(meeting.applicationId ?? ""));
    const createdAt = typeof meeting.createdAt === "number" ? meeting.createdAt : 0;
    if (!app || !text(app.email) || createdAt < since) continue;
    const dedupeKey = `call-booked:${String(meeting.id)}:admin`;
    if (sentKeys.has(dedupeKey)) continue;
    run.booked++;
    const startAt = typeof meeting.startAt === "number" ? meeting.startAt : now;
    jobs.push({ template: CALL_BOOKED_ADMIN_TEMPLATE, dedupeKey, app, vars: { meetingTime: meetingTimeLabel(startAt, timezone) } });
  }
  for (const app of apps.values()) {
    if (typeof app.interviewWaivedAt !== "number" || app.status !== "approved" || app.canceled === true) continue;
    const at = [app.approvedAt, app.updatedAt, app.createdAt].find((v) => typeof v === "number") as number | undefined;
    if (!text(app.email) || at === undefined || at < since) continue;
    const dedupeKey = `paid-approved:${String(app.id)}:admin`;
    if (sentKeys.has(dedupeKey)) continue;
    run.approved++;
    jobs.push({ template: PAID_APPROVED_ADMIN_TEMPLATE, dedupeKey, app, vars: {} });
  }
  if (!jobs.length) return run;

  const group = emailGroupFrom(groupRow);
  const deps = {
    db,
    envName: text(e.ODLA_ENV),
    sender: e.SEND_EMAIL as Parameters<typeof sendTemplated>[0]["sender"],
    from: typeof e.EMAIL_FROM === "string" ? e.EMAIL_FROM : undefined,
    debugEmail: typeof e.ODLA_DEBUG_EMAIL === "string" ? e.ODLA_DEBUG_EMAIL : undefined,
    now: () => now,
    newId: () => crypto.randomUUID(),
  };
  for (const job of jobs.slice(0, limit)) {
    const { app } = job;
    const result = await sendTemplated(deps, {
      group,
      template: job.template,
      to: notify,
      vars: {
        firstName: text(app.firstName),
        lastName: text(app.lastName),
        email: text(app.email),
        phone: text(app.phone),
        state: text(app.state),
        tierName: tierName(app.tierId),
        adminUrl: ADMIN_URL,
        ...job.vars,
      },
      dedupeKey: job.dedupeKey,
      applicationId: String(app.id),
    });
    if (result.sent) run.sent++;
    else if (result.reason === "template-missing" || result.reason === "disabled") return { ...run, reason: result.reason };
    else run.failed++;
  }
  return run;
}
