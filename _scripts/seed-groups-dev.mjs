// Seed (or update) the Silver & Salt Capital group row in the DEV tenant.
// Idempotent: keyed by the entity id, safe to re-run after edits.
// Usage: node _scripts/seed-groups-dev.mjs
// Copy comes from onboarding-scope.html (Tori's brief); legal texts are
// counsel-pending per PAYMENT-SPEC.md. Prices are cents.
import { initAdmin, tx } from "@odla-ai/db";
import { readFileSync } from "node:fs";

const GROUP_ID = "silver-and-salt-capital";

const c = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const db = initAdmin({
  appId: "silver-and-salt-capital--dev",
  adminToken: c.envs.dev.dbKey,
  endpoint: "https://db.odla.ai",
});

const disclaimerText =
  "Membership provides access to education, networking, and community benefits. " +
  "Membership does not guarantee access to private investment opportunities, nor does it " +
  "constitute an offer to sell or a solicitation of an offer to buy any securities.";

const refundPolicyText =
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
  "non-refundable.";

const trustCopy =
  "Founding-member rate: $900 for your first year (standard membership $1,000/year, less a " +
  "$100 founding-member discount). Your card is charged $900.00 today to hold your " +
  "founding-member place. Membership renews automatically each year at your locked-in " +
  "founding-member rate of $900 for as long as you remain a member, and you can cancel anytime " +
  "before a renewal. After our conversation, if we decide membership is not the right fit, " +
  "your $900 is refunded in full and your membership is canceled.";

const emailTemplates = {
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
};

await db.transact(
  tx.groups[GROUP_ID].update({
    id: GROUP_ID,
    name: "Silver & Salt Capital",
    standardPriceCents: 100000,
    foundingDiscountCents: 10000,
    // stripePriceId / stripePublishableKey are set by _scripts/setup-stripe-dev.mjs
    notificationEmail: "cory.ondrejka+debug@gmail.com", // dev tenant; prod row uses tori@silverandsaltcapital.com
    replyTo: "cory.ondrejka+debug@gmail.com",
    debugEmail: "cory.ondrejka+debug@gmail.com",
    calendarLink:
      "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1_9O59IJaGAZWnM6duwcPuqluoIu3ui_NMCu5iRHiJT_CRC9xjcoKWwMSG_9Zaxz1kQAMRU4A0?gv=true",
    disclaimerText,
    refundPolicyText,
    trustCopy,
    commitmentText: "(Community commitment: owner-supplied copy pending.)",
    normsText: "(Group norms: owner-supplied copy pending.)",
    emailTemplates,
    // First-party scheduling rules (20 minute calls per Tori 2026-08-07,
    // Pacific time).
    schedulingJson: {
      slotMinutes: 20,
      days: [1, 2, 3, 4, 5],
      startHour: 9,
      endHour: 17,
      timezone: "America/Los_Angeles",
      minNoticeHours: 24,
      windowDays: 14,
      summaryTemplate: "Silver & Salt Capital: introduction call with {{firstName}} {{lastName}}",
    },
    createdAt: Date.now(),
  }),
);

const { groups } = await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } });
console.log("group row:", groups[0].name, "| price cents:", groups[0].standardPriceCents, "- discount:", groups[0].foundingDiscountCents);
