# Multi-brand architecture: one business account, many DBA brands

Durable state for running Silver & Salt Capital, The Tidal Collective, and
future market brands as DBAs of one parent company, with one Stripe
account and one place for Tori to see everything.

Owner decisions 2026-08-08. Spans two repos and one live production site,
so read this before touching either. Excluded from the public build.

## The corporate shape (from the Living Document v9)

**Built Not Found Capital** (a PBC) is the community entity. It files
regional market **DBAs**, which are trade names, not separate legal
entities:

- **Silver & Salt Capital** — Utah, active, women-backing-women thesis.
- **The Tidal Collective** — new brand named by Tori 2026-08-08.
  (The Living Document's Phase 2 placeholder was "Santa Cruz Local";
  confirm whether Tidal replaces it or is an additional market.)
- Target in the Living Document: 4+ local market brands, each with its
  own programming and a Community Lead.

**Monarch Capital Platform, LLC** is the separate investment entity
(SPVs, carry). It is NOT part of this plan: membership money is the
PBC's rail, and the two rails stay independent by design.

**Why one Stripe account is the right call, not just convenient:** DBAs
are trade names of one legal entity with one EIN. Stripe accounts are
per legal entity, so the PBC holds the account and each brand appears
through per-brand products and statement descriptors. Tori's instinct
here matches the corporate structure.

## What already exists (discovered 2026-08-08)

Far more than expected. The parent org is **already live in production**:

- **`built-not-found`** — odla app, mode `hub`, live on
  **builtnotfoundcapital.com** since 2026-08-06, deployed to **Tori's
  own Cloudflare account**. Newest odla stack (chapter 0.28.1, crm 0.5.0,
  db 0.9.1, ui 0.16.0, plus apps/brand/chat/o11y/pm/security). Repo:
  `~/Projects/bnfCapWeb`, branch `tori/prod-builtnotfoundcapital`.
- **The parent already models Silver & Salt as a child chapter.** Its
  `network.targets` declares `silver-and-salt-capital` as a follower on a
  directed edge, and Silver & Salt's own chapter config (on `main`)
  declares `built-not-found` as its reader. The federation is deliberately
  narrow today: only `person` fields cross, with a comment reading "Keep
  application narrative, pipeline, billing, and account state local."

So the hub-and-chapter topology Tori is asking for is not new work. It
was designed and partly built; what changes is the boundary and the
billing.

## Decisions (Tori, 2026-08-08)

1. **Shared Stripe, local flows.** One Stripe account owned by the PBC.
   Each brand keeps its own join form, payment step, and member records,
   and every brand charges through that one account using its own
   products and statement descriptors. Chosen over moving everything to
   the parent because it works with what is already built.
2. **Widen what the parent sees.** Tori owns every brand, so the hub gets
   full member records across brands rather than the current name-and-email
   projection. Add to the counsel review list: member expectations and the
   506(b) posture both touch this, and the current narrow boundary was a
   deliberate choice worth revisiting deliberately.

## What this implies, in build order

### 1. The Stripe account must belong to the PBC
The account Tori created (`acct_1U2IOX…`) needs to be the **Built Not
Found Capital** account, not a Silver & Salt account. If it was created
under the brand name, rename the business in Stripe settings to the legal
entity and let the brand show up per-product instead. Getting this wrong
is annoying later: Stripe ties the account to a legal entity, EIN, and
bank account, and moving products between accounts means re-subscribing
every member.

### 2. Per-brand products, prices, and statement descriptors
One product per brand per tier, in the one account:
- `Silver & Salt Capital Membership` — Founding $900/yr, Steward $5,000/yr
- `The Tidal Collective Membership` — tiers TBD
Each product carries a **statement descriptor** naming the brand the
member recognizes, so a card statement reads SILVER & SALT and not the
parent's legal name. This is the detail that makes one account feel like
many brands to the member.

### 3. Each brand's vault holds the same PBC secret key
`stripe_secret_key` is the same value in each chapter's tenant vault;
each chapter's `groups` row carries its OWN price ids. The existing
`groups` entity already models exactly this (PAYMENT-SPEC.md's
lift-and-shift criterion: a new brand is one row plus a themed page).

### 4. Widen the federation edge
Extend `network.targets[].fields.person` in the parent's chapter config
and the matching `network.readers` in each chapter's config. Counsel note
per decision 2, and both sides must agree or the payload is rejected.

## Independence gaps in the parent org (found 2026-08-08)

Same theme as the Silver & Salt audit: the parent's config still points
at Cory's infrastructure.

- `network.targets[0].url` is
  `https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev` — the
  wrong worker. Should be Tori's
  (`silver-and-salt-capital-dev.silver-and-salt.workers.dev`).
- `emails.notificationEmail` and `replyTo` are `cory.ondrejka+bnf@gmail.com`;
  `debugEmail` is `cory.ondrejka+bnf-debug@gmail.com`. All should be Tori's.

**These live in a repo whose `main` is deployed to a live public site.
Change them deliberately, and do not deploy the parent without Tori's
explicit go-ahead.**

## The Silver & Salt complication (still unresolved)

The hub expects Silver & Salt to be a **chapter** — that is, the
chapter-based implementation on `main`. J1's three tiers were built on
`odla-conversion-test`, which predates chapter. So the branch decision
recorded in JOURNEYS-PLAN.md ("stay on this dev branch") now collides
with the multi-brand plan: a chapter that is not running chapter cannot
join the federation cleanly.

This does not block the Stripe consolidation, which is account-level
work. It does block step 4. The unblocker remains odla shipping
multi-tier membership in chapter
([bug fd944a76](https://odla.ai/studio/pm/bugs/fd944a76-460a-54f4-915d-f19a7edc0c68)).

## Immediate next steps

1. **Confirm the Stripe account is the PBC's** and rename it if needed.
2. **Tori pastes the PBC secret key** into Studio as `stripe_secret_key`
   for the Silver & Salt dev env (and later each chapter's).
3. Run `_scripts/setup-stripe-account-dev.mjs <pk_test_…>`, which creates
   the product, both prices, and the webhook, and refuses if the two keys
   disagree about which account they belong to.
4. Add statement descriptors per brand.
5. Fix the parent's Cory-pointing URL and email addresses.
6. Decide Tidal Collective's tiers and pricing, then it is one `groups`
   row plus a themed page.

## Log

- **2026-08-08:** Tori directed a single Stripe account at the parent for
  all DBA brands, plus central CRM visibility. Discovered the parent org
  is already live on odla and already models Silver & Salt as a follower
  chapter. Recorded both decisions and the independence gaps in the
  parent's config.
