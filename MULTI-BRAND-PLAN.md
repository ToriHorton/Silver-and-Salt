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

**The investment side is out of scope here regardless of its structure.**
Membership money is the PBC's rail and is the only thing this plan or the
Stripe account touches. (Tori deprecated the previously documented
investment entity on 2026-08-08; see the note under "Stale business
documents" below before citing any entity name.)

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

## Stale business documents (flagged 2026-08-08)

Tori deprecated the previously documented investment entity ("the monarch
work should be deprecated at this point") and asked that references be
removed. **Her own business documents have not caught up**, which is how
it got cited in the first place:

- `built-not-found-capital-living-document-v9.md` (updated 2026-08-05):
  25 mentions
- `two-entity-structure-map.md` (2026-06-27): 4 mentions, including a
  section heading, plus the matching `.docx` versions

Those are Tori's canonical strategy documents and were not edited here:
removing an entity from a document that describes formation, inter-entity
agreements, and tax treatment is her call with counsel, not a find and
replace. **Ask her what replaced it before describing the investment side
at all.** Until then, the safe move in any copy is to describe membership
only, which is all this plan and the Stripe account touch anyway.

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

## Stripe consolidation: DONE on dev (2026-08-08)

Silver & Salt dev now charges through **Tori's own account**,
`acct_1U2IOXAg5KcDIAiw`, business name "Built Not Found Capital sandbox"
(named at the parent level, which is correct).

- Product `prod_V2Nq2eZ1C5vSlm`; prices `price_1U2J4TAg…Gzp` (Founding
  $900/yr) and `price_1U2J4TAg…Bwu` (Steward $5,000/yr).
- Webhook `we_1U2J4UAg…` delivering to her worker; signing secret written
  to the vault at creation, never printed.
- **The secret key lives in BOTH vaults**, which is the intended shape:
  the parent holds the PBC account key, and each chapter's vault holds the
  same value so every brand charges through the one account. Tori pasted
  it into `built-not-found--dev`; it was copied programmatically into
  `silver-and-salt-capital--dev` (read, piped over stdin, never printed).
- **Full acceptance passed on her account:** Founding charged $900 and
  Steward charged $5,000, both webhooks flipped the rows to
  paid_pending_vetting with a 2027-08-08 renewal and logged both emails;
  "not a paid fit" refunded $900, canceled the subscription, promoted the
  member and left the row **approved/associate** (the guard held); "not a
  community fit" refunded $5,000 and settled at declined.

Note for whoever sets up the next brand: a key that starts `mk_` or `pk_`
is not the secret key. The real one starts `sk_test_` and is ~107
characters. The setup script refuses a publishable/secret account
mismatch, but only a real secret key gets past the vault check at all.

## Immediate next steps

1. Add **statement descriptors** per brand so a member's statement reads
   the brand rather than the parent's legal name.
2. Fix the parent's Cory-pointing network URL and its three notification
   addresses.
3. Decide The Tidal Collective's tiers and pricing, then it is one
   `groups` row plus a themed page.
4. Repeat the Stripe wiring for prod at cutover (a live key, a live
   webhook, and the same acceptance run).

## Working agreement (Tori, 2026-08-08)

**Work runs through Tori's accounts and her workers, the same way it used
to run through Cory's.** Setting up and deploying her workers is
sanctioned; she does not need anyone else in the loop to move her own
work forward. Where something still routes through Cory's accounts, move
it, and say so on the shared thread first.

Notified Cory and his agents 2026-08-08 via `odla-ai discuss`, topic
`62a8d347-37b3-5d8e-b9b2-af11802d13e6` ("Silver & Salt + Built Not Found
moving onto Tori's accounts and workers"): the webhook move, the calendar
reconnect, the pending Stripe account swap, the two test events stranded
on his calendar, the parent config still pointing at him, the schema attr
we declared, and the four bugs filed.

## Log

- **2026-08-08:** Tori directed a single Stripe account at the parent for
  all DBA brands, plus central CRM visibility. Discovered the parent org
  is already live on odla and already models Silver & Salt as a follower
  chapter. Recorded both decisions and the independence gaps in the
  parent's config. Sanctioned running work through her own workers, and
  posted the change notice to the shared odla thread.
