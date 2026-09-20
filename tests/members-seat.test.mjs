// The member area: the named seat card and the admin console link
// (src/app/members.jsx). Rendered to strings; no browser.
import { describe, expect, it } from "vitest";
import { h } from "preact";
import { render } from "preact-render-to-string";
import { MembersApp, NamedSeatCard } from "../src/app/members.jsx";

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

describe("MembersApp", () => {
  const me = (extra) => ({ email: "m@example.com", role: "member", memberAccess: true, application: { paid: true, tier: "standard" }, namedSeatsEnabled: false, ...extra });
  it("shows the admin console to anyone the server authorizes, superadmins included", () => {
    expect(render(h(MembersApp, { me: me({ authorized: true }), email: "m@example.com" }))).toContain("Admin console");
    expect(render(h(MembersApp, { me: me({ authorized: true, role: "admin" }), email: "m@example.com" }))).toContain("Admin console");
    expect(render(h(MembersApp, { me: me({ authorized: false }), email: "m@example.com" }))).not.toContain("Admin console");
  });
  it("mounts the seat card only when the server enables seats", () => {
    expect(render(h(MembersApp, { me: me({ authorized: false, namedSeatsEnabled: true }), email: "m@example.com" }))).toContain("A gift for your mother or daughter");
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
