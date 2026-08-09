# Payment Flow Specification: Silver & Salt Capital on the odla Stack

**Status:** living document. v0.2 (2026-08-08): three membership tiers,
the 100-place founding pool with member numbering, and the referral credit
rule, all per owner decisions on 2026-08-07/08. v0.1 was 2026-07-11.
**Source of business design:** `onboarding-scope.html` (Tori Horton's project
brief, May 2026, written for the previous GitHub Pages + Apps Script + Google
Sheet stack). This spec translates that brief onto the odla stack running on
branch `odla-conversion-test`. Business and compliance rules carry over
unchanged; only the machinery moves.
**Legal note:** every disclaimer, policy text, and the referral restraint in
this document is implementation wording from the brief and requires securities
counsel sign-off before launch, per the brief's constraint 6.

## 1. What this adds

The join flow gains a payment step between the application form and the
booking step. Membership is an annual, automatically recurring Stripe
subscription from day one. The applicant is charged the founding-member rate
at application, Tori vets them in the introduction call, and the outcome is
either approval (they become a member and the subscription simply continues)
or, on a rare non-fit, a full refund plus subscription cancellation.

### 1.1 The three tiers (owner, 2026-08-05, cards locked)

| Tier | Price | Payment step |
|---|---|---|
| Associate | free | none; application and call only |
| Founding Member | $1,000 a year | annual subscription |
| Community Steward | $5,000 a year | annual subscription |

Every tier applies, books the same 20-minute introduction call, and is
approved by the same deliberate action. Tier is chosen before the
application: the membership page's three CTAs carry it, and arriving
without one opens a "choose your membership" step first.

### 1.2 The founding hundred (owner, 2026-08-08)

- **The first 100 people who join as Founding Member OR Community
  Steward form ONE combined pool.** Both tiers consume places.
- **Each of the 100 receives a member number**, permanently theirs, shown
  in their member portal as the standing confirmation of what they hold.
- **Founding members inside the hundred receive 10 percent off, forever.**
  On today's $1,000 that is $900.
- **Community Stewards inside the hundred pay the full $5,000.** They take
  a place and receive a number; the discount is a Founding benefit only.
  (Recorded because it narrows the owner's first phrasing, which said both
  tiers received the discount. Confirmed deliberately on 2026-08-08.)
- **After the 100 places are claimed**, both tiers remain and both go to
  full price ($1,000 and $5,000). Everyone already inside keeps their rate.

**Implement the discount as a percentage, never a second fixed price.**
The locked card promises "your founding rate of 10 percent, held for as
long as you stay," and states explicitly that the guarantee is the RATE,
never the dollar. A 10-percent Stripe coupon of duration `forever` on top
of the $1,000 price honours that: raise the standard price later and
founding members keep 10 percent off the new number instead of being
stranded at $900. A hardcoded $900 price silently breaks the promise.

The payment step still shows the full line-item breakdown, always:
membership price, the founding discount as its own line when it applies,
total due today, and a clear note that membership renews annually.

Prices, the discount rate, the cap, and all policy copy live in per-group
settings (section 4), never in code.

### 1.3 The public count

The membership page already renders "N of the first 100 have said yes,"
and deliberately hides that line until there are 30 members
(`SHOW_COUNT_AT` in membership.html). Keep the threshold and the wording;
what changes is only the source, from the hand-maintained
`members/members.js` list to the real count of numbered members.

### 1.4 Referral credit (owner, 2026-08-08)

**Every member who refers a new Community Steward or Founding Member
receives 10 percent off her next year's rate, for each person who joins.**
The credit is a PERCENTAGE of whatever next year's price turns out to be,
not a fixed dollar amount (owner correction, 2026-08-08: an earlier
phrasing said $100, which is 10 percent of today's $1,000 and would drift
the moment the price moves). It applies to the referrer's renewal invoice,
never as a cash payment and never as a refund. Section 3.4 holds the data
model and its guards.

Note the consistency: both discounts in this system are rates, not
dollars. The founding benefit is 10 percent held forever, and a referral
credit is 10 percent of next year. Nothing about a member's price should
be stored as a fixed amount that a future price change can strand.

**Associates earn credits too, and they bank** (owner, 2026-08-08). A free
Associate who refers a paying member earns the same 10 percent, and it is
held for her. She has no renewal for it to land on, so it waits, and it
applies as a discount if she ever becomes a paying member herself.

That makes a credit a **standing balance on the person, not an adjustment
to one invoice.** Two moments consume it:
- a paying member's **renewal**, where her banked credits reduce that
  invoice;
