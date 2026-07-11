# Phase 2b — Google Calendar (optional, read-only)

Use this phase only when the existing site has a Google Appointment Schedule
link/embed or locally reported meeting state. Keep the old booking experience
working while adding an authoritative read-only mirror.

Human obligations: review attendee-data retention and complete the second,
server-issued Google consent page. They never paste an OAuth code or token.

1. Inventory the old behavior. Distinguish a public appointment-page link from
   actual event create/reschedule/cancel APIs. Do not promise more than exists.
2. Require `npm view @odla-ai/calendar@0.1.0 version` to succeed, then install
   `npm i --save-exact @odla-ai/calendar@0.1.0` as a runtime dependency. An
   exact-version `E404` blocks this phase; do not substitute a git checkout or
   another version. Add `"calendar"` beside
   `"db"` in services and configure:
   - `calendar.google.calendars.dev` (start with `"primary"`);
   - optional summary/organizer/attendee match filters;
   - deliberate `attendeePolicy: "full" | "hashed"`;
   - the old public Appointment Schedule URL as `bookingPageUrl.dev` when
     preserving the embed/link. It is public configuration, not a secret.
3. Run `doctor`, then `provision --dry-run`. Show the human the calendars,
   attendee policy, public booking page, and read-only scope.
4. Run normal dev provision. After odla device approval, pause again while the
   human grants Google `calendar.events.readonly`; the CLI follows initial sync.
5. Run `calendar calendars --env dev --json`, refine the checked-in ids, and
   re-provision. Verify `calendar status --env dev --json` and `smoke --env dev`.
6. Put `initCalendar` only in trusted Worker code. Browser code may keep using
   the public `bookingPageUrl`, query `$bookings` through explicit db rules, or
   import pure helpers from `@odla-ai/calendar/client`. Never expose
   `ODLA_API_KEY`.
7. Replace self-reported meeting state only after an explicit, tested
   application-to-booking correlation exists. A matching attendee email may be
   sufficient for some apps; do not silently regress later workflow statuses.

This slice cannot create, reschedule, or cancel Google events. A static picker
continues to be Google's sealed UI; odla supplies configuration, mirror reads,
and reconciliation.

Gate: the old embed/link still works, status is healthy, the selected calendars
match config, `$bookings` smoke succeeds, no Google credential exists in local
files, and `MIGRATION.md` records the disclosure/correlation decision.
