// Admin moves and cancellations of onboarding calls (Tori, 2026-10-15), from
// the Calendar tab's call panel (src/app/admin/calendar.jsx).
//
//   POST /api/admin/calls/<meetingId>/move     { startAt, force? }
//        Any future time, not only the open slots: Tori may agree a time with
//        someone directly. A time that collides with something on the
//        calendar answers 409 { code: "busy" } unless `force` is set. Google
//        moves the event (same video link) and updates the invitation; we send
//        callMoved with the new time.
//
//   POST /api/admin/calls/<meetingId>/cancel-rebook
//        Cancels the call and invites the applicant to pick a new time. The
//        Google event is removed WITHOUT Google's own cancellation notice, so
//        our callCancelledRebook email is the one message they receive. The
//        application keeps its status, so the rebook link lands on booking.
//
// Plain "Cancel only" stays Chapter's own /api/admin/meetings/<id>/cancel
// (Google notifies the guest). The labels job follows either cancellation on
// its next five-minute tick.

import { emailGroupFrom, sendTemplated } from "@odla-ai/chapter";
import { initCalendar } from "@odla-ai/calendar";
import { callTimeLabel, rescheduleUrl } from "./call-links.mjs";
import { greetingName } from "./greeting-name.mjs";

const MOVE = /^\/api\/admin\/calls\/([0-9a-f-]+)\/move$/;
const CANCEL_REBOOK = /^\/api\/admin\/calls\/([0-9a-f-]+)\/cancel-rebook$/;
export const CALL_MOVED_TEMPLATE = "callMoved";
export const CALL_CANCELLED_TEMPLATE = "callCancelledRebook";
const MINUTE = 60 * 1000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const str = (v) => (typeof v === "string" ? v : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);


/** Busy blocks that overlap [startAt, endAt), ignoring the call's own current slot. */
export function conflicts(busy, startAt, endAt, own) {
  return (busy ?? []).filter((b) =>
    b.start < endAt && b.end > startAt && !(own && b.start === own.startAt && b.end === own.endAt));
}

const calendarFor = (env) => initCalendar({ appId: env.ODLA_APP_ID, env: env.ODLA_ENV, adminToken: env.ODLA_API_KEY, endpoint: env.ODLA_PLATFORM });

async function admin(req, env, ctx) {
  const user = await ctx.verifyUser(req, env);
  if (!user) return { error: json({ error: "unauthorized" }, 401) };
  const db = ctx.makeDb(env);
  if (!(await ctx.isAdmin(db, user))) return { error: json({ error: "forbidden" }, 403) };
  return { db };
}

/** The call, its application and the group, checked to belong to this chapter and runtime. */
async function loadCall(db, ctx, env, meetingId) {
  const { meetings } = await db.query({ meetings: { $: { where: { id: meetingId }, limit: 1 } } });
  const meeting = meetings?.[0];
  if (!meeting || (meeting.groupId !== undefined && meeting.groupId !== ctx.chapter.id)) return null;
  const { applications } = await db.query({ applications: { $: { where: { id: str(meeting.applicationId) }, limit: 1 } } });
  const app = applications?.[0];
  if (!app || str(app.groupId) !== ctx.chapter.id) return null;
  if (typeof app.stripeRuntime === "string" && app.stripeRuntime !== (env.ODLA_RUNTIME ?? "default")) return null;
  const { groups } = await db.query({ groups: { $: { where: { id: ctx.chapter.id }, limit: 1 } } });
  return { meeting, app, group: groups?.[0] ?? null };
}

async function email(db, env, ctx, group, app, template, vars, dedupeKey) {
  if (!group || !str(app.email)) return { sent: false, reason: "no-recipient" };
  return sendTemplated({
    db,
    envName: str(env.ODLA_ENV),
    sender: env.SEND_EMAIL,
    from: typeof env.EMAIL_FROM === "string" ? env.EMAIL_FROM : undefined,
    debugEmail: typeof env.ODLA_DEBUG_EMAIL === "string" ? env.ODLA_DEBUG_EMAIL : undefined,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  }, {
    group: emailGroupFrom(group),
    template,
    event: ctx.chapter.config?.emails?.events?.[template],
    to: str(app.email),
    vars: { firstName: greetingName(app), lastName: str(app.lastName), email: str(app.email), phone: str(app.phone), state: str(app.state), ...vars },
    dedupeKey,
    applicationId: str(app.id),
  });
}

