// Silver & Salt Capital, resolved as an @odla-ai/chapter engine.
//
// Every value here is derived from the Phase 0 frozen baseline
// (tests/fixtures/legacy-baseline.json), NOT from Chapter's defaults and not
// from memory. Where a Chapter default would have changed the product, the
// override is explicit and carries the reason. tests/chapter-parity.test.mjs
// asserts this config against the frozen fixtures, so a package upgrade cannot
// silently move the site.
//
// Network role: Silver & Salt Capital is a FOLLOWER on its first edge (owner
// decision 2026-07-25). It receives shared records on POST
// /api/network/shared, and exposes only the explicit read/write lanes below to
// its paired leader. `network.targets` stays absent because this site leads no
// edge yet.

import { defineChapter } from "@odla-ai/chapter";
import { crm } from "./crm.mjs";

export const chapter = defineChapter({
  id: "silver-and-salt-capital",
  name: "Silver & Salt Capital",
  url: "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev",

  // Public membership site with join, payment, booking, member, and admin
  // surfaces. Not "hub": that profile is admin-only and would drop the entire
  // public member surface this product is built around.
  mode: "chapter",

  // The existing CRM (src/crm.mjs) is reused verbatim rather than taking
  // Chapter's per-mode default. It already models the `person` type whose
  // pipeline mirrors applications.status, and its slot promotions (state s1,
  // whoYouAre s2, referral s3) are load-bearing for the admin list's
  // server-side sort/filter.
  //
  // FOLLOWER NOTE: passing a custom crm REPLACES Chapter's default; missing
  // types are not merged back in. This CRM declares `person` only, so a leader
  // may send person records and nothing else. If the (still unnamed) leader
  // needs to send companies, a `company` type must be added here first or the
  // payload is rejected before any CRM write.
  crm,

  // Follower-owned federation boundary. Built Not Found can browse only the
  // approved minimum person projection (name; stage/timestamps are bounded
  // package metadata) and can append deliberately shared notes to that
  // person's normal CRM Notes feed. Direct contact, referral, application,
  // message, billing, and follower-private activity never leave this site.
  network: {
    readers: [{
      id: "built-not-found",
      fields: { person: ["name"] },
      sharedNotes: ["person"],
      // Keep the current edge read/note-only during the package upgrade. The
      // current Chapter line can also grant field edits, stage transitions,
      // and admission decisions, but each is a later reviewed roadmap slice.
      editableFields: {},
      stageTransitions: [],
      admissionGrants: false,
      // This is a separate, read-only lane: the signed response contains only
      // partition-bound keyed digests plus lifecycle status/cancellation.
      // Raw application, customer, and subscription identifiers never cross.
      commercialParity: true,
    }],
  },

  // Built Not Found may publish complete, signed signup revisions to this
  // follower. Development accepts test-mode Stripe objects only; production
  // remains absent from this repository descriptor until the human checkpoint.
  signupControl: {
    sourceId: "built-not-found",
    stripeMode: "test",
  },

  // Preserve the populated dev content namespaces discovered by the strict
  // schema gate. Chapter admins retain their local layer; Built Not Found may
  // deliver a separate signed parent layer without replacing local pages.
  memberContent: {
    localAuthoring: true,
    parent: { sourceId: "built-not-found" },
  },

  services: ["db", "calendar"],

  // ── Brand ────────────────────────────────────────────────────────────
  // Semantic roles mapped from styles.css :root. Public pages keep their own
  // stylesheet untouched; these tokens exist so the packaged member/admin
  // surfaces inherit the same identity instead of shipping a second one.
  brand: {
    // The packaged "salt" theme in @odla-ai/ui is already this brand: its
    // scope.css carries --bg #FBF8F2 (cream), --surface #F4EFE6 (sand), --text
    // #2F3E34 (moss), --accent #D16B4F (rust), --accent-2 #1A8F7D (teal), and
    // the Satoshi + Cormorant Garamond pairing. Naming it here means the admin
    // console inherits the site identity from ONE source instead of a parallel
    // theme system. The semantic tokens below still win where they are set.
    theme: "salt",
    colorScheme: "light",
    wordmark: "Silver & Salt Capital",
    badge: "S&S",
    fonts: {
      display: "Cormorant Garamond",
      body: "Satoshi",
      // Digits render in Cormorant Infant, never Cormorant Garamond, per the
      // brand standard enforced by the unicode-range override in styles.css.
      numeral: "Cormorant Infant",
    },
    tokens: {
      background: "#FBF8F2", // --cream
      surface: "#FFFFFF",
      surface2: "#F4EFE6", // --sand
      text: "#2F3E34", // --text-primary / --moss
      textMuted: "#4A5E50", // --text-body / --moss-light
      textFaint: "#7E8E84", // --text-muted / --sage
      border: "rgba(47,62,52,0.08)", // --border
      borderStrong: "rgba(47,62,52,0.20)",
      accent: "#1A8F7D", // --accent (teal)
      accentStrong: "#2F3E34", // --moss
      accentSoft: "rgba(26,143,125,0.10)", // --accent-soft
      onAccent: "#FBF8F2",
      good: "#1A8F7D", // --teal
      warn: "#C4A47E", // --warm
      danger: "#D16B4F", // --rust
      chart1: "#2F3E34",
      chart2: "#1A8F7D",
      chart3: "#D16B4F",
      chart4: "#C4A47E",
      chart5: "#7E8E84",
      chart6: "#3D5A99", // --ink
    },
    palette: {
      cream: "#FBF8F2",
      sand: "#F4EFE6",
      moss: "#2F3E34",
      sage: "#7E8E84",
      rust: "#D16B4F",
      teal: "#1A8F7D",
    },
  },

  // ── Money ────────────────────────────────────────────────────────────
  // Matches the live dev group row. The Stripe Price is authoritative for what
  // is actually charged; provider-side amount/currency/interval equality is a
  // cutover gate, not something this config can assert.
  prices: {
    standardCents: 100_000, // $1,000/year standard membership
    foundingDiscountCents: 10_000, // $100 founding discount -> $900 due today
    currency: "usd",
    interval: "year",
  },

  // Managed tier authority replaces the ambiguous single-price fallback while
  // retaining the same immutable Stripe Price and $900 annual charge. Additional
  // tiers require a later signed BNF signup-control revision and their own
  // reviewed Stripe Prices.
  tiers: [{
    id: "founding",
    name: "Founding Member",
    priceCents: 90_000,
    stripePriceId: "price_1Ts7rW3sLwQtiao1DTAj0iS0",
    sortOrder: 0,
    active: true,
  }],

  // ── Policy copy ──────────────────────────────────────────────────────
  // Seed values only. createChapterIntegration inserts the group row ONLY when
  // absent, and the live row has been owner-edited since 2026-07-11, so these
  // strings will NOT overwrite production copy. The live row stays authoritative.
  policy: {
    disclaimerText:
      "Membership provides access to education, networking, and community benefits. Membership does not guarantee access to private investment opportunities, nor does it constitute an offer to sell or a solicitation of an offer to buy any securities.",
    commitmentText:
      "We show up for one another, learn together, and keep what is shared in the room.",
    normsText:
      "Come prepared, participate generously, and honor confidentiality.",
  },

  // ── Email ────────────────────────────────────────────────────────────
  // Addressing matches the live dev group row: every dev send lands in the
  // owner's debug inbox. Template BODIES live on the group row and are
  // owner-editable at runtime; this config only carries addressing.
  emails: {
    notificationEmail: "cory.ondrejka+debug@gmail.com",
    replyTo: "cory.ondrejka+debug@gmail.com",
    debugEmail: "cory.ondrejka+debug@gmail.com",
  },

  // WHEN each lifecycle email fires (build-time), as opposed to its content.
  // OVERRIDE: Chapter defaults adminNotification to "submit". The legacy
  // worker fires it inside the Stripe webhook on first successful payment, so
  // "submit" would notify the owner about unpaid applications that today are
  // silent.
  sends: {
    adminNotification: "payment",
  },

  // ── Scheduling ───────────────────────────────────────────────────────
  // Matches groups.schedulingJson on the live dev row.
  scheduling: {
    slotMinutes: 45,
    days: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 17,
    timezone: "America/Los_Angeles",
  },

  // ── Pipeline ─────────────────────────────────────────────────────────
  // The seven legacy statuses in their legacy order, with the exact subsets the
  // legacy worker enforced. Status never moves backwards (package-enforced).
  pipeline: {
    stages: [
      "submitted",
      "paid_pending_vetting",
      "call_scheduled",
      "interviewed",
      "approved",
      "declined",
      "refunded",
    ],
    initial: "submitted",
    // BOOKABLE_STATUSES in src/worker.ts
    bookableFrom: ["submitted", "paid_pending_vetting", "call_scheduled"],
    // The approve route's 409 guard in src/worker.ts
    approvableFrom: ["paid_pending_vetting", "call_scheduled", "interviewed"],
  },

  // ── Application (join form) ──────────────────────────────────────────
  // Server-side validation, mirroring REQUIRED / OPTIONAL / MAX_LEN in
  // src/worker.ts. NOTE: join.html marks phone and state required in the
  // markup, but the legacy SERVER accepts them empty. Server validation is the
  // contract being preserved, so they stay optional here; making them required
  // would newly reject API submissions the current product accepts.
  application: {
    required: ["firstName", "lastName", "email", "referral", "whoYouAre", "message"],
    optional: ["referralName", "linkedin", "phone", "state"],
    maxLen: {
      firstName: 200,
      lastName: 200,
      email: 320,
      referral: 100,
      referralName: 200,
      whoYouAre: 100,
      linkedin: 500,
      message: 5000,
      phone: 40,
      state: 60,
    },
    bodyCap: 32_768,
    validateEmail: true,

    // OVERRIDE: Chapter defaults maxArrayLen to 100. The legacy parser caps
    // `focus` at 20 (.slice(0, 20)); 100 would widen what a client can post.
    maxArrayLen: 20,

    // Chapter's default (true). join.html disables submit until the consent box
    // is ticked, so no real browser submission is newly rejected; this only
    // closes a consent bypass for direct API posts. disclaimerAckAt is preserved.
    requireDisclaimerAck: true,

    // Owner decision 2026-07-25: DROP the legacy Clerk profile projection.
    // The legacy worker wrote phone, state, whoYouAre, focus, and linkedin into
    // client-readable Clerk public_metadata.profile. A repo-wide search found no
    // reader anywhere (the worker itself reads only public_metadata.role), so
    // this removes browser-readable PII with no functional loss. Application
    // detail stays in odla-db.
    profileFields: [],

    // Application fields carried into the one-way CRM projection on top of the
    // built-in identity/contact set. Each is declared on the person type in
    // src/crm.mjs, which is what keeps the enrichment from being dropped.
    crmFields: ["state", "whoYouAre", "referral", "referralName", "linkedin", "focus", "message"],
  },

  // ── Auth ─────────────────────────────────────────────────────────────
  // Claim-mode ladder read from Clerk publicMetadata.role, with the read-only
  // superAdmins table above admin. These are Chapter's chapter-mode defaults;
  // they are stated explicitly because they are authorization, and a silent
  // default change here would be a privilege bug.
  auth: {
    source: "claim",
    claim: "role",
    ladder: ["provisional", "member", "admin"],
    superAdmins: true,
  },

  // ── Account side effects ─────────────────────────────────────────────
  // OVERRIDE of the "make it explicit" requirement: the legacy worker calls
  // ensureClerkAccount at submit, creating the account server-side. "none"
  // would silently stop provisioning accounts for new applicants. Requires the
  // `clerk_secret_key` vault secret.
  account: "create",

  // ── Admin operations ─────────────────────────────────────────────────
  operations: {
    // Matches the legacy approve route: promote to member in Clerk, send the
    // onboardingInvite template.
    onApprove: { promoteTo: "member", send: "onboardingInvite" },
    refund: {
      // The legacy refund route 409s from "approved" (non-refundable per
      // policy) and from "refunded" (already refunded). Everything else is
      // allowed, so the allowlist is the other five stages.
      allowedFrom: [
        "submitted",
        "paid_pending_vetting",
        "call_scheduled",
        "interviewed",
        "declined",
      ],
      cancelSubscription: true,
    },
  },
});

export default chapter;
