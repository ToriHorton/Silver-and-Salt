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
   - Past updates live in the member portal as a **monthly newsletter
     archive** (Tori, 2026-08-07), browsable by every member; an
     unsubscribed member still has the archive.
   - The locked Associate card copy gains a monthly-update bullet; exact
     wording is Tori's, at J1.
8. **The intro call is 20 minutes** (2026-08-07). Slot length is group
   data (`groups.schedulingJson.slotMinutes`); already applied to the dev
   tenant and the seed script, verified on the live slots API.
9. **Tier selection is mandatory before the application** (2026-08-07).
   join.html reached without a valid tier shows "choose your membership"
   as the first step of the application; membership.html's CTAs preselect
   the tier and skip that step. Nobody reaches the form tierless.
10. **Two kinds of "not a fit," for every tier including Associates**
    (2026-08-07). After the call: (a) **Approve** at their tier;
    (b) **Not a paid fit**: refund and cancel if they paid, and they land
    as a free Associate, still part of the community; (c) **Not a
    community fit**: a full and graceful exit, refund included if they
    paid. Associates can receive (c) too, so approval gates the free tier
    as much as the paid ones. The admin console grows from two post-call
    actions to three.
11. **The second membership redeems through the portal, with its own
    meeting** (2026-08-07). After approval, a Founding member's portal
    offers "Invite your second member" (her mother or daughter). The
    invitation sends a personal link that opens the application with the
    payment step skipped; the invitee books her own 20-minute call with
    Tori, and the membership activates when Tori approves after that
    conversation. Build in J2.
12. **Abandoned payments: keep the record, skip the chase** (2026-08-07).
    The application row and member account are created and stored at
    Step 1 (already built), so every abandoned payment is preserved and
    visible in the console. No recovery email at launch; revisit once
    real traffic shows the drop-off rate.
13. **Accreditation self-certification lives inside the membership
    portal** (2026-08-07), reachable only after approval. Tori wants
    legal counsel on this placement specifically; it is on the counsel
    review list below and remains a launch gate.
14. **The certification is a yes-or-no gate on portal capability**
    (2026-08-07). Every approved member answers it, and the answer
    decides what she can do: yes (accredited) unlocks invest access
    (deal flow participation and her dollar commitment); no means
    observer access (education, events, recordings, memos, community)
    with invest surfaces hidden entirely. The access split itself is on
    the counsel review list, per Tori.
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
  - Tier selection (decision 9): membership.html's three CTAs carry the
    tier into join.html (e.g. `?tier=`) and skip straight to the form;
    arriving without a valid tier shows a "choose your membership" step
    first. The locked card section copy is final; wire it, do not restyle
    it.
  - Vetting outcomes (decision 10): admin console offers Approve /
    Not a paid fit (refund + cancel + tier flips to associate, membership
    continues) / Not a community fit (refund if paid, graceful exit).
    Status model and member-area states extended to match; the wording of
    the two not-a-fit notices is counsel-adjacent copy.
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
  - PAYMENT-SPEC.md P3: accreditation self-certification panel inside the
    membership portal, reachable only after approval (decision 13,
    counsel-gated). The yes/no answer gates portal capability (decision
    14): yes renders the invest surfaces (deal flow participation,
    dollar commitment); no renders observer access only, with invest
    surfaces absent from the page, not merely disabled. Accredited
    marker kept in a separate namespace (506(b) segregation).
  - Portal sections from the map: deal flow, events, education materials,
    and the monthly newsletter archive (structure plus admin-editable
    content; scope the minimum real version with Tori at phase start).
    Associate view honors the locked tier copy: recordings and memos
    framed as post-join-date; option to invest for accredited members; a
    become-a-Founding-Member prompt.
  - Second-membership redemption (decision 11): portal "Invite your
    second member" for Founding members; personal invitation email with a
    one-use link; invitee's application skips payment; she books her own
    20-minute call; activation on Tori's approve. Guards: one invite per
    Founding membership, revocable before redemption, invite tier
    recorded on the application.
- [ ] **J3: The monthly update, as a member benefit.** Per decision 7,
  the update goes to members of every tier. Auto-enroll on approval with
  announcement consent recorded; compose and send from the console via the
  CRM's announcement class (unsubscribe handling already built there);
  drop the retired `newsletterSignups` entity after clearing test rows.
  Store each update as a canonical issue row (title, body, sent date) so
  the portal's newsletter archive renders from issues rather than from
  the send log; the J2 archive section fills from these.
- [ ] **J4: Production cutover and hardening.** MIGRATION.md P5 (DNS,
  prod Stripe/Clerk/email pastes, Apple Pay domain verification,
  silverandsaltcapital.com sender onboarding) plus PAYMENT-SPEC.md P2
  referrals and P4 monitoring. Launch gate: securities counsel sign-off
  on the full counsel review list below.

## Counsel review list (launch gate; Tori requested 2026-08-07)

1. Intake disclaimer text (on the application form).
2. Refund policy text (acknowledged before payment).
3. Trust copy at the payment step: the Founding version and the new
   Steward $5,000 variant (same structure, Steward numbers).
4. The two not-a-fit notices: the "not a paid fit" downgrade wording and
   the "not a community fit" exit wording (decision 10).
5. **Accreditation self-certification inside the membership portal**
   (decisions 13 and 14; Tori explicitly wants counsel here): the
   Rule 501 questionnaire as a yes-or-no certification,
   post-approval-only access, the 506(b) segregation of accredited
   status from membership data, and the resulting access split
   (certified members can invest; every other member has observer
   access with invest surfaces hidden).
6. The referral restraint text (PAYMENT-SPEC.md section 3.4, when P2
   referrals build).
7. The closer line "Every member is first to know when a new deal is
   available" (flag carried from CLAUDE.md).

## Open items

1. Steward perk fulfillment (coaching hours, expert hours, retreat) is
   manual/operational; nothing to build unless Tori wants tracking in CRM.
2. The new `_reference/membership-*` planning docs are git-tracked and the
   `_reference` directory is publicly served; decide whether they should
   be excluded from the build before cutover.
3. Schema pushes from Tori's machine 403 ("not your app", see MIGRATION.md
   2026-07-18); new-entity pushes may need to run from Cory's machine or
   with the owner dev token.

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
- **2026-08-07 (flow review, continued):** Three more decisions from
  Tori: the intro call is 20 minutes (decision 8, applied to the dev
  tenant immediately and verified on the slots API), tier selection is a
  mandatory first step when arriving tierless (decision 9), and not-a-fit
  splits into "not a paid fit" (downgrade to Associate with refund) and
  "not a community fit" (graceful exit), applying to Associates too
  (decision 10). Flow map updated to match.
- **2026-08-07 (review closed):** Tori answered the remaining flow-map
  questions: second membership redeems via a portal invitation and the
  invitee's own call with Tori (decision 11, J2); abandoned payments keep
  the stored application and account with no chase email at launch
  (decision 12); Steward trust copy follows the Founding structure; and
  the accreditation panel lives in the membership portal, explicitly
  flagged for counsel (decision 13). Consolidated the counsel review
  list as its own launch-gate section. All seven flow-map questions are
  now resolved.