- an Associate's **first payment on upgrade**, where they reduce it in
  exactly the same way.

Both need her balance visible to her, in the member portal alongside her
member number, so a member can see what she has earned and what it is
worth. An earned credit that nobody can see is one nobody trusts.

Read the design intent plainly: the free tier is not a dead end. An
Associate can bring in paying members and earn her way to a discounted
membership. That is a growth engine, and it is exactly why the cap below
matters.

OPEN (owner): referrals stack per person referred, and there is still no
ceiling. The Associate case sharpens it rather than softening it: someone
who refers ten paying members and then upgrades reads as 100 percent off
a membership. Section 3.4 provides a configurable per-referrer cap; the
value is Tori's to set. Also open: whether a credit stacks on top of the
founding 10 percent for someone inside the hundred.

This requires linking a new member to the member who referred her. The
join form's existing `referral` and `referralName` are free text that
records how someone heard about us; they cannot drive a credit on their
own.

## 2. Stack mapping (brief -> this branch)

| Brief (old stack) | This branch (odla stack) |
|---|---|
| Google Apps Script Web App backend | Existing Cloudflare Worker (`src/worker.ts`) |
| Google Sheet CRM + status dropdown | odla-db `applications` entity + admin console People table (`/admin/`) |
| Sheet `Groups` configuration tab | New odla-db `groups` entity |
| Installable onEdit approval trigger | Deliberate Approve action in the admin console (worker route) |
| Hand-rolled webhook HMAC in Apps Script | Web Crypto HMAC-SHA256 verify in the Worker |
| Stripe secret in Script Properties | Tenant vault (`stripe_secret_key`), Studio-pasted, `db.secrets.get()` |
| Gmail sends from Apps Script | `@odla-ai/email` message construction + per-env transport (section 8) |
| System Health tab + heartbeats | Stripe native alerts now; o11y service + admin health card in a later phase |
| `[Active Member]` tag | Clerk role promotion provisional -> member (already built) |

Already true on this branch and reused as-is: automatic Clerk account
creation at application, the `$users` mirror, the admin People table with
role management, booking capture, and the vault secret pattern proven with
`clerk_secret_key`.

## 3. Data model

### 3.1 `applications` (extended)

New attrs (all optional in schema; written when known):
- `phone` (string), `state` (string): new intake fields per the brief.
- `groupId` (string, indexed): the group this application belongs to.
- `stripeCustomerId`, `stripeSubscriptionId` (string, indexed).
- `renewalAt` (number): next renewal, epoch ms, from Stripe.
- `disclaimerAckAt`, `refundPolicyAckAt` (number): compliance timestamps.
- `prepEmailSentAt` (number): pre-meeting prep email stamp.
- `canceled` (boolean): set by `customer.subscription.deleted`.

Added 2026-08-08 for the tiers and the founding hundred:
- `tier` (string, indexed): `associate` | `founding` | `steward`. Rows
  written before tiers existed carry none and read as `founding`.
- `memberNumber` (number, **unique**, indexed): her place in the founding
  hundred, 1 to 100. Assigned when the first payment succeeds, because
  paying is what holds a place (the trust copy says the card is charged
  "to hold your founding-member place"). Free Associates get no number:
  they take no place. Declare it UNIQUE so a race between two
  simultaneous signups fails loudly and can be retried, rather than
  quietly issuing the same number twice.
- `foundingRatePercent` (number, optional): the discount this member
  holds forever, 10 for the founding hundred's Founding members. Stored
  on the row so the promise survives independently of any Stripe object.
- `referredByApplicationId` (string, indexed, optional): the member who
  referred her. This is the link the free-text `referral` /
  `referralName` fields cannot provide, and the thing a credit is
  computed from.

Status enum grows. Full lifecycle:

```
submitted
   -> paid_pending_vetting     (invoice.paid, first invoice)
       -> call_scheduled       (booking captured; payment retained)
           -> interviewed      (admin)
               -> approved     (admin Approve action; role -> member)
               -> declined     (admin; refund follows)
   -> refunded                 (charge.refunded webhook, any pre-approval point)
```

