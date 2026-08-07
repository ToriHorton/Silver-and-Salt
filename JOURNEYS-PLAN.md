# Silver & Salt Capital: User Journeys and Payment System Plan

Durable state for building every user journey from Tori's hand-drawn journey
map (photo shared 2026-07-26 and again 2026-08-07) and finishing the payment
system. Any agent resuming this work should read this file first, then
`MIGRATION.md` (platform state) and `PAYMENT-SPEC.md` (payment design).
All build work happens on branch `odla-conversion-test`; production
(GitHub Pages on `main`) stays untouched until the cutover phase. This file
is excluded from the public build, like PAYMENT-SPEC.md.

## The journey map (source of scope)

Three entry paths from the website's How It Works section:

1. **Join as a member** (perks for Utah women): membership page with tier
   perks, payment flow, personal details, calendar scheduling, meet with
   Tori, log in to the member site, verify accreditation, then the member
   portal (personal information, dollar commitment, deal flow, events,
   education materials). Margin note: membership is not required for deal
   flow.
2. **Interest in LLC application** (investment-only path): details about
   deal flow, interest form, calendar scheduling, meet with Tori, verify
   accreditation, investment-only portal.
3. **Stay informed**: sign up for the monthly newsletter to follow along.

**Pricing supersede note:** the map says $1,000 member and $10,000
stewardship. The locked membership design (CLAUDE.md, 2026-08-05/06)
supersedes those figures: Associate free, Founding Member $900 a year
(founding rate, struck from $1,000), Community Steward $5,000 a year.

## Decisions (Tori, 2026-08-07)

1. **Build order: tiers first.** Three-tier signup and payment, then member
   portal and accreditation, then newsletter completion, then production
   cutover.
2. **One signup flow for everyone.** The map's investment-only LLC path
   (journey 2) folds into the membership flow: those prospects sign up as
   free Associate members. There is no separate LLC site or separate
   interest form; the map's journey 2 becomes the Associate experience
   plus the accreditation gate.
3. **Everyone books an intro call with Tori, including free Associates.**
4. **Steward $5,000 is an annual auto-renewing Stripe subscription**, same
   machinery as Founding (refund-until-approved, card and wallet).
5. **Newsletter lives in our database**; no external provider. SUPERSEDED
   in part by decision 7 below: there is no public signup anymore.
7. **The monthly update is a member benefit, gated behind Associate
   membership** (decided later on 2026-08-07, superseding the map's open
   "stay informed" path). Anyone who wants the newsletter joins as a free
   Associate through the one signup flow. Consequences:
   - The footer band and the three-yeses "follow along" card repoint to
     the Associate signup instead of collecting an email.
   - The public `POST /api/newsletter` route and the footer email form are
     retired (built 2026-08 but never launched; the `newsletterSignups`
     entity can be dropped after its test rows are cleared).
   - Members of every tier receive the monthly update; it is composed and
     sent from the console via the CRM's consent-gated announcement class,
     which already carries unsubscribe handling.
   - The locked Associate card copy gains a monthly-update bullet; exact
     wording is Tori's, at J1.
6. **The in-between state is the odla dev worker.** Tori is not ready to
   publish; work is committed to `odla-conversion-test` and deployed to
   https://silver-and-salt-capital-dev.silver-and-salt.workers.dev (her
   Cloudflare account; a twin runs on Cory's account). Production deploys
   only happen by pushing `main`, which this plan never does before
   cutover.

## What is already built (verified on dev; see MIGRATION.md for detail)

- Founding-tier journey spine on `odla-conversion-test`: join.html apply,
  $900/year Stripe subscription (Test Mode, E2E verified), first-party
  call scheduling against real calendar availability, prep email, admin
  Approve action promoting the Clerk role to member, Refund and cancel.
- Clerk auth with provisional/member/admin roles; member area shows
  application status, call time, membership and renewal line.
- Admin console: Dashboard (revenue, pipeline, calls agenda), People CRM
  (notes, tags, tasks, consent-gated personal and announcement email),
  Billing from live Stripe data, Settings, email audit log.
- Email through Cloudflare Email Service (dev sends redirect to the debug
  inbox). Branded 404. Preact app pages.
- **Newsletter capture, built but SLATED FOR RETIREMENT** (decision 7):
  worker route `POST /api/newsletter` (validated, deduped; schema entity
  `newsletterSignups`; verified working on dev 2026-08-07) and the
  site-footer signup band posting to it. Never launched publicly. J1
  removes the route and repurposes the band; the entity holds only test
  rows and can be dropped.
