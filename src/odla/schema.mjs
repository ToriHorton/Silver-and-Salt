// odla-db schema for Silver & Salt Capital.
//
// applications: one row per membership application submitted from join.html.
// Field names mirror the form's input names (camelCased). Per the porting
// notes in @odla-ai/db/llms.txt:
//   - `id` is mirrored as a unique attr so rows can be queried by id.
//   - Optional scalars (referralName, linkedin) are OMITTED on write when
//     absent; there is no NULL.
//   - `focus` (checkbox multi-select) is a json array; the worker always
//     writes an array, possibly empty.
//   - email is indexed but NOT unique: a person may reapply. Duplicate
//     submissions are handled with a stable mutationId at write time.
//
// status pipeline: "submitted" -> "call_scheduled" -> "interviewed"
//   -> "approved" | "declined". The owner's user states (provisional/member/
//   admin) live on the Clerk-mirrored $users record from Phase 3b; an
//   application row tracks the interview pipeline that drives the
//   provisional -> member promotion.
export const schema = {
  entities: {
    applications: {
      attrs: {
        id: { type: "string", unique: true, indexed: true, optional: false },
        firstName: { type: "string", unique: false, indexed: false, optional: false },
        lastName: { type: "string", unique: false, indexed: false, optional: false },
        email: { type: "string", unique: false, indexed: true, optional: false },
        referral: { type: "string", unique: false, indexed: false, optional: false },
        referralName: { type: "string", unique: false, indexed: false, optional: true },
        whoYouAre: { type: "string", unique: false, indexed: false, optional: false },
        focus: { type: "json", unique: false, indexed: false, optional: false },
        linkedin: { type: "string", unique: false, indexed: false, optional: true },
        message: { type: "string", unique: false, indexed: false, optional: false },
        status: { type: "string", unique: false, indexed: true, optional: false },
        createdAt: { type: "number", unique: false, indexed: true, optional: false },
        // Epoch ms of the scheduled intro call. Authoritative source is the
        // $bookings mirror (matched by attendee email); admins may also set
        // it manually. 0 means "was booked, then cancelled".
        meetingAt: { type: "number", unique: false, indexed: true, optional: true },
        // Google Calendar event link for the booked call (view/change there;
        // the mirror is read-only). "" when a booking was cancelled.
        meetingLink: { type: "string", unique: false, indexed: false, optional: true },
        // Clerk user id, linked lazily when a signed-in user's email matches.
        clerkUserId: { type: "string", unique: false, indexed: true, optional: true },
        // ── Payment flow (PAYMENT-SPEC.md P1) ──
        phone: { type: "string", unique: false, indexed: false, optional: true },
        state: { type: "string", unique: false, indexed: false, optional: true },
        groupId: { type: "string", unique: false, indexed: true, optional: true },
        stripeCustomerId: { type: "string", unique: false, indexed: true, optional: true },
        stripeSubscriptionId: { type: "string", unique: false, indexed: true, optional: true },
        renewalAt: { type: "number", unique: false, indexed: false, optional: true },
        disclaimerAckAt: { type: "number", unique: false, indexed: false, optional: true },
        refundPolicyAckAt: { type: "number", unique: false, indexed: false, optional: true },
        prepEmailSentAt: { type: "number", unique: false, indexed: false, optional: true },
        canceled: { type: "boolean", unique: false, indexed: false, optional: true },
      },
    },
    // Per-group settings: prices, policy copy, and email templates live here,
    // never in code (PAYMENT-SPEC.md section 3.2). One row at launch:
    // Silver & Salt Capital, group #1.
    groups: {
      attrs: {
        id: { type: "string", unique: true, indexed: true, optional: false },
        name: { type: "string", unique: false, indexed: false, optional: false },
        standardPriceCents: { type: "number", unique: false, indexed: false, optional: false },
        foundingDiscountCents: { type: "number", unique: false, indexed: false, optional: false },
        stripePriceId: { type: "string", unique: false, indexed: false, optional: true },
        stripePublishableKey: { type: "string", unique: false, indexed: false, optional: true },
        notificationEmail: { type: "string", unique: false, indexed: false, optional: false },
        replyTo: { type: "string", unique: false, indexed: false, optional: false },
        // Dev-tenant sends all redirect here (subject gets a [dev] prefix).
        debugEmail: { type: "string", unique: false, indexed: false, optional: true },
        // DEPRECATED: the booking page URL lives on the platform's calendar
        // config (bookingPageUrl, Studio-editable); the worker reads it from
        // loadCalendarPublicConfig. Kept only because schema removals are
        // unsafe changes.
        calendarLink: { type: "string", unique: false, indexed: false, optional: true },
        disclaimerText: { type: "string", unique: false, indexed: false, optional: false },
        refundPolicyText: { type: "string", unique: false, indexed: false, optional: false },
        trustCopy: { type: "string", unique: false, indexed: false, optional: false },
        commitmentText: { type: "string", unique: false, indexed: false, optional: true },
        normsText: { type: "string", unique: false, indexed: false, optional: true },
        // { adminNotification, paymentConfirmation, prepEmail,
        //   onboardingInvite }, each { subject, text } with {{placeholders}}.
        emailTemplates: { type: "json", unique: false, indexed: false, optional: false },
        // Scheduling rules for first-party booking: { slotMinutes, days,
        // startHour, endHour, timezone, minNoticeHours, windowDays,
        // summaryTemplate }. Absent keys fall back to code defaults.
        schedulingJson: { type: "json", unique: false, indexed: false, optional: true },
        createdAt: { type: "number", unique: false, indexed: true, optional: false },
      },
    },
    // Introduction-call meetings: the SOURCE OF TRUTH for scheduling
    // (owner-directed 2026-07-14). Google Calendar is a projection that
    // carries the invite email and Meet link; googleEventId/meetUrl come
    // back from the export. Drift fields record when Google disagrees with
    // us (someone moved or cancelled the event there); we flag, never
    // silently adopt.
    meetings: {
      attrs: {
        id: { type: "string", unique: true, indexed: true, optional: false },
        applicationId: { type: "string", unique: false, indexed: true, optional: false },
        groupId: { type: "string", unique: false, indexed: true, optional: false },
        startAt: { type: "number", unique: false, indexed: true, optional: false },
        endAt: { type: "number", unique: false, indexed: false, optional: false },
        timezone: { type: "string", unique: false, indexed: false, optional: false },
        status: { type: "string", unique: false, indexed: true, optional: false }, // scheduled | cancelled
        googleEventId: { type: "string", unique: false, indexed: true, optional: true },
        meetUrl: { type: "string", unique: false, indexed: false, optional: true },
        htmlLink: { type: "string", unique: false, indexed: false, optional: true },
        // none | time_changed | cancelled_in_google | missing_in_google
        drift: { type: "string", unique: false, indexed: true, optional: true },
        driftGoogleStartAt: { type: "number", unique: false, indexed: false, optional: true },
        driftDetectedAt: { type: "number", unique: false, indexed: false, optional: true },
        // Owner policy 2026-07-14: Google edits are adopted, and this stamp
        // records the most recent adoption for the admin's information.
        adoptedFromGoogleAt: { type: "number", unique: false, indexed: false, optional: true },
        createdAt: { type: "number", unique: false, indexed: true, optional: false },
      },
    },
    // Audit of every transactional send (PAYMENT-SPEC.md section 3.3).
    emailLog: {
      attrs: {
        id: { type: "string", unique: true, indexed: true, optional: false },
        groupId: { type: "string", unique: false, indexed: true, optional: false },
        applicationId: { type: "string", unique: false, indexed: true, optional: true },
        to: { type: "string", unique: false, indexed: true, optional: false },
        template: { type: "string", unique: false, indexed: true, optional: false },
        subject: { type: "string", unique: false, indexed: false, optional: false },
        // "cloudflare" (Email Service delivery) or "log-only" (no delivery).
        transport: { type: "string", unique: false, indexed: false, optional: false },
        // The transport receipt (synthesized "log-only-…" when undelivered).
        messageId: { type: "string", unique: false, indexed: false, optional: true },
        redirected: { type: "boolean", unique: false, indexed: false, optional: true },
        // Caller-stable key: a successful row with this key means the mail
        // went out, so retried webhooks and rebookings never deliver twice.
        dedupeKey: { type: "string", unique: false, indexed: true, optional: true },
        // Transport error code when the send failed; absent on success.
        error: { type: "string", unique: false, indexed: false, optional: true },
        sentAt: { type: "number", unique: false, indexed: true, optional: false },
      },
    },
    // Super-admins: the ONLY tier that may create or modify admins. Kept as a
    // separate, app-READ-ONLY entity on purpose. Rules are deny-all like every
    // other namespace (browsers hold no db credential) AND no worker route ever
    // writes it, so the flag can only be set in the odla Studio data browser,
    // never from the app or an injected page script. One row per super-admin,
    // keyed by lowercased email.
    superAdmins: {
      attrs: {
        id: { type: "string", unique: true, indexed: true, optional: false },
        email: { type: "string", unique: true, indexed: true, optional: false },
        note: { type: "string", unique: false, indexed: false, optional: true },
        createdAt: { type: "number", unique: false, indexed: true, optional: false },
      },
    },
  },
  links: {},
};
