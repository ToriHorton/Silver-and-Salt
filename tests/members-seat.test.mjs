// The member area: the named seat card and the admin console link
// (src/app/members.jsx). Rendered to strings; no browser.
import { describe, expect, it } from "vitest";
import { h } from "preact";
import { render } from "preact-render-to-string";
import { GiftReview, MembersApp, NamedSeatCard, giftStatusWords } from "../src/app/members.jsx";

const offer = { eligible: true, amountCents: 50000, currency: "usd", termEndsAt: Date.UTC(2028, 0, 1), autoRenew: true, digest: "d".repeat(64), membershipId: "membership_x", refundPolicyText: "Refunds.", merchantDisclosureText: "Billed by Built Not Found Capital." };
const api = async () => { throw new Error("not called in a string render"); };

describe("NamedSeatCard", () => {
  it("offers the gift with price and end date when eligible", () => {
    const html = render(h(NamedSeatCard, { api, initial: offer }));
    expect(html).toContain("A gift for your mother or daughter");
    expect(html).toContain("mothers and daughters to talk about money");
    expect(html).toContain("$500.00 a year");
    expect(html).toContain("active for the full year alongside yours and renews with it");
    expect(html).toContain("Your gift is final");
    expect(html).toContain("Review the gift");
    // Family only, no deadline, no refund clock (Tori, 2026-09-19).
    expect(html).not.toContain("friend");
    expect(html).not.toContain("January 1, 2028");
    expect(html).not.toContain("30 days");
    expect(html).not.toContain("through");
  });
  it("shows the purchased seat and its status instead of the form", () => {
    const html = render(h(NamedSeatCard, { api, initial: { ...offer, eligible: false, seat: { recipientName: "Ada Lovelace", recipientEmail: "ada@example.com", status: "awaiting_acceptance" } } }));
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("waiting for her to accept");
    expect(html).not.toContain("Review the gift");
  });
  it("reads as included when the server prices the gift at zero", () => {
    const html = render(h(NamedSeatCard, { api, initial: { ...offer, amountCents: 0 } }));
    expect(html).toContain("includes a membership for your mother or your daughter");
    expect(html).not.toContain("$0.00");
    expect(html).not.toContain("refunded");
  });
  it("points to Tori when the server says the gift is unavailable, without asserting a rule", () => {
    const html = render(h(NamedSeatCard, { api, initial: { ...offer, eligible: false } }));
    expect(html).toContain("tori@silverandsaltcapital.com");
    expect(html).not.toContain("three months");
    expect(html).not.toContain("Review the gift");
  });
});

describe("the gift after it is given (Chapter 0.54 recipientState)", () => {
  const seat = { seatId: "seat_x", recipientName: "Ada Lovelace", recipientEmail: "ada@example.com" };
  it("says who she named and whether that person accepted or joined", () => {
    expect(giftStatusWords({ ...seat, status: "pending_acceptance", recipientState: "invited" })).toBe("invited; waiting for her to accept");
    expect(giftStatusWords({ ...seat, status: "pending_approval", recipientState: "accepted", acceptedAt: Date.UTC(2026, 8, 21) })).toBe("accepted; her conversation with Tori is next (accepted September 21, 2026)");
    expect(giftStatusWords({ ...seat, status: "active", recipientState: "joined", joinedAt: Date.UTC(2026, 9, 2) })).toBe("a member since October 2, 2026");
    expect(giftStatusWords({ ...seat, status: "refunded", recipientState: "declined" })).toBe("declined the gift");
    expect(giftStatusWords({ ...seat, status: "payment_processing", recipientState: "payment_pending" })).toBe("your payment is being confirmed");
    // An older authority without recipientState still reads through the status map.
    expect(giftStatusWords({ ...seat, status: "awaiting_acceptance" })).toBe("waiting for her to accept");
    expect(giftStatusWords(undefined)).toBe("");
  });
  it("renders the joined member on the card instead of the form", () => {
    const html = render(h(NamedSeatCard, { api, initial: { ...offer, eligible: false, seat: { ...seat, status: "active", recipientState: "joined", joinedAt: Date.UTC(2026, 9, 2) } } }));
    expect(html).toContain("Ada Lovelace (ada@example.com): a member since October 2, 2026.");
    expect(html).not.toContain("Review the gift");
  });
});

