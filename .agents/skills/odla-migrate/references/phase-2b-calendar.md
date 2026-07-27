# Phase 2b — Google Calendar booking (optional)

Use this phase when the site should offer real scheduling: visitors pick a
bookable slot and the app creates a live Google Calendar event — with a Meet
link and an invitation email that Google itself sends. Google Calendar is the
single source of truth; odla stores no calendar or attendee data. There is no
sync, no mirror, and no `$bookings` namespace.

Human obligations: complete the server-issued Google consent page in a
browser (they never paste an OAuth code or token), and receive the test
invitation email during verification.

Boundary that shapes every step: `initCalendar` and the platform's calendar
routes are **server-side only** — they authenticate with the app's full
`ODLA_API_KEY`. Never call them from a browser; the browser talks only to
this app's own Worker endpoints and may import pure helpers from
`@odla-ai/calendar/client`.

1. Require `npm view @odla-ai/calendar version` to succeed, then install
   `npm i @odla-ai/calendar` as a runtime dependency. Use the normal dependency
   range, commit the lockfile, and record `npm ls @odla-ai/calendar` in PM. A
   registry failure blocks this phase; do not substitute a git checkout.
2. Add `"calendar"` beside `"db"` in services and author the config block —
   booking rides the existing db key, so calendar adds no new secret:

   ```js
   calendar: {
     google: {
       availabilityCalendars: { dev: ["primary"] }, // 1–10 per env
       bookingCalendar: { dev: "primary" },         // optional; defaults to first availability calendar
       bookingPageUrl: { dev: null },               // optional legacy fallback link
     },
   },
   ```

3. Run `doctor`, then `provision --dry-run`; show the human the calendars and
   the booking scopes. Run normal dev provision. Consent runs last: the CLI
   prints/opens a state-bound Google URL and the human grants access in a
   browser. If the platform connector reports a readiness 503
   (`calendar_*_not_configured`), provision still completes and prints a
   `calendar connect --env dev` resume hint — that gap is platform-operator
   work, not yours. Then `calendar calendars --env dev --json` to refine
   checked-in ids, and verify `calendar status --env dev` shows
   `bookable: yes` (a pre-pivot read-only grant shows `degraded` /
   `calendar_reconsent_required`; re-run `calendar connect`).
4. Build the **slots endpoint** in the app's Worker — capability-gated like
   every other route (a booking endpoint that ignores Phase 3 auth decisions
   is a regression):

   ```ts
   import { initCalendar, computeBookableSlots } from "@odla-ai/calendar";

   // GET /api/booking/slots
   const cal = initCalendar({
     appId: env.ODLA_APP_ID,
     env: env.ODLA_ENV,
     adminToken: env.ODLA_API_KEY,
     endpoint: env.ODLA_PLATFORM ?? "https://odla.ai",
   });
   const fb = await cal.availability.freeBusy({
     timeMin: Date.now(),
     timeMax: Date.now() + 14 * 86_400_000,
   });
   const slots = computeBookableSlots(fb.busy, {
     from: fb.timeMin,
     to: fb.timeMax,
     timezone: BOOKING_TIMEZONE,          // app-owned config, not user input
     slotMinutes: 30,
     businessHours: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
     minNoticeMs: 24 * 3_600_000,
   });
   return Response.json({ slots, timezone: BOOKING_TIMEZONE });
   ```

   Business hours, slot length, notice, and buffers are this app's product
   decisions — keep them in app config, and reject slot requests wider than
   the window you offer.
5. Build the **create endpoint** (`POST /api/booking`). Validate that the
   requested slot is one this app offers (recompute from the same config),
   then create — the platform re-validates availability under its booking
   lease, so a stale slot cannot double-book:

   ```ts
   const { booking, duplicate } = await cal.actions.create(
     {
       summary: `Intro call — ${name}`,
       startAt, endAt,
       attendees: [email],
       timezone: BOOKING_TIMEZONE,
       meet: true,               // Meet link on the event and in the invite
       // notify defaults true → Google emails the invitation
     },
     { idempotencyKey: `booking:${applicationId}` }, // your own stable record id
   );
   ```

   Store the returned `booking.eventId` and `booking.meetUrl` on the app's
   own record (its odla-db row) — that record is the app's only persistence;
   attendee data lives in Google. On `calendar_slot_unavailable` (409,
   non-retryable) return a "slot taken" response; the client refetches
   `/api/booking/slots` and re-picks. On retryable
   `calendar_booking_in_progress`, retry once after a short delay.
6. Reschedule/cancel go through the stored id:
   `cal.actions.reschedule(eventId, { startAt, endAt })` and
   `cal.actions.cancel(eventId)` (idempotent) — expose them as app endpoints
   gated to the record's owner. Attendees can also act through Google's own
   invitation flows; treat Google as authoritative.
7. Frontend. Two supported shapes:
   - **`@odla-ai/ui` SlotPicker** — renders the slots response directly
     (`{ slots, timezone, onSelect }`). On a non-framework static site use a
     native Preact island: a small entry that imports `render` from `preact`,
     mounts `<SlotPicker>` into an empty div, and bundles with
     `jsxImportSource: "preact"` as an IIFE committed next to the site's other
     assets. Do not install React or add compatibility aliases.
   - **Plain fetch + buttons** — `fetch("/api/booking/slots")`, render times
     with `formatBookingRange` from `@odla-ai/calendar/client`, POST the
     chosen slot.
   Either way the browser only ever talks to this app's Worker.
8. If the old site had a Google Appointment Schedule embed/link, keep it
   working via `bookingPageUrl` until the native flow is verified, then
   retire it deliberately.

Gate (live dev round-trip, all of it): a booking made through the site's own
UI creates the event on the booking calendar with a Meet link; the Google
invitation email arrives in the test attendee's inbox; a repeat POST with the
same idempotency key returns `duplicate: true` (no second event); a taken
slot returns 409 and the UI refetches slots; reschedule and cancel work via
the stored `eventId`; zero attendee data is persisted anywhere except the
app's own tenant record; no Google credential exists in local files; and
PM records the booking-flow decision and the active task comment links this
evidence.
