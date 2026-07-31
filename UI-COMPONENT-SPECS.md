# UI component requests for @odla-ai/ui

**From:** the Silver & Salt Capital migration (branch `odla-conversion-test`)
**Date:** 2026-07-14
**Context:** this site adopted @odla-ai/calendar 0.2.0 first-party booking.
The join flow needed a slot picker; @odla-ai/ui ships `SlotPicker` as a
React/Preact component, but this site (like many odla migrations of static
sites) is zero-build vanilla HTML/JS. We hand-rolled an app-local picker to
ship (join.html, `.slot-days`/`.slot-grid`); these specs describe what would
let the next site delete that code.

## 1. Buildless SlotPicker (highest value)

A no-framework way to get the `SlotPicker` experience on a static page.
Either shape works; the custom element is preferred:

- **Custom element** `<odla-slot-picker>` shipped as a self-contained ESM
  file (`@odla-ai/ui/js/slot-picker.js`) importable via
  `<script type="module">`. Attributes/properties:
  - `slots`: array of `{ startAt, endAt }` (property assignment; epoch ms,
    same TimeSlot contract as the React component).
  - `timezone` (IANA string, attribute), `locale` (attribute).
  - `value` (property, TimeSlot or null), `empty-label` (attribute).
  - Emits `slot-select` CustomEvent with `{ detail: TimeSlot }`.
  - Renders the same `.cal.cal-slots` DOM contract as the React SlotPicker
    (day chips carrying `data-date`, `aria-pressed` on active day and
    selected time) so the existing component CSS and themes apply, and so
    tests written against one variant hold for the other.
- **Or a documented plain-HTML recipe**: the class contract markup plus a
  tiny headless helper (`groupSlotsByDay(slots, timezone)`) exported from
  `@odla-ai/calendar/client`, letting a page render the chips/grid itself
  with correct DST-safe day grouping. (We reimplemented that grouping with
  `toLocaleDateString('en-CA', { timeZone })`; a canonical helper would
  prevent subtle timezone bugs across apps.)

Acceptance: a static page with `odla-ui.css` + a theme + one module script
renders a working picker from a `fetch`ed slot list, keyboard accessible,
no build step, under ~6 KB of JS.

## 2. Salt theme parity tokens for booking surfaces (small)

The `salt` theme already matches this brand (Cormorant Garamond + Satoshi,
cream/moss/rust). Verify the calendar/slot surfaces (`.cal-slots`,
`.cal-slot-grid`, day chips) have salt-theme token mappings tuned for a
light card on cream (our hand-rolled version needed: chip active = moss on
white, time hover = 12% lime wash, selected = solid lime with white text).
If the mappings already exist, publishing a screenshot pair in the docs
would let static sites adopt with confidence.

## 4. Buildless calendar views (month + agenda)

Same motivation as item 1: `CalendarMonth`/`CalendarWeek`/`CalendarAgenda`
exist as React components, but zero-build sites need either custom
elements (`<odla-calendar-month>` accepting an `events` property of
`{ startAt, endAt, summary }` spans, emitting `event-select`) or a
documented, tested Preact-island import-map recipe. Consumer in hand: the
admin Calendar management page specced in ADMIN-CALENDAR-SPEC.md on the
Silver & Salt Capital branch.

## 3. Drift/status badge pattern (documentation, not code)

For source-of-truth apps that project into external calendars, we render
"In sync" / "Moved in Google: {time}" / "Removed in Google" badges. The ui
package's badge classes cover the visuals; what is missing is a documented
recipe pairing `@odla-ai/calendar` `availability.upcoming()` with a
reconciliation table (the pattern this app implements in
`/api/admin/meetings` + admin console). A docs page would spare the next
app rediscovering the comparison semantics (match by `eventId`, compare
`startAt`, treat absence as removal, never auto-adopt).