Notes: `call_scheduled` keeps its existing meaning and guards (a booking
report never regresses an admin-advanced status). `refunded` and `approved`
are terminal for the vetting pipeline; the audit row is preserved, never
deleted (brief's Refund Window criterion).

### 3.2 `groups` (new)

One row per membership group; Silver & Salt Capital is group #1 and the only
row at launch. Read by the worker at runtime; nothing per-group is hardcoded.
Attrs: `id` (slug, unique), `name`, `themeRef`, `standardPriceCents`,
`foundingDiscountCents`, `stripePriceId`, `notificationEmail`,
`calendarLink`, `disclaimerText`, `refundPolicyText`, `commitmentText`,
`normsText`, `emailTemplates` (json: the four templates in section 8),
`replyTo`, `createdAt`.

Added 2026-08-08, so the founding hundred stays owner-editable data rather
than code:
- `stewardPriceCents` (500000) and `stripeStewardPriceId`.
- `stewardTrustCopy`, `stewardRefundPolicyText`: the Steward variants of
  the counsel-reviewed payment-step copy.
- `foundingCapCount` (100): how many places the combined pool holds.
- `foundingDiscountPercent` (10): the founding rate, as a percentage.
- `stripeFoundingCouponId`: the Stripe coupon (10 percent, duration
  `forever`) applied to a Founding subscription while places remain.
- `referralPercentOff` (10) and `referralMaxPercentOff`: the referral
  credit and its ceiling.

`foundingDiscountCents` is retained for the existing rows but is no longer
the source of truth for the discount; `foundingDiscountPercent` is.

Lift-and-shift criterion (brief section 5): launching a second group means
inserting one `groups` row and pointing a themed page at the same worker;
records, notifications, and referral credits stay scoped by `groupId` with
no leakage. Each brand's row carries its own prices, its own founding cap,
and its own numbering, so The Tidal Collective's hundred is separate from
Silver & Salt Capital's. All brands charge through the one parent Stripe
account (MULTI-BRAND-PLAN.md).

### 3.3 `emailLog` (new)

Audit of every transactional send: `id`, `groupId`, `applicationId`
(optional), `to`, `template`, `sentAt`, `transport`. Deny-all rules like
everything else; worker-mediated only.

### 3.4 Phase R entities (spec'd now, built later)

`referralCodes`: `code` (unique), `groupId`, `memberUserId`, `createdAt`,
`active`.

`referralCredits`: `id`, `groupId`, `referrerUserId`,
`referredApplicationId`, **`percentOff` (10)**, `status`
(**banked** / applied / reversed), `createdAt`, `appliedAt`,
`appliedInvoiceId`.

`banked` replaces the old `pending`, because a credit is now a standing
balance rather than something queued against one known invoice. A free
Associate earns credits with no renewal to spend them on; they simply
wait, indefinitely, until she upgrades. The balance belongs to the
PERSON, and it is spent at whichever comes first: a paying member's
renewal, or an Associate's first payment on upgrade.

**Changed 2026-08-08:** this was `amountCents` (a flat 10000 = $100). The
owner's rule is 10 PERCENT off the referrer's next-year rate, so the
credit stores a percentage and is resolved against the price at renewal
time. Storing cents would silently become the wrong benefit the moment
the standard price changes, exactly the failure the founding rate's
"guarantee is the RATE, never the dollar" language exists to prevent.

Guards carried from the brief: credit written only on the Approve action;
reversed by `charge.refunded`; self-referral blocked; one credit per
converted referral; configurable per-referrer cap (now a percentage
ceiling, and needed more than before: unbounded stacking reaches 100
percent off); scoped per group; never tied to investment activity
(restraint below, counsel-reviewed).

Only referrals that convert to a PAID tier earn a credit: Founding Member
or Community Steward. An Associate joining earns the referrer nothing,
since the free tier is not a sale. Note the asymmetry, which is
deliberate: an Associate can EARN credits by referring paying members,
but referring someone INTO the free tier earns nobody anything.

> Regulatory compliance restraint (verbatim from the brief): This referral
> tracking exists only to measure community membership growth. No referral
> fees, transaction percentages, or finder's bonuses shall be mapped,
> computed, or paid based on any individual's eventual participation in, or
> capital allocation to, any private placement or Special Purpose Vehicle
> operated by the investment entity.

## 4. Secrets and configuration

| Value | Lives in | Notes |
|---|---|---|
| Stripe secret key (`sk_test_`/`sk_live_`) | tenant vault, `stripe_secret_key` | Studio paste, per env; same pattern as `clerk_secret_key`; missing key degrades payment routes to 503 with a clear error |
| Stripe webhook signing secret (`whsec_`) | tenant vault, `stripe_webhook_secret` | Studio paste, per env |
| Stripe publishable key (`pk_test_`/`pk_live_`) | `groups` row or public config | public by design |
| Email transport key (only if API fallback is used) | tenant vault | see section 8 |

Two Studio pastes per environment, repeated for prod at Phase 5. Never in
the repo, Wrangler config, or chat, per `MIGRATION.md` rules.

## 5. Worker API

All new routes live in `src/worker.ts` beside the existing ones. Stripe
calls use fetch against the Stripe REST API with the vault key (no SDK
dependency needed; the calls are simple forms).

### 5.1 `POST /api/payments/subscription` (public)

Body: `{ applicationId }`. The worker:
1. Loads the application (404 if unknown; 409 if already paid).
2. Loads the group row for its `groupId`.
3. Creates (or reuses by `stripeCustomerId`) a Stripe Customer with the
   applicant's email and name.
4. Creates a Subscription on `stripePriceId` with
   `payment_behavior: default_incomplete`,
   `payment_settings[save_default_payment_method]: on_subscription`, and
   `metadata`: `applicationId`, `groupId`, `email` (and `ref` in Phase R).
   The same metadata goes on the Customer.
5. Stamps `refundPolicyAckAt` from the request (the frontend sends it when
   the checkbox is ticked; the Pay button is gated on it client-side and
   the route rejects without it).
6. Returns `{ clientSecret, lineItems, publishableKey }` where `lineItems`
   is the display breakdown computed from the group row.

### 5.2 `POST /api/webhooks/stripe` (public, signature-verified)

Verifies the `Stripe-Signature` header with Web Crypto HMAC-SHA256 over the
timestamped payload against `stripe_webhook_secret`; rejects on mismatch or
stale timestamp. Every handler locates the application row from
`subscription.metadata.applicationId` (email fallback) and writes with a
mutationId derived from the Stripe event id, so replays are exactly-once.

- `invoice.paid`, first invoice: status -> `paid_pending_vetting` (unless
  already advanced), store `stripeCustomerId`, `stripeSubscriptionId`,
  `renewalAt`; send the group's admin notification and the applicant's
  payment confirmation (which embeds the refund policy text).
- `invoice.paid`, later invoices: update `renewalAt` only.
- `charge.refunded`: status -> `refunded`; Phase R hook reverses any pending
  referral credit; confirmation kept in `emailLog` if a notice is sent.
- `customer.subscription.deleted`: set `canceled: true`.

### 5.3 `POST /api/admin/applications/:id/approve` (admin)

One deliberate action, replacing the brief's onEdit trigger. Guarded to fire
once (only from `interviewed` or `paid_pending_vetting`/`call_scheduled`):
sets status `approved`, promotes the linked Clerk user to role `member`
(reusing the role route's vault machinery), sends the onboarding invite
email, and (Phase R) writes the referral credit. Payment alone can never
trigger any of this (brief's Approval Test criterion).

### 5.4 `POST /api/admin/applications/:id/refund` (admin)

The non-fit action, one button in the console with a confirm dialog:
refunds the subscription's first invoice in full and cancels the
subscription via Stripe. The status flip to `refunded` comes from the
webhook, keeping Stripe as the source of truth; the route returns what it
did so the console can show immediate feedback. Also valid: Tori refunds
directly in the Stripe dashboard, and the webhook produces the identical
result.

## 6. Join flow UI (`join.html`)

- Progress tracker becomes three steps: `1 Apply` -> `2 Secure Your Place`
  -> `3 Book Your Conversation`.
- **Step 1 (Apply):** add Phone and State fields. The brief trims intake to
  First Name, Last Name, Email, Phone, State, Referral Source; the live form
  also collects who-you-are, focus areas, LinkedIn, and a message. OPEN
  ITEM: owner confirms whether to drop those extra fields or keep them
  (section 12). The compliance disclaimer block renders above the submit
  button with a required checkbox gating submit; `disclaimerAckAt` is
  recorded on the application row.
- **Step 2 (Secure Your Place, new):** the Payment Element step.
  - Line-item breakdown from `/api/payments/subscription` (never hardcoded).
  - Stripe Payment Element mounted via Stripe.js, styled with the
    Appearance API: Satoshi for UI text (with Cormorant Garamond where the
    element's `fonts`/`fontSrc` allows), lime `#7CB83F` focus and accent,
    cream `#FBF8F2` and sand `#F4EFE6` surfaces, 4px control radius. The
    surrounding page stays fully brand-controlled. Display digits follow
    the Cormorant Infant numeral rule wherever the page (not the element)
    renders them.
  - Express Checkout Element (Apple Pay / Google Pay) above the card
    fields. Apple Pay requires Stripe domain verification plus
    `/.well-known/apple-developer-merchantid-domain-association` hosted on
    the site; register the workers.dev domain for dev testing and the real
    domain at Phase 5. Wallet buttons stay hidden until this is done.
  - Trust copy beside the element (verbatim from the brief):

    > Founding-member rate: $900 for your first year (standard membership
    > $1,000/year, less a $100 founding-member discount). Your card is
    > charged $900.00 today to hold your founding-member place. Membership
    > renews automatically each year at your locked-in founding-member rate
    > of $900 for as long as you remain a member, and you can cancel
    > anytime before a renewal. After our conversation, if we decide
    > membership is not the right fit, your $900 is refunded in full and
    > your membership is canceled.

  - The full refund policy (the brief's boxed text, stored per group in
    `groups.refundPolicyText`) renders beneath the element with a required
    checkbox; the Pay button stays disabled until acknowledged, and the
    acknowledgment timestamp lands on the row.
  - Full client-side lifecycle: loading state while the subscription is
    created, brand-styled inline errors, and advancing to Step 3 only on a
    confirmed first payment.
- **Step 3 (Book Your Conversation):** the existing booking step, with the
  status callout: `Status: Payment received, application pending review. If
  we are not the right fit after our conversation, your $900 is refunded in
  full.` Existing booking capture, account auto-creation, and the member
  area sign-in handoff are retained unchanged. When @odla-ai/calendar
  lands, its first-party booking replaces the iframe here with no change to
  the payment step.

## 7. Member and admin surfaces

- **Member area (`/members/`):** the provisional card adds a membership
  line: paid status, the founding-member rate, and the renewal date once
  known ("Your founding membership is active through July 2027" style).
- **Admin console (`/admin/`):** the People table adds payment status and
  renewal date columns, an **Approve** button (runs 5.3; shown for paid,
  interviewed rows), and a **Refund and cancel** button (runs 5.4; confirm
  dialog stating the amount and that the subscription will not renew).

## 8. Email

Construction: `@odla-ai/email` (`buildMessage` / `sendMessage`), which is
dependency-free and isomorphic, with CR/LF header injection protection
built in. Transport sits behind the package's one-method `EmailSender`
seam, chosen per environment:

- **Dev:** ALL outbound mail redirects to a debug inbox (owner-designated)
  with a `[dev]` subject prefix, so test applicants never receive real
  mail. Reply-to: the debug address.
- **Prod:** Cloudflare Email Routing `send_email` binding on the zone.
  OPEN ITEM: the binding requires the domain on Cloudflare (arrives at
  Phase 5) and Cloudflare restricts recipients to verified destination
  addresses, which suits the admin notification but may block
  applicant-facing sends. Verify during implementation; the fallback is an
  email API adapter (key in the vault) behind the same seam, so the choice
  never touches calling code. Reply-to: tori@silverandsaltcapital.com.

Four templates, stored per group in `groups.emailTemplates` and rendered
with application fields:
1. **Admin notification** (to `groups.notificationEmail`): new paid
   application awaiting vetting.
2. **Payment confirmation** (to applicant): receipt framing plus the full
   refund policy text.
3. **Pre-meeting prep** (to applicant, sent when the booking is confirmed,
   stamping `prepEmailSentAt`): the group's community commitment and norms,
   and a line that the conversation includes agreeing to them. The
   commitment and norms copy is owner-supplied content in the group row.
4. **Onboarding invite** (to applicant, sent by the Approve action):
   welcome plus the member area link.

Every send writes an `emailLog` row. A booked application with a blank
`prepEmailSentAt` is a monitoring flag (section 9).

## 9. Monitoring

Day one: enable Stripe's native failed-webhook email alerts; the join
frontend already surfaces backend failures rather than assuming success.
Later phase (with o11y): wrap the worker in `withObservability`, add a
scheduled reconciliation (every Stripe charge maps to a
`paid_pending_vetting`/`approved` row, every refund to `refunded`; drift
alerts), surface a health card on `/admin/` (last webhook received, last
submission, paid-awaiting-vetting count per group, missing prep emails),
and alert to `groups.notificationEmail`.

## 10. Phasing

- **P1, payment core (next build):** sections 3.1-3.3, 4, 5, 6, 7, 8.
  Stripe Test Mode only until Phase 5.
- **P2, referrals:** section 3.4 entities, `?ref=` prefill, code issuance
  for active members, credit write on Approve, reversal on refund, ledger
  view in the console.
- **P3, accreditation panel:** the brief's Task 5. A post-approval member
  area panel (role `member` required): Part A community profile (full
  residential address deferred from intake, chapter, streams, interests);
  Part B the Rule 501 self-certification gate. Accredited + opted-in
  members get an `[Accredited Investor]` marker kept in a SEPARATE
  namespace from membership data, preserving the 506(b) segregation;
  non-accredited members stay in the community pipeline only. The existing
  `investor/welcome/` pages are the tone reference.
- **P4, renewal niceties + monitoring extras:** pre-renewal reminder from
  `invoice.upcoming`, referral credits auto-applied via Stripe customer
  balance, o11y health card. The annual-subscription structure shipped in
  P1 makes these additive; nothing about the payment model changes.

## 11. Acceptance criteria (translated from the brief's section 5)

1. **Processing:** in Stripe Test Mode, a mock applicant completes Step 1,
   pays $900 at Step 2 (yearly subscription created, first invoice
   charged), and lands on Step 3 with no broken transitions or layout shift
   on mobile. `invoice.paid` flips the row to `paid_pending_vetting` and
   stores customer id, subscription id, and renewal date. The webhook
   rejects bad signatures.
2. **Approval:** the console Approve action, and only it, sends the
   onboarding invite, promotes the Clerk role to member, and fires exactly
   once. Payment alone never approves anyone.
3. **Subscription default:** the payment is an annual recurring
   subscription showing its next renewal in Stripe and on the row; the P4
   reminder and credit auto-apply require no payment-model change.
4. **Refund:** the console Refund and cancel action (or a dashboard refund)
   returns the full $900, the webhook flips the row to `refunded`, any
   pending referral credit reverses (P2), the subscription never renews,
   and the row is preserved for audit.
5. **Brand fidelity:** Cormorant Garamond headings, Satoshi UI, cream/sand/
   moss with lime accents, digits in Cormorant Infant, payment completed
   on-domain in a brand-styled element, wallets above card fields, and the
   discount always shown as a line-item breakdown.
6. **Compliance gates:** disclaimer checkbox gates submit; refund-policy
   checkbox gates Pay; both acknowledgments timestamped on the row; the
   accreditation questionnaire is reachable only post-approval; membership
   and investor data stay in separate namespaces with no cross-filtering.
7. **Owner maintainability:** prices, policy copy, and email templates are
   `groups` data editable without a developer (console editing UI can
   follow; direct data edit suffices at first), plus a short handover note
   on approving, refunding, and reading the console.
8. **Lift and shift:** a second group launches by inserting one `groups`
   row and a themed page, with subscriptions, records, and notifications
   correctly scoped to it, and no code changes.

## 12. Open items

1. **Counsel sign-off** on: the intake disclaimer, the refund policy text,
   the trust copy, the 506(b) segregation approach, and the referral
   restraint. RESOLVED 2026-07-11 (owner): pre-launch timing is fine;
   remains a launch gate.
2. **Stripe account setup** (owner): RESOLVED path 2026-07-11. Owner
   creates the Test Mode account and pastes `stripe_secret_key` into
   Studio (dev). `_scripts/setup-stripe-dev.mjs <pk_test_...>` then creates
   the Product, the $900 yearly Price, and the webhook endpoint
   programmatically and writes the price id and publishable key onto the
   group row; the owner's second paste is the endpoint's signing secret
   (Stripe dashboard -> Developers -> Webhooks -> endpoint -> Signing
   secret) into Studio as `stripe_webhook_secret`.
3. **Intake field delta**: RESOLVED 2026-07-11 (owner): keep the
   additional fields (who-you-are, focus, LinkedIn, message) alongside the
   new Phone and State, and store the profile on the Clerk user too
   (public_metadata.profile; the intro message stays db-only).
4. **Email transport verification**: dev mail redirects to
   cory.ondrejka+debug@gmail.com with a [dev] prefix (owner-designated,
   built). Whether Cloudflare `send_email` can reach applicant addresses in
   prod is still to verify at Phase 5; the API-adapter fallback stands.
5. **Apple Pay domain verification timing**: workers.dev for dev testing,
   the real domain at Phase 5 cutover.
6. **Calendar integration point**: when @odla-ai/calendar ships, its
   booking UI replaces the Step 3 iframe; the payment flow is unaffected.
7. **Bookkeeper review** of the flat referral credit's accounting treatment
   (P2, from the brief).
