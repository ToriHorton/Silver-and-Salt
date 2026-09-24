// Silver & Salt Capital CRM definition (@odla-ai/crm).
//
// This is the ADMIN relationship layer, adopted as a HYBRID over the existing
// operational system. The load-bearing flows stay exactly where they are:
//   - join.html -> POST /api/applications writes the `applications` row
//   - Stripe webhooks / booking / approve / refund write `applications.status`
//   - `meetings` is the source of truth for intro calls; Clerk holds the role
// `applications.status` remains the AUTHORITATIVE pipeline. A one-way sync
// (src/crm-sync.mjs) projects each person into a `crm_record` of type
// `person`; `crm_record.stage` MIRRORS `applications.status` and is never the
// source of truth. What the CRM owns outright is the additive relationship
// data with no operational equivalent today: tags, notes, follow-up tasks,
// saved views, contact-consent, and audited ad-hoc / template email.
//
// This module is pure config (no I/O): defineCrm() validates it at import and
// throws on slot collisions, bad pipeline edges, or dangling name/email refs.
// It is imported by BOTH the worker (src/worker.ts, to mount the routes) and
// odla.config.mjs (to build the provisioning integration), so it must stay
// ESM with no runtime dependencies beyond @odla-ai/crm.

import { defineCrm } from "@odla-ai/crm";

export const CRM_BASE_PATH = "/api/crm";