/** @param {{ calendar?: (env) => ReturnType<typeof initCalendar>, now?: () => number }} [deps] */
export function makeCallAdminRoute(deps = {}) {
  const calendar = deps.calendar ?? calendarFor;
  const clock = deps.now ?? (() => Date.now());

  return async (req, url, env, ctx) => {
    const move = url.pathname.match(MOVE);
    const cancel = url.pathname.match(CANCEL_REBOOK);
    if (req.method !== "POST" || (!move && !cancel)) return null;
    const auth = await admin(req, env, ctx);
    if (auth.error) return auth.error;
    const { db } = auth;
    let body = {};
    try { body = JSON.parse((await req.text()) || "{}"); } catch { return json({ error: "bad request" }, 400); }
    const call = await loadCall(db, ctx, env, (move ?? cancel)[1]);
    if (!call) return json({ error: "not found" }, 404);
    const { meeting, app, group } = call;
    if (str(meeting.status) !== "scheduled") return json({ error: "This call is already cancelled." }, 409);
    if (!str(meeting.googleEventId)) return json({ error: "This call has no calendar event on file." }, 409);
    const scheduling = group?.schedulingJson ?? {};
    const timezone = str(meeting.timezone) || str(scheduling.timezone) || "America/Denver";
    const now = clock();
    const cal = calendar(env);

    if (move) {
      const startAt = num(Number(body.startAt));
      if (startAt === null) return json({ error: "Pick a new time." }, 400);
      if (startAt <= now) return json({ error: "Pick a time in the future." }, 400);
      const length = num(meeting.endAt) && num(meeting.startAt) ? meeting.endAt - meeting.startAt : (num(scheduling.slotMinutes) ?? 30) * MINUTE;
      const endAt = startAt + length;
      if (startAt === meeting.startAt) return json({ error: "The call is already at that time." }, 400);
      if (body.force !== true) {
        try {
          const fb = await cal.availability.freeBusy({ timeMin: startAt, timeMax: endAt, timeZone: timezone });
          const hits = conflicts(fb.busy, startAt, endAt, { startAt: meeting.startAt, endAt: meeting.endAt });
          if (hits.length) return json({ error: "Something else is on your calendar at that time.", code: "busy" }, 409);
        } catch {
          return json({ error: "Your calendar could not be checked. Try again, or move it anyway.", code: "busy_unknown" }, 409);
        }
      }
      try {
        await cal.actions.reschedule(str(meeting.googleEventId), { idempotencyKey: `meeting:${meeting.id}:reschedule:${startAt}:${endAt}`, startAt, endAt });
      } catch {
        return json({ error: "Google Calendar did not accept the move. Nothing was changed." }, 502);
      }
      await db.transact([
        { t: "update", ns: "meetings", id: String(meeting.id), attrs: { startAt, endAt, drift: "none" } },
        { t: "update", ns: "applications", id: String(app.id), attrs: { meetingAt: startAt } },
      ]);
      const sent = await email(db, env, ctx, group, app, CALL_MOVED_TEMPLATE, {
        startAt: callTimeLabel(startAt, timezone),
        meetingLink: str(meeting.meetUrl) || str(meeting.htmlLink),
        rescheduleUrl: rescheduleUrl(String(app.id)),
      }, `call-moved:${meeting.id}:${startAt}`).catch(() => ({ sent: false }));
      return json({ ok: true, startAt, endAt, emailed: !!sent.sent });
    }

    // Cancel and invite to rebook.
    try {
      await cal.actions.cancel(str(meeting.googleEventId), { idempotencyKey: `meeting:${meeting.id}:cancel`, notify: false });
    } catch {
      return json({ error: "Google Calendar did not accept the cancellation. Nothing was changed." }, 502);
    }
    await db.transact([
      { t: "update", ns: "meetings", id: String(meeting.id), attrs: { status: "cancelled", drift: "none" } },
      { t: "update", ns: "applications", id: String(app.id), attrs: { meetingAt: 0, meetingLink: "" } },
    ]);
    const vars = { rescheduleUrl: rescheduleUrl(String(app.id)), membersUrl: "https://silverandsaltcapital.com/members/" };
    const key = `call-cancelled-rebook:${meeting.id}`;
    let sent = await email(db, env, ctx, group, app, CALL_CANCELLED_TEMPLATE, vars, key).catch(() => ({ sent: false }));
    // Until the email is installed, the ordinary booking reminder asks them to book.
    if (!sent.sent && ["template-missing", "disabled"].includes(sent.reason ?? "")) {
      const paid = typeof app.stripeSubscriptionId === "string" && app.stripeSubscriptionId !== "";
      sent = await email(db, env, ctx, group, app, paid ? "bookingReminder" : "bookingReminderFree", vars, key).catch(() => ({ sent: false }));
    }
    return json({ ok: true, emailed: !!sent.sent });
  };
}

export const callAdminRoute = makeCallAdminRoute();
