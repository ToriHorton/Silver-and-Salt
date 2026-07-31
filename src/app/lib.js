// Shared helpers for the Preact app islands (admin console, member area,
// join booking step). Auth (ClerkJS boot + session token) stays in
// /assets/member-auth.js, loaded as a classic script by each page before
// these modules run; islands consume it through window.SSCAuth.

export const api = (path, opts) => window.SSCAuth.api(path, opts);

// Cross-component refresh signals (e.g. cancelling a call refreshes the
// People tab). One page, one bus.
export const bus = new EventTarget();

export const ROLES = ["provisional", "member", "admin"];

export const STATUS_LABELS = {
  submitted: "Submitted",
  paid_pending_vetting: "Paid, pending vetting",
  call_scheduled: "Call scheduled",
  interviewed: "Interviewed",
  approved: "Approved",
  declined: "Declined",
  refunded: "Refunded",
};

export const APPROVABLE = ["paid_pending_vetting", "call_scheduled", "interviewed"];

export const TEMPLATE_META = {
  adminNotification: {
    title: "Admin alert: application paid",
    audience: "notification",
    purpose: "Sent to YOU (the notification address) when an applicant pays, so vetting can start.",
    hint: "{{firstName}} {{lastName}} {{email}} {{phone}} {{state}} {{adminUrl}}",
  },
  paymentConfirmation: {
    title: "Applicant: payment received",
    audience: "applicant",
    purpose: "Sent to the applicant right after their card is charged; includes the refund policy.",
    hint: "{{firstName}} {{membersUrl}} {{refundPolicyText}}",
  },
  prepEmail: {
    title: "Applicant: before your call",
    audience: "applicant",
    purpose: "Sent to the applicant when their introduction call is booked; carries the community commitment and norms.",
    hint: "{{firstName}} {{commitmentText}} {{normsText}}",
  },
  onboardingInvite: {
    title: "Applicant: welcome aboard",
    audience: "applicant",
    purpose: "Sent to the applicant when you approve them; links their member area.",
    hint: "{{firstName}} {{membersUrl}}",
  },
};

export const SUB_BADGE = { active: "paid", past_due: "refunded" };
export const SUB_LABELS = {
  active: "Active", past_due: "Past due", canceled: "Canceled",
  trialing: "Trialing", unpaid: "Unpaid", incomplete: "Incomplete",
  incomplete_expired: "Expired", paused: "Paused",
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const fmtMoney = (cents) => "$" + Math.round(cents / 100).toLocaleString();
export const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export const tzShort = (tz) => {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value || tz;
  } catch (e) { return tz; }
};

// Times render in the group scheduling timezone with an explicit
// abbreviation, never the viewer's unlabeled local zone.
export const fmtTzTime = (ms, tz) => new Date(ms).toLocaleString(undefined, {
  timeZone: tz, weekday: "short", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

export const toLocalInputValue = (ms) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    "T" + p(d.getHours()) + ":" + p(d.getMinutes());
};

// DST-safe day grouping for slot pickers (UI-COMPONENT-SPECS.md asks
// @odla-ai/calendar for a canonical helper; this is the interim).
export const dayKey = (ms, tz) => new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
export const dayLabel = (ms, tz) =>
  new Date(ms).toLocaleDateString(undefined, { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
export const timeLabel = (ms, tz) =>
  new Date(ms).toLocaleTimeString(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" });
export const fullLabel = (ms, tz) => new Date(ms).toLocaleString(undefined, {
  timeZone: tz, weekday: "long", month: "long", day: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

export function groupSlotsByDay(slots, tz) {
  const byDay = new Map();
  for (const s of slots) {
    const k = dayKey(s.startAt, tz);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  return byDay;
}