// The person record type. Fields mirror the join form / `applications` row so
// the record panel shows the whole applicant. A few are promoted to indexed
// slot columns so the list can sort/filter on them server-side.
export const crm = defineCrm({
  types: {
    person: {
      label: "Person",
      labelPlural: "People",
      nameField: "name",
      emailField: "email",
      fields: {
        name: { type: "string", label: "Name", required: true },
        email: { type: "email", label: "Email" },
        firstName: { type: "string", label: "First name" },
        lastName: { type: "string", label: "Last name" },
        preferredName: { type: "string", label: "Preferred name" },
        phone: { type: "string", label: "Phone" },
        // The US mailing address, asked on the application (Tori, 2026-09-20).
        address1: { type: "string", label: "Address line 1", search: false },
        address2: { type: "string", label: "Address line 2", search: false },
        city: { type: "string", label: "City" },
        postalCode: { type: "string", label: "ZIP", search: false },
        country: { type: "string", label: "Country", search: false },
        // The free-text answers behind "Other" and "Something else".
        referralOther: { type: "string", label: "How they found us (other)" },
        whoYouAreOther: { type: "string", label: "Who they are (other)" },
        // The gift-seat upsell answer from the application (Tori, 2026-09-20).
        giftSeatInterest: { type: "string", label: "Wants a gift seat" },
        giftSeatRecipientName: { type: "string", label: "Gift for (name)" },
        giftSeatRecipientEmail: { type: "string", label: "Gift for (email)" },
        // Promoted so the list can sort/filter by location and cohort.
        state: { type: "string", label: "State", slot: "s1" },
        whoYouAre: { type: "string", label: "Who they are", slot: "s2" },
        referral: { type: "string", label: "Referral source", slot: "s3" },
        referralName: { type: "string", label: "Referred by" },
        // Plain string, not `url`: applicants often paste a bare
        // "linkedin.com/in/…" with no scheme, which url-validation would
        // reject and fail the whole person sync. Store it verbatim.
        linkedin: { type: "string", label: "LinkedIn" },
        linkedinOptOut: { type: "string", label: "Applied without LinkedIn" },
        focus: { type: "json", label: "Focus areas" },
        message: { type: "string", label: "Intro message" },
        // The operational applications.id this person was last synced from, so
        // the admin UI can drive lifecycle actions through the existing
        // /api/admin/applications/:id routes.
        applicationId: { type: "string", label: "Application id", search: false },
        // "associate" | "founding" | "steward" (JOURNEYS-PLAN.md decision
        // 2). Promoted to a slot so the rail and views can filter by tier.
        tier: { type: "string", label: "Tier", slot: "s4" },
        // ── Relationship temperature (Tori, 2026-09-24) ──────────────────
        // Maintained by the call ingest (src/crm-ingest.mjs) and by nothing
        // else. These are the ONLY call-derived values that cross to Built
        // Not Found: they are in the `network.readers` allowlist below, while
        // the call bodies stay follower-private in the activity feed.
        //
        // Both are append-only facts the ingest fully owns, so neither can go
        // stale. A count of open follow-ups was deliberately left out: tasks
        // are completed in the admin UI, which the ingest never sees, so that
        // number would drift and quietly lie. Open follow-ups are read from
        // `listTasks` instead, where they are always current.
        //
        // Promoted to slots so the list can sort on them: "who have we not
        // spoken to since June" is the question this is for.
        lastCallAt: { type: "date", label: "Last call", slot: "d1" },
        callCount: { type: "number", label: "Calls logged", slot: "n1" },
      },
      // Mirrors the applications.status pipeline (STATUSES in src/worker.ts /
      // STATUS_LABELS in src/app/lib.js). Declaration order sets stageIndex
      // (the sortable pipeline position). Deliberately NO `transitions` map and
      // NO terminal stages: the sync must be free to set whatever status the
      // authoritative operational flow just wrote, without a transition
      // refusal. Real lifecycle side effects (Clerk promotion, refunds,
      // emails) run in the worker's own routes, never in a CRM stage hook.
      pipeline: {
        stages: [
          // Pre-application stages: people the chapter is courting or has invited,
          // managed by chapter admins before any application exists.
          { id: "candidate", label: "Candidate" },
          { id: "invited", label: "Invited" },
          { id: "submitted", label: "Submitted" },
          { id: "paid_pending_vetting", label: "Paid, pending vetting" },
          { id: "call_scheduled", label: "Call scheduled" },
          { id: "interviewed", label: "Interviewed" },
          { id: "approved", label: "Approved" },
          { id: "declined", label: "Declined" },
          { id: "refunded", label: "Refunded" },
        ],
      },
      // identity: Clerk $users linkage (linkIdentity by email).
      // billing:  the paid/renewal/subscription snapshot columns, populated
      //           one-way by the sync (src/crm-sync.mjs) from the application.
      // email:    the primary contact channel + consent state machine.
      // rank:     manual drag-order for the admin's own triage.
      facets: { identity: true, billing: true, email: true, rank: "manual" },
    },
  },
  // Template CLASS is code (here), not owner-editable data: an owner editing
  // the copy in Settings can never reclassify a marketing blast as
  // transactional to slip past the consent gate.
  //
  // These are the ADMIN relationship templates and are kept deliberately
  // separate from the four operational lifecycle templates in
  // groups.emailTemplates (adminNotification / paymentConfirmation / prepEmail
  // / onboardingInvite). Those keep firing from the worker's own flows; these
  // are for the admin composing to a member from the record panel.
  templates: {
    // Free-form 1:1 email. The composer types the subject and body; the stored
    // template is a pass-through of those vars. Transactional class: a direct,
    // personal message, so an unsubscribed contact still receives it.
    personal: {
      class: "transactional",
      vars: ["firstName", "subject", "body"],
      defaults: { subject: "{{subject}}", text: "{{body}}" },
    },
    // Free-form broadcast. Marketing class: consent-gated (unsubscribed and
    // suppressed contacts are skipped) and the send gets an unsubscribe link
    // plus RFC 8058 one-click headers automatically.
    announcement: {
      class: "marketing",
      vars: ["firstName", "subject", "body", "unsubscribeUrl"],
      defaults: { subject: "{{subject}}", text: "{{body}}\n\n{{unsubscribeUrl}}" },
    },
    // A reusable library template (owner-editable copy). A gentle check-in the
    // admin can send with one click; vars fill from the record.
    check_in: {
      class: "transactional",
      vars: ["firstName", "membersUrl"],
      defaults: {
        subject: "A note from Silver & Salt Capital",
        text:
          "Hi {{firstName}},\n\n" +
          "I wanted to check in and see how things are going, and answer any " +
          "questions you have about the community.\n\n" +
          "Your member area is always here: {{membersUrl}}\n\n" +
          "Warmly,\nSilver & Salt Capital",
      },
    },
  },
});

// The pipeline stage ids, in order. Exported so the sync and any server code
// can validate a status maps to a real stage before calling setStage.
export const PERSON_STAGES = crm.config.types.person.pipeline.stages.map((s) => s.id);
