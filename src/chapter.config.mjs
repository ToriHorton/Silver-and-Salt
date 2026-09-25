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
import { SIGNUP_EMAIL_EVENTS } from "./email-events.mjs";
import { crm } from "./crm.mjs";

// The values that differ between the development and production
// deployments. Everything else in the chapter is identical in both, so the
// same reviewed behaviour ships to production; only identity, addressing,
// Stripe mode and the seeded tier set change. src/deployment.ts holds the
// matching Worker-side table (tenants, runtimes, origins).
export const ENVIRONMENTS = {
  dev: {
    url: "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev",
    stripeMode: "test",
    // Each developer Worker verifies only its own addressed delivery.
    // Declaring another runtime is not permission to deploy or install its
    // credential.
    runtimeSecrets: {
      cory: "signup_control_silver_and_salt_capital__cory",
      tori: "signup_control_silver_and_salt_capital__tori",
    },
    // Addressing matches the live dev group row: every dev send lands in the
    // owner's debug inbox (src/email.ts redirects outside prod).
    emails: {
      notificationEmail: "cory.ondrejka+debug@gmail.com",
      replyTo: "cory.ondrejka+debug@gmail.com",
      debugEmail: "cory.ondrejka+debug@gmail.com",
    },
    // Managed tier authority replaces the ambiguous single-price fallback while
    // retaining the same immutable TEST Stripe Price and $900 annual charge.
    tiers: [{
      id: "founding",
      name: "Founding Member",
      priceCents: 90_000,
      stripePriceId: "price_1Ts7rW3sLwQtiao1DTAj0iS0",
      sortOrder: 0,
      active: true,
    }],
  },
  prod: {
    url: "https://silverandsaltcapital.com",
    stripeMode: "live",
    runtimeSecrets: {
      live: "signup_control_silver_and_salt_capital__live",
    },
    // Real recipients. There is no debugEmail: src/email.ts ignores it in
    // prod anyway, and leaving it out makes the intent visible here.
    emails: {
      notificationEmail: "tori@silverandsaltcapital.com",
      replyTo: "tori@silverandsaltcapital.com",
    },
    // No seeded tiers in production. Live tiers and their immutable live
    // Stripe Prices arrive only through a signed Built Not Found signup
    // revision, so a test Price can never be materialized on the prod tenant
    // by this file.
    tiers: [],
  },
};

