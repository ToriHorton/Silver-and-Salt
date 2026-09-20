// The email copy the repo owns (_scripts/set-*.mjs) against the contract that
// renders it. Chapter substitutes {{name}} from stored data and renders an
// UNKNOWN placeholder as an empty string, which is exactly the defect the
// journey-map review found on 2026-09-17 (a prep email with two blanks). So
// every placeholder here must be one the send path fills for that template
// (@odla-ai/chapter 0.52.0 README, "Template variables"), and the copy must
// keep the brand rules the review file's parser enforces.
import { describe, expect, it } from "vitest";
import { PREP_EMAIL } from "../_scripts/set-prep-email.mjs";
import { SUBMIT_CONFIRMATION } from "../_scripts/set-submit-confirmation-email.mjs";
import { GIFT_ACCEPTED } from "../_scripts/set-gift-accepted-email.mjs";
import { FROM_NAME } from "../_scripts/set-sender-name.mjs";
import { chapter } from "../src/chapter.config.mjs";

const applicant = ["firstName", "lastName", "email", "phone", "state"];
const policy = ["refundPolicyText", "commitmentText", "normsText"];
const checkout = ["tier", "tierName", "paymentAmount", "paymentAmountSummary"];
const FILLED = {
  prepEmail: [...applicant, ...policy, ...checkout,
    "startAt", "endAt", "timezone", "meetUrl", "htmlLink", "meetingTime", "meetingLink"],
  submitConfirmation: [...applicant, ...policy, ...checkout, "submitNextStep", "adminUrl", "membersUrl"],
  seatAccepted: ["firstName", "recipientName", "tierName", "chapterName"],
};

const placeholders = (tpl) => [...`${tpl.subject}\n${tpl.text}`.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);

function brandRules(tpl) {
  const copy = `${tpl.subject}\n${tpl.text}`;
  // Brand standards: no em or en dash; the ampersand, never "and"; the full
  // name, never "Silver & Salt" alone.
  expect(copy).not.toMatch(/[–—]/);
  expect(copy).not.toMatch(/Silver and Salt/i);
  expect(copy.match(/Silver & Salt(?! Capital)/g)).toBeNull();
  expect(tpl.enabled).toBe(true);
}

describe("prepEmail (call prep, sent once at booking)", () => {
  it("uses only placeholders the booking send fills", () => {
    for (const name of placeholders(PREP_EMAIL)) expect(FILLED.prepEmail, name).toContain(name);
  });
  it("carries the booking, the tier and the frozen amount", () => {
    const used = placeholders(PREP_EMAIL);
    for (const name of ["firstName", "startAt", "meetUrl", "htmlLink", "tierName", "paymentAmountSummary", "commitmentText", "normsText"]) {
      expect(used, name).toContain(name);
    }
    // Blank-safe amount: booking is allowed from "submitted" and Associates
    // never pay, so the bare amount would leave an empty line.
    expect(used).not.toContain("paymentAmount");
  });
  it("keeps the brand rules", () => brandRules(PREP_EMAIL));
});

describe("submitConfirmation (the free Associate's receipt)", () => {
  it("uses only placeholders the submit send fills", () => {
    for (const name of placeholders(SUBMIT_CONFIRMATION)) expect(FILLED.submitConfirmation, name).toContain(name);
  });
  it("names the tier, the next step and the member area", () => {
    const used = placeholders(SUBMIT_CONFIRMATION);
    for (const name of ["firstName", "tierName", "submitNextStep", "membersUrl"]) expect(used, name).toContain(name);
    // No amount: a free Associate owes nothing, and a paid applicant is
    // confirmed by payment instead (paymentConfirmation stays enabled).
    expect(used).not.toContain("paymentAmount");
    expect(used).not.toContain("paymentAmountSummary");
  });
  it("keeps the brand rules", () => brandRules(SUBMIT_CONFIRMATION));
});

describe("seatAccepted (the giver's notice)", () => {
  it("uses only placeholders the acceptance send fills", () => {
    for (const name of placeholders(GIFT_ACCEPTED)) expect(FILLED.seatAccepted, name).toContain(name);
  });
  it("names the recipient and tier in the gift wording, never the packaged seat wording", () => {
    const used = placeholders(GIFT_ACCEPTED);
    for (const name of ["firstName", "recipientName", "tierName"]) expect(used, name).toContain(name);
    // Tori, 2026-09-19: the membership is a gift, and the invitation already
    // says so; "seat" and "invitation" are Chapter's words, not the site's.
    expect(`${GIFT_ACCEPTED.subject}\n${GIFT_ACCEPTED.text}`).not.toMatch(/\b(seat|invitation|purchased)\b/i);
  });
  it("keeps the brand rules", () => brandRules(GIFT_ACCEPTED));
});

describe("sender display name", () => {
  it("is the configured one, so the script and the Worker cannot disagree", () => {
    expect(FROM_NAME).toBe("Tori Horton");
    expect(FROM_NAME).toBe(chapter.config.emails.fromName);
  });
});
