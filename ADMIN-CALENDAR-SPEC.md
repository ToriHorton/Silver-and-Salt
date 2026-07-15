# Admin Calendar Management Page: build spec

**For:** a build agent working on branch `odla-conversion-test`
**From:** the Silver & Salt Capital migration, 2026-07-14 (owner-requested)
**Prereq reading:** MIGRATION.md (Scheduling v2 section), src/worker.ts
(scheduling routes), admin/index.html (existing console patterns).

## Goal

A calendar management surface for the admin console covering the whole
schedule: every introduction call, viewable three ways:

1. **By user**: group meetings by applicant; each person's history
   (upcoming and past calls, statuses, adoption/cancellation notes).
2. **Schedule form (agenda)**: a chronological list, day-grouped, of all
   upcoming calls with applicant, time, Meet link, and actions.
3. **Calendar view**: a month grid (week view optional) with meetings on
   their days; clicking one opens its detail/actions.

## Where it lives

A fourth tab, "Calendar", on `/admin/` (tab machinery exists:
`.admin-tabs` / `.tab-panel` / `switchTab` in admin/index.html), with a
view switcher inside (By user | Agenda | Month) following the
`.admin-tab` pill pattern at smaller scale.

## Data

Existing routes suffice for v1:
- `GET /api/admin/meetings` — meetings joined with applicants, drift and
  adoption stamps, Meet/htmlLink. Currently filters to upcoming + capped
  at 50; ADD query params `?from=&to=&all=1` so month navigation and
  by-user history can fetch ranges (worker change, small).
- `GET /api/schedule/slots` — open times (already used by the inline
  reschedule picker; the month view should shade bookable days).
- Actions per meeting: `POST /api/admin/meetings/:id/reschedule`
  (validates against open slots) and `POST /api/admin/meetings/:id/cancel`.
  Reuse the inline reschedule picker (`toggleReschedule`) or its markup
  contract rather than inventing a second picker.

## Constraints and reuse

- The console is a ZERO-BUILD static page. @odla-ai/ui ships
  CalendarMonth/CalendarWeek/CalendarAgenda as React components that
  accept Booking-shaped events; there is no buildless variant yet (see
  UI-COMPONENT-SPECS.md item 4). Options, in order of preference:
  1. Buildless Preact islands via import map + `preact/compat` alias,
     mounting @odla-ai/ui calendar components with our meetings mapped to
     `{ startAt, endAt, summary }` spans. Keep the island boundary small
     (the calendar panel only); page chrome stays vanilla.
  2. A hand-rolled month grid (7-column CSS grid; ~150 lines) in the
     existing brand style, if the island approach proves fragile.
- Brand: match admin/index.html exactly (cards, `.card-label`, Satoshi
  UI text, Cormorant Infant digits via the in-page numeral override,
  moss/lime/cream tokens, no em/en dashes in copy, "Silver & Salt
  Capital" full name).
- Timezone: render in the group's scheduling timezone
  (`/api/schedule/slots` returns it), labelled once, like the join page.

## Acceptance

- Calendar tab shows the three views; switching preserves the selected
  month/person in the URL hash (pattern: `#calendar/month/2026-08`).
- Month view: correct day placement across a DST boundary; today
  highlighted; days with meetings show count chips; clicking a meeting
  reveals detail with Meet link and Reschedule/Cancel actions working.
- By-user view: one section per applicant with upcoming first; empty
  states styled (`.empty-note`).
- Agenda view: day-grouped rows matching the Introduction Calls table's
  two-line row style. [2026-07-15: the Introduction Calls table was
  retired when its tab folded into this Calendar tab; the agenda's rows
  are now the canonical style and a "Needs attention" strip carries the
  table's drift-at-a-glance duty.]
- No horizontal scrolling at 960px container or on a 390px phone.
- All actions round-trip against the dev worker
  (silver-and-salt-capital-dev.cory-ondrejka.workers.dev) with an admin
  session.

## Also appended to UI-COMPONENT-SPECS.md

Item 4: buildless calendar views (month/agenda) as custom elements or a
documented island recipe, so the next app skips option 2 above.