- Marketing/site work carried on the same branch: membership.html (final,
  unlinked), the membership design exploration series, new homepage and
  faqs copy, header Membership tab, footer legal rewrite.

## Phase checklist

- [ ] **J1: Three-tier membership signup and payment.** Extend the built
  flow from one tier to three. Everyone, including investment-first
  prospects, comes through this flow; every tier books an intro call.
  - `groups` row gains Steward pricing (stripePriceId per tier); extend
    `_scripts/setup-stripe-dev.mjs` to create the $5,000/year Price.
  - Tier selection: membership.html's three CTAs (finished page, still
    unlinked) carry the tier into join.html (e.g. `?tier=`), and join.html
    shows the chosen tier's line items. The locked card section copy is
    final; wire it, do not restyle it.
  - Associate (free): application form, account creation, and the call
    booking step, with no payment step.
  - Steward ($5,000/year): same subscription flow as Founding with its own
    price and trust copy.
  - Tier stored on the application and surfaced in admin People/Billing
    and the member area.
  - Newsletter gating (decision 7): repoint the footer band and the
    three-yeses "follow along" card to the Associate signup; remove
    `POST /api/newsletter` and the band's email form.
  - Admin heads-up for free signups: the notification email currently
    fires only on payment, so Associates would arrive silently; fire it
    when any application books its call (flow-map review finding).
  - Acceptance: Test Mode E2E per tier (Associate free signup with booked
    call, Founding $900, Steward $5,000), refund path on both paid tiers,
    tier visible in admin and member area.
- [ ] **J2: Member portal content and accreditation.** This phase also
  delivers what the map's journey 2 needed, since those users are now
  Associates.
  - PAYMENT-SPEC.md P3: post-approval accreditation self-certification
    panel; accredited marker kept in a separate namespace (506(b)
    segregation); non-accredited members stay community-only.
  - Portal sections from the map: deal flow, events, education materials
    (structure plus admin-editable content; scope the minimum real version
    with Tori at phase start). Associate view honors the locked tier copy:
    recordings and memos framed as post-join-date; option to invest for
    accredited members; a become-a-Founding-Member prompt.
- [ ] **J3: The monthly update, as a member benefit.** Per decision 7,
  the update goes to members of every tier. Auto-enroll on approval with
  announcement consent recorded; compose and send from the console via the
  CRM's announcement class (unsubscribe handling already built there);
  drop the retired `newsletterSignups` entity after clearing test rows.
- [ ] **J4: Production cutover and hardening.** MIGRATION.md P5 (DNS,
  prod Stripe/Clerk/email pastes, Apple Pay domain verification,
  silverandsaltcapital.com sender onboarding) plus PAYMENT-SPEC.md P2
  referrals and P4 monitoring. Launch gate: securities counsel sign-off on
  disclaimers, refund policy, trust copy, accreditation gate, and the
  506(b) approach.

## Open items

1. Steward perk fulfillment (coaching hours, expert hours, retreat) is
   manual/operational; nothing to build unless Tori wants tracking in CRM.
2. Whether the Steward flow repeats the refund-until-approved policy
   verbatim or needs its own counsel-reviewed wording.
3. Counsel review flag from CLAUDE.md: the closer line "Every member is
   first to know when a new deal is available."
4. The new `_reference/membership-*` planning docs are git-tracked and the
   `_reference` directory is publicly served; decide whether they should
   be excluded from the build before cutover.
5. Schema pushes from Tori's machine 403 ("not your app", see MIGRATION.md
   2026-07-18); new-entity pushes (e.g. `newsletterSignups`) may need to
   run from Cory's machine or with the owner dev token.

## Log

- **2026-08-07:** Plan created. Prior work located (MIGRATION.md,
  PAYMENT-SPEC.md, Founding-tier E2E on dev). Tori decided build order
  (tiers first), Steward billing (annual subscription), and newsletter
  mechanism (our database).
- **2026-08-07 (later):** Tori decided: one signup flow for everyone, the
  LLC path folds into free Associate membership, and every tier books an
  intro call. Discovered an already-built newsletter capture sitting
  uncommitted in the main working tree. Moved all uncommitted work (odla
  files, membership series, newsletter capture, newer site copy) off main
  onto `odla-conversion-test` and deployed to the dev worker; main is
  clean again so the 4am dashboard task can pull.
- **2026-08-07 (flow review):** Built the signup-flow map artifact (all
  pages, outcomes, emails, seven open UX questions). Tori then decided to
  gate the monthly update behind Associate membership (decision 7): the
  open newsletter signup is retired before it ever launched, and J3
  becomes a member-benefit send. The flow-map finding about silent free
  signups was added to J1 (heads-up email fires on booking).