describe("GiftReview", () => {
  const props = { api, name: "Ada Lovelace", email: "ada@example.com", terms: true, onTerms() {}, onChange() {}, onGiven() {}, onError() {} };
  it("gives an included seat with one button and no card form", () => {
    const html = render(h(GiftReview, { ...props, data: { ...offer, amountCents: 0, included: true } }));
    expect(html).toContain("Included with your membership.");
    expect(html).toContain("Give her the membership");
    expect(html).toContain("Her membership is included with mine");
    expect(html).not.toContain("compliance-policy");
    expect(html).not.toContain("$0.00");
  });
  it("takes a priced seat through the card form with the gift's own refund terms", () => {
    const html = render(h(GiftReview, { ...props, data: offer }));
    expect(html).toContain("$500.00 today.");
    expect(html).toContain("compliance-policy");
    expect(html).toContain("Gift memberships are final");
    expect(html).not.toContain("Give her the membership");
  });
  it("shows neither until the terms are accepted", () => {
    const html = render(h(GiftReview, { ...props, terms: false, data: { ...offer, amountCents: 0, included: true } }));
    expect(html).not.toContain("Give her the membership");
    expect(html).not.toContain("compliance-policy");
  });
});

describe("MembersApp", () => {
  const me = (extra) => ({ email: "m@example.com", role: "member", memberAccess: true, application: { paid: true, tier: "standard" }, namedSeatsEnabled: false, ...extra });
  it("shows the admin console to anyone the server authorizes, superadmins included", () => {
    expect(render(h(MembersApp, { me: me({ authorized: true }), email: "m@example.com" }))).toContain("Admin console");
    expect(render(h(MembersApp, { me: me({ authorized: true, role: "admin" }), email: "m@example.com" }))).toContain("Admin console");
    expect(render(h(MembersApp, { me: me({ authorized: false }), email: "m@example.com" }))).not.toContain("Admin console");
  });
  it("mounts the seat card only when the server enables seats", () => {
    expect(render(h(MembersApp, { me: me({ authorized: false, namedSeatsEnabled: true }), email: "m@example.com" }))).toContain("A gift for your mother or daughter");
    // A paid applicant who skipped the add-on can add it from the member page
    // before approval, while member-content access remains closed.
    const hadWindow = "window" in globalThis;
    const savedWindow = globalThis.window;
    globalThis.window = { SSCAuth: { fmtMeeting: () => "Tue, Sep 23, 11:15 AM MDT" } }; // ProvisionalCard reads it
    try {
      const provisional = render(h(MembersApp, { me: me({ role: "provisional", memberAccess: false, namedSeatsEnabled: true, application: { paid: true, tier: "standard", meetingAt: 1790183700000, timezone: "America/Denver" } }), email: "m@example.com" }));
      expect(provisional).toContain("Your onboarding call");
      expect(provisional).toContain("A gift for your mother or daughter");
    } finally {
      if (hadWindow) globalThis.window = savedWindow; else delete globalThis.window;
    }
    expect(render(h(MembersApp, { me: me({ authorized: false }), email: "m@example.com" }))).not.toContain("A gift for your mother or daughter");
  });
  it("offers a saved-profile restart to an inactive approved account instead of trusting a stale member role", () => {
    const html = render(h(MembersApp, { me: me({ memberAccess: false, membershipRestart: { eligible: true, applicationId: null },
      application: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", status: "refunded", paid: false } }), email: "ada@example.com" }));
    expect(html).toContain("Restart your membership");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("ada@example.com");
    expect(html).toContain("No new application or interview");
    expect(html).not.toContain("A gift for your mother or daughter");
  });
});
