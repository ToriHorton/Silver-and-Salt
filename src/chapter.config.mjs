// Silver & Salt Capital as a @odla-ai/chapter site.
//
// This one config replaces src/odla/schema.mjs, src/odla/rules.mjs, src/crm.mjs,
// and the `db` block in odla.config.mjs. `defineChapter()` validates at import,
// so a bad config throws at startup rather than at request time.
//
// Two rules govern what belongs here:
//   1. Build-time DECISIONS live in this file (pipeline shape, when email fires,
//      what approve does, brand identity, form validation).
//   2. Owner-editable OPERATIONAL values (prices, policy copy, email bodies,
//      scheduling rules) are seeded from here into the odla-db `groups` row and
//      are authoritative there afterward. Editing them in the admin console
//      wins; re-provisioning does not clobber owner edits.
//
// Verified 2026-07-24: `chapter.schema` is byte-identical to the schema this
// site ran before the conversion (test/schema-parity.test.mjs is the standing
// guard).

import { defineChapter } from "@odla-ai/chapter";

export const chapter = defineChapter({
  id: "silver-and-salt-capital",
  name: "Silver & Salt Capital",
  mode: "chapter",

  // ── Identity ──────────────────────────────────────────────────────────────
  // The app surfaces (join, member area, admin console) use the lime-on-moss
  // system, not the marketing site's rust accent. `salt` is this brand's own
  // @odla-ai/ui theme and ships a `lime` accent family; `tokens` then pins the
  // exact values the pages already carry so nothing shifts under the swap.
  brand: {
    theme: "salt",
    accent: "lime",
    colorScheme: "light",
    // The wordmark's ampersand must render upright in Cormorant Garamond, so
    // the brand-amp markup is supplied by a render slot, never by copy text.
    wordmark: "Silver & Salt Capital",
    badge: "S&S",
    tagline: "Regenerative capital for women-led companies.",
    fonts: {
      display: "'Cormorant Garamond', Georgia, serif",
      body: "'Satoshi', 'Helvetica Neue', Arial, sans-serif",
      // Digits 0-9 render in Cormorant Infant. Garamond's "1" is an unflagged
      // stem that misreads as I/l, so the brand overrides numerals everywhere
      // (CLAUDE.md brand rule 6; styles.css section 0).
      numeral: "'Cormorant Infant', Georgia, serif",
    },
    tokens: {
      background: "#eef4ea",
      surface: "#ffffff",
      surface2: "#f4faf2",
      text: "#2F3E34",
      textMuted: "#7E8E84",
      textFaint: "#9aa79e",
      border: "#d6e8d2",
      borderStrong: "#b9cdb4",
      accent: "#7CB83F",
      accentStrong: "#6aa535",
      accentSoft: "rgba(124, 184, 63, 0.12)",
      onAccent: "#ffffff",
      danger: "#a4442c",
      // The brand has ONE green. odla-ui defaults to accent-blue plus a
      // separate good-green, which reads as a deliberate signal here; pinning
      // both to lime keeps a positive number from looking like a second state.
      good: "#6aa535",
      chartPositive: "#7CB83F",
      // The console's own max width, inside admin/index.html's .container.
      // Chapter defaults to 1120px, which squeezes the People master/detail.
      contentWidth: "1440px",
      // Master rail wide enough for a name and stage without wrapping, with
      // the record detail taking the rest.
      masterDetailColumns: "minmax(320px, 380px) 1fr",
      panelRadius: "8px",
      panelShadow: "0 8px 24px rgba(47, 62, 52, 0.12)",
    },
    palette: {
      cream: "#FBF8F2",
      moss: "#2F3E34",
      "moss-light": "#4A5E50",
      sage: "#7E8E84",
      lime: "#7CB83F",
      "lime-dark": "#6aa535",
      "lime-soft": "rgba(124, 184, 63, 0.12)",
      border: "#d6e8d2",
      bg: "#eef4ea",
    },
  },

  // ── Pipeline ──────────────────────────────────────────────────────────────
  // The seven statuses this site has run since the payment flow shipped. Order
  // sets the sortable stage index. Status never moves backwards (chapter
  // enforces it), so admin progression always wins over a late webhook.
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
    // A call can be booked before payment (the form allows booking from a fresh
    // submit) and rebooked after one exists.
    bookableFrom: ["submitted", "paid_pending_vetting", "call_scheduled"],
    // Approval requires that money has arrived or a conversation has happened.
    approvableFrom: ["paid_pending_vetting", "call_scheduled", "interviewed"],
  },

  // ── Join form ─────────────────────────────────────────────────────────────
  application: {
    required: ["firstName", "lastName", "email", "referral", "whoYouAre", "message"],
    optional: ["referralName", "linkedin", "phone", "state", "focus"],
    maxLen: { message: 2000, whoYouAre: 400 },
    // Consent is a compliance gate: a submit with no acknowledgement is a 400
    // rather than a row with no consent record.
    requireDisclaimerAck: true,
    // Clerk public_metadata.profile is CLIENT-READABLE. This is the curated set
    // the member area may read back; the rest of the application stays db-only.
    profileFields: ["phone", "state", "whoYouAre", "focus", "linkedin"],
    // Carried into the CRM person projection. Each must be declared on the
    // person type below or defineChapter() throws.
    crmFields: ["state", "whoYouAre", "referral", "referralName", "linkedin", "focus", "message"],
  },

  // ── Money ─────────────────────────────────────────────────────────────────
  // Seeds the group row; the owner edits prices in the console afterward.
  prices: {
    standardCents: 100000,
    foundingDiscountCents: 10000,
    currency: "usd",
    interval: "year",
  },

  // ── Member-facing policy copy ─────────────────────────────────────────────
  // Legal texts are counsel-pending; these are the strings the site ships today.
  policy: {
    disclaimerText:
      "Membership provides access to education, networking, and community benefits. " +
      "Membership does not guarantee access to private investment opportunities, nor does it " +
      "constitute an offer to sell or a solicitation of an offer to buy any securities.",
    refundPolicyText:
      "Founding-Member Pricing & Refund Policy. Your $900 founding-member fee covers your first " +
      "year and is charged when you submit your application, before your introductory conversation " +
      "with Silver & Salt Capital. Membership is annual and renews automatically each year unless " +
      "you cancel before the renewal date. Your founding-member rate of $900 per year is locked in: " +
      "it stays your annual price for as long as your membership remains continuously active " +
      "(standard membership is $1,000 per year). If, after that conversation, Silver & Salt Capital " +
      "determines that membership is not a mutual fit, your full $900 is refunded to your original " +
      "payment method and your membership is canceled. Refunds are issued within five business days " +
      "of that decision and typically appear on your statement within five to ten business days, " +
      "depending on your bank. Every application is reviewed and resolved within 30 days. Once your " +
      "membership is approved and active, the fee for the current year covers that year and is " +
      "non-refundable.",
    trustCopy:
      "Founding-member rate: $900 for your first year (standard membership $1,000/year, less a " +
      "$100 founding-member discount). Your card is charged $900.00 today to hold your " +
      "founding-member place. Membership renews automatically each year at your locked-in " +
      "founding-member rate of $900 for as long as you remain a member, and you can cancel anytime " +
      "before a renewal. After our conversation, if we decide membership is not the right fit, " +
      "your $900 is refunded in full and your membership is canceled.",
    commitmentText: "(Community commitment: owner-supplied copy pending.)",
    normsText: "(Group norms: owner-supplied copy pending.)",
  },

  // ── Email ─────────────────────────────────────────────────────────────────
  // Addresses and bodies seed the group row and are owner-editable in Settings.
  // The dev tenant points every address at the debug inbox; sends outside prod
  // redirect there regardless, with a "[dev]" subject prefix.
  emails: {
    notificationEmail: "cory.ondrejka+debug@gmail.com",
    replyTo: "cory.ondrejka+debug@gmail.com",
    debugEmail: "cory.ondrejka+debug@gmail.com",
    templates: {
      adminNotification: {
        subject: "New paid application: {{firstName}} {{lastName}}",
        text:
          "A new membership application has been paid and is awaiting vetting.\n\n" +
          "Name: {{firstName}} {{lastName}}\nEmail: {{email}}\nPhone: {{phone}}\nState: {{state}}\n\n" +
          "Review it in the admin console: {{adminUrl}}",
      },
      paymentConfirmation: {
        subject: "Your founding membership payment is received",
        text:
          "Dear {{firstName}},\n\n" +
          "Thank you. Your founding-member payment of $900 has been received, and your application " +
          "is with us for review. Your introduction call is the next step; your member area shows " +
          "your application status and call details at {{membersUrl}}.\n\n" +
          "{{refundPolicyText}}\n\n" +
          "Warmly,\nSilver & Salt Capital",
      },
      prepEmail: {
        subject: "Before your Silver & Salt Capital conversation",
        text:
          "Dear {{firstName}},\n\n" +
          "We look forward to meeting you. Ahead of your introduction call, here is the community " +
          "commitment every member agrees to, and the norms our community keeps:\n\n" +
          "{{commitmentText}}\n\n{{normsText}}\n\n" +
          "Your conversation will include your agreement to the community commitment.\n\n" +
          "Warmly,\nSilver & Salt Capital",
      },
      onboardingInvite: {
        subject: "Welcome to Silver & Salt Capital",
        text:
          "Dear {{firstName}},\n\n" +
          "Welcome. Your membership is approved, and we are delighted to have you.\n\n" +
          "Your member area is ready at {{membersUrl}}. Sign in with this email address to find " +
          "your training material and upcoming events.\n\n" +
          "Warmly,\nSilver & Salt Capital",
      },
    },
  },

  // WHEN lifecycle mail fires. This site notifies the admin on the first
  // successful payment, NOT on submit: an unpaid application generates no admin
  // email, and the console lists everything anyway. Chapter's default is
  // "submit", so leaving this out would silently start mailing on every submit.
  sends: { adminNotification: "payment" },

  // ── Scheduling ────────────────────────────────────────────────────────────
  // 45 minute introduction calls, Pacific business hours, 24 hours notice, two
  // week booking window. Seeds the group row; owner-editable in Settings.
  scheduling: {
    slotMinutes: 45,
    days: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 17,
    timezone: "America/Los_Angeles",
    minNoticeHours: 24,
    windowDays: 14,
    summaryTemplate: "Silver & Salt Capital: introduction call with {{firstName}} {{lastName}}",
  },

  // ── Accounts and roles ────────────────────────────────────────────────────
  // The Clerk account is created server-side at submit, so step 3 of the join
  // flow can tell the applicant their member area is ready. Needs the
  // clerk_secret_key vault secret; without it account creation quietly no-ops.
  account: "create",
  // provisional -> member -> admin, with the read-only superAdmins tier above.
  // Defaults already match; declared so the ladder is visible at the call site.
  auth: {
    source: "claim",
    claim: "role",
    ladder: ["provisional", "member", "admin"],
    superAdmins: true,
  },

  // ── Admin operations ──────────────────────────────────────────────────────
  operations: {
    onApprove: { promoteTo: "member", send: "onboardingInvite" },
    refund: {
      // An approved membership's current year is non-refundable (refund policy
      // above), so approve and refund are mutually exclusive end states.
      allowedFrom: ["paid_pending_vetting", "call_scheduled", "interviewed"],
      cancelSubscription: true,
    },
  },

  // ── CRM ───────────────────────────────────────────────────────────────────
  // One `person` type mirroring the join form, so the record panel shows the
  // whole applicant. Stage mirrors applications.status; chapter routes stage
  // moves through the operational approve/refund endpoints, never a raw write.
  crm: {
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
          phone: { type: "string", label: "Phone" },
          // Promoted to indexed slots so the list sorts and filters
          // server-side by location and cohort.
          state: { type: "string", label: "State", slot: "s1" },
          whoYouAre: { type: "string", label: "Who they are", slot: "s2" },
          referral: { type: "string", label: "Referral source", slot: "s3" },
          referralName: { type: "string", label: "Referred by" },
          // Plain string, not `url`: applicants paste bare "linkedin.com/in/…"
          // with no scheme, and url validation would reject it and fail the
          // whole person sync. Store it verbatim.
          linkedin: { type: "string", label: "LinkedIn" },
          focus: { type: "json", label: "Focus areas" },
          message: { type: "string", label: "Intro message" },
          applicationId: { type: "string", label: "Application id", search: false },
        },
        pipeline: {
          stages: [
            { id: "submitted", label: "Submitted" },
            { id: "paid_pending_vetting", label: "Paid, pending vetting" },
            { id: "call_scheduled", label: "Call scheduled" },
            { id: "interviewed", label: "Interviewed" },
            { id: "approved", label: "Approved" },
            { id: "declined", label: "Declined" },
            { id: "refunded", label: "Refunded" },
          ],
        },
        // identity: Clerk $users linkage. billing: the paid/renewal snapshot.
        // email: contact channel + consent state machine. rank: manual triage
        // order for the admin.
        facets: { identity: true, billing: true, email: true, rank: "manual" },
      },
    },
    // Template CLASS is code, never owner-editable data: an owner editing copy
    // in Settings can never reclassify a marketing blast as transactional to
    // slip past the consent gate. These are the admin's relationship templates,
    // kept separate from the four operational lifecycle templates above.
    templates: {
      personal: {
        class: "transactional",
        vars: ["firstName", "subject", "body"],
        defaults: { subject: "{{subject}}", text: "{{body}}" },
      },
      announcement: {
        class: "marketing",
        vars: ["firstName", "subject", "body", "unsubscribeUrl"],
        defaults: { subject: "{{subject}}", text: "{{body}}\n\n{{unsubscribeUrl}}" },
      },
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
  },

  // ── Voice ─────────────────────────────────────────────────────────────────
  // Chapter's packaged surfaces read this contract, so the site keeps its own
  // language without forking behavior. Approachable and premium, declarative,
  // no em dashes or en dashes (CLAUDE.md brand rule 4).
  copy: {
    join: {
      form: {
        submit: "Submit application",
        submitting: "Submitting...",
        submitFailed: "That did not go through. Please try again.",
        unexpectedFailure: "Something went wrong on our end. Please try again in a moment.",
      },
      booking: {
        book: "Confirm this time",
        booking: "Confirming...",
        loading: "Finding available times...",
        unavailable: "No times are open right now. We will reach out to schedule.",
        slotTaken: "That time was just taken. Here are the current openings.",
        loadFailed: "We could not load available times. Please try again.",
        failed: "That booking did not go through. Please choose another time.",
      },
      payment: {
        payAndContinue: "Pay $900 and continue",
        preparing: "Preparing secure payment...",
        processing: "Processing...",
        pending: "Confirming your payment...",
        incomplete: "Your payment needs one more step. Please follow the prompt above.",
        setupFailed: "We could not start the payment. Please try again.",
      },
      done: {
        label: "You are all set",
        calendarInvite: "A calendar invitation is on its way to your inbox.",
        memberArea: "Sign in to your member area",
      },
    },
    members: {
      account: { signOut: "Sign out", adminConsole: "Admin console" },
      provisional: {
        cardLabel: "Your membership",
        applicationNeeded: "Begin your application",
        applicationNeededBody:
          "A few questions, followed by a brief conversation.",
        apply: "Start your application",
        bookCall: "Choose a time",
        bookCallBody:
          "The next step is a 45 minute introduction call.",
        chooseTime: "Choose a time",
        introductionCall: "Your introduction call",
        joinCall: "Join the video call",
        calendarInvite: "The calendar invitation is in your inbox.",
        renews: "Renews",
        refunded: "Membership canceled",
        refundedBody:
          "Your founding-member fee has been refunded in full.",
      },
      full: { welcome: "Welcome back" },
      reschedule: {
        changeTime: "Change your time",
        keepTime: "Keep my current time",
        rescheduling: "Moving your call...",
        loading: "Finding available times...",
        noTimes: "No other times are open right now.",
        slotGone: "That time was just taken. Here are the current openings.",
      },
    },
    admin: {
      shell: { adminConsole: "Silver & Salt Capital" },
      workspaces: {
        dashboard: "Dashboard",
        people: "People",
        settings: "Settings",
        overview: "Overview",
        billing: "Billing",
        calendar: "Calendar",
        email: "Email",
      },
      auth: {
        signInTagline: "Internal",
        notAuthorized: "This account does not have console access.",
      },
      // Chapter's defaults render these ranges with en dashes, which brand
      // rule 4 prohibits. Everything else in this block is the package default.
      availability: {
        startHour: "Start hour (0 to 24)",
        endHour: "End hour (0 to 24)",
      },
    },
  },

  // db is implied. calendar powers the booking proxy. o11y stays off until the
  // owner opts in (adding it here makes smoke's config-vs-platform check fail
  // until provision mints the ingest token).
  services: ["db", "calendar"],
});

export default chapter;