export function chapterFor(envName = "dev") {
  const e = ENVIRONMENTS[envName];
  if (!e) throw new Error(`no chapter configuration for environment ${String(envName)}`);
  return defineChapter({
  id: "silver-and-salt-capital",
  name: "Silver & Salt Capital",
  url: e.url,

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

  // Follower-owned operational delegation. BNF super admins may manage these
  // profile fields and application actions; login identity, privilege, billing
  // internals, and follower-private activity are not generic editable fields.
  network: {
    readers: [{
      id: "built-not-found",
      // Readable projection. `lastCallAt` and `callCount` (Tori, 2026-09-24)
      // give Built Not Found relationship temperature across chapters: who is
      // warm, who has gone quiet, how engaged a chapter is. They are counters
      // and a timestamp, never content. Call summaries, action items, and
      // meeting titles stay follower-private in the activity feed, which the
      // NetworkRecord projection does not carry at all. Deliberately absent
      // from `editableFields` below: the parent reads this, never writes it,
      // because only this chapter's ingest knows when a call happened.
      // `secondaryEmail` rides with `email`: it is the same class of profile
      // data, and showing the parent one of someone's two addresses but not
      // the other would be more confusing than useful. Remove it here if that
      // judgement is wrong; nothing else depends on it.
      fields: { person: ["name", "email", "secondaryEmail", "firstName", "lastName", "phone", "state", "whoYouAre", "referral", "referralName", "linkedin", "focus", "message", "lastCallAt", "callCount"] },
      sharedNotes: ["person"],
      // BNF delegates operator intent; this chapter remains profile and
      // application authority. Login identity and privilege are not fields.
      editableFields: { person: ["name", "firstName", "lastName", "phone", "state", "whoYouAre", "referral", "referralName", "linkedin", "focus", "message"] },
      stageTransitions: ["person"],
      admissionGrants: true,
      // This is a separate, read-only lane: the signed response contains only
      // partition-bound keyed digests plus lifecycle status/cancellation.
      // Raw application, customer, and subscription identifiers never cross.
      commercialParity: true,
    }],
  },

  // Built Not Found may publish complete, signed signup revisions to this
  // follower. Development accepts test-mode Stripe objects only; production
  // accepts live-mode objects addressed to the live runtime. A document in the
  // wrong mode is refused (wrong_stripe_mode) before anything is stored.
  signupControl: {
    sourceId: "built-not-found",
    stripeMode: e.stripeMode,
    runtimeSecrets: e.runtimeSecrets,
  },

  // Preserve the populated dev content namespaces discovered by the strict
  // schema gate. Chapter admins retain their local layer; Built Not Found may
  // deliver a separate signed parent layer without replacing local pages.
  memberContent: {
    localAuthoring: true,
    parent: { sourceId: "built-not-found" },
  },

  // "o11y" (Chapter 0.52.0 adoption): the Worker is wrapped in
  // withObservability and hands Chapter's operator alerts (a quarantined
  // Stripe webhook, a network commercial exception) to @odla-ai/o11y through
  // src/chapter-alerts.ts. Provisioning mints the ingest token for this
  // service; until a Worker carries it, the alert is still one structured
  // console.error line in Workers Logs (src/chapter-alerts.ts keeps that).
  services: ["db", "calendar", "o11y"],

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

  // Seeded tiers per environment (see ENVIRONMENTS). Additional tiers arrive
  // through a signed BNF signup-control revision with their own reviewed
  // Stripe Prices; seeds insert only when absent.
  tiers: e.tiers,

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
  // Addressing per environment (see ENVIRONMENTS). Template BODIES live on
  // the group row and are owner-editable at runtime; this config only
  // carries addressing.
  // fromName (bug 5a50304f, Chapter 0.52.0): the From header reads
  // "Tori Horton <tori@silverandsaltcapital.com>" while the address stays the
  // Worker's EMAIL_FROM. Seeded with the row on a fresh tenant; both existing
  // rows get it once from _scripts/set-sender-name.mjs, and it stays
  // owner-editable in Settings → Email.
  emails: { ...e.emails, fromName: "Tori Horton", events: SIGNUP_EMAIL_EVENTS },

  // WHEN each lifecycle email fires (build-time), as opposed to its content.
  // Owner decision 2026-09-19 (signup-path audit): Chapter's adminNotification
  // is OFF. "submit" reached Tori for people who then abandoned checkout, and
  // "payment" never mentioned a free Associate at all. Both moments stay
  // visible on the admin People list. The notices Tori does want are host
  // jobs in src/signup-paths.ts: callBookedAdmin when a call is booked, and
  // paidApprovedAdmin when a waived member pays and is approved. Stripe still
  // announces every successful charge on its own.
  sends: {
    adminNotification: "never",
  },

  // ── Scheduling ───────────────────────────────────────────────────────
  // Seed only; the live row's schedulingJson is the authority and is
  // owner-editable. The call is 30 minutes (Tori, 2026-09-20; set on both
  // rows by _scripts/set-slot-minutes.mjs).
  scheduling: {
    slotMinutes: 30,
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
    // Tori, 2026-09-20: the application also asks for a preferred name, a
    // confirmed email (browser-side only, never stored), a required LinkedIn
    // profile, the free-text answer behind "Other" / "Something else", and the
    // full US mailing address. New columns stay schema-optional (existing rows
    // have none of them) and are made required at submit through `conditions`,
    // which Chapter enforces server-side and reports in the field contract.
    required: ["firstName", "lastName", "email", "referral", "whoYouAre", "message"],
    optional: [
      "preferredName", "referralName", "referralOther", "whoYouAreOther", "linkedin", "phone",
      "address1", "address2", "city", "state", "postalCode", "country",
      // The gift seat (Tori, 2026-09-20): asked on the application for the
      // paid tiers; the seat itself is charged through the membership
      // authority (the member area today), never on the booking step.
      "giftSeatInterest", "giftSeatRecipientName", "giftSeatRecipientEmail",
      // "I'm applying without a LinkedIn profile" (Tori, 2026-09-20): the
      // rare applicant with no profile opts out, and the opt-out is recorded.
      "linkedinOptOut",
    ],
    conditions: {
      giftSeatRecipientName: { visibleWhen: 'values.giftSeatInterest == "yes"' },
      giftSeatRecipientEmail: { visibleWhen: 'values.giftSeatInterest == "yes"' },
      linkedin: { requiredWhen: 'values.linkedinOptOut != "yes"' },
      address1: { requiredWhen: "true" },
      city: { requiredWhen: "true" },
      state: { requiredWhen: "true" },
      postalCode: { requiredWhen: "true" },
      referralOther: { visibleWhen: 'values.referral == "other"', requiredWhen: 'values.referral == "other"' },
      whoYouAreOther: { visibleWhen: 'values.whoYouAre == "Something else"', requiredWhen: 'values.whoYouAre == "Something else"' },
    },
    maxLen: {
      firstName: 200,
      lastName: 200,
      preferredName: 200,
      email: 320,
      referral: 100,
      referralName: 200,
      referralOther: 200,
      whoYouAre: 100,
      whoYouAreOther: 200,
      linkedin: 500,
      message: 5000,
      phone: 40,
      address1: 200,
      address2: 200,
      city: 120,
      state: 60,
      postalCode: 20,
      country: 60,
      giftSeatInterest: 10,
      giftSeatRecipientName: 160,
      giftSeatRecipientEmail: 254,
      linkedinOptOut: 10,
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
    crmFields: [
      "preferredName", "state", "whoYouAre", "whoYouAreOther", "referral", "referralName", "referralOther",
      "linkedin", "focus", "message", "address1", "address2", "city", "postalCode", "country",
      "giftSeatInterest", "giftSeatRecipientName", "giftSeatRecipientEmail", "linkedinOptOut",
    ],
  },

  // ── Auth ─────────────────────────────────────────────────────────────
  // Backend-only Clerk roles; stale browser claims cannot authorize requests.
  // Privileged grants come only from protected odla users, bound by Clerk id.
  // Dev cutover requires private-role migration and existing Studio grants.
  auth: {
    source: "clerk",
    ladder: ["provisional", "member", "admin"],
    superAdmins: true,
    superAdminSource: "odla",
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
}

// The CLI (provision, config diff, seeds) and the tests read this default.
// Provisioning production must run with ODLA_ENV=prod so the composed seeds
// carry the production addressing and no test-mode tier.
const cliEnv = typeof process !== "undefined" && process.env?.ODLA_ENV === "prod" ? "prod" : "dev";
export const chapter = chapterFor(cliEnv);

export default chapter;
