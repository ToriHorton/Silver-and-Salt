// The member area: the named seat card and the admin console link
// (src/app/members.jsx). Rendered to strings; no browser.
import { describe, expect, it } from "vitest";
import { h } from "preact";
import { render } from "preact-render-to-string";
import { MembersApp, NamedSeatCard } from "../src/app/members.jsx";

const offer = { eligible: true, amountCents: 50000, currency: "usd", termEndsAt: Date.UTC(2028, 0, 1), autoRenew: true, digest: "d".repeat(64), membershipId: "membership_x", refundPolicyText: "Refunds.", merchantDisclosureText: "Billed by Built Not Found Capital." };
const api = async () => { throw new Error("not called in a string render"); };

describe("NamedSeatCard", () => {
  it("offers the seat with price and end date when eligible", () => {
    const html = render(h(NamedSeatCard, { api, initial: offer }));
    expect(html).toContain("A second seat");
    expect(html).toContain("$500.00");
    expect(html).toContain("January 1, 2028");
    expect(html).toContain("Review the seat");
  });
  it("shows the purchased seat and its status instead of the form", () => {
    const html = render(h(NamedSeatCard, { api, initial: { ...offer, eligible: false, seat: { recipientName: "Ada Lovelace", recipientEmail: "ada@example.com", status: "awaiting_acceptance" } } }));
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("awaiting acceptance");
    expect(html).not.toContain("Review the seat");
  });
  it("explains the window when no longer eligible", () => {
    const html = render(h(NamedSeatCard, { api, initial: { ...offer, eligible: false } }));
    expect(html).toContain("first three months");
    expect(html).not.toContain("Review the seat");
  });
});

describe("MembersApp", () => {
  const me = (extra) => ({ email: "m@example.com", role: "member", application: { paid: true, tier: "standard" }, namedSeatsEnabled: false, ...extra });
  it("shows the admin console to anyone the server authorizes, superadmins included", () => {
    expect(render(h(MembersApp, { me: me({ authorized: true }), email: "m@example.com" }))).toContain("Admin console");
    expect(render(h(MembersApp, { me: me({ authorized: true, role: "admin" }), email: "m@example.com" }))).toContain("Admin console");
    expect(render(h(MembersApp, { me: me({ authorized: false }), email: "m@example.com" }))).not.toContain("Admin console");
  });
  it("mounts the seat card only when the server enables seats", () => {
    expect(render(h(MembersApp, { me: me({ authorized: false, namedSeatsEnabled: true }), email: "m@example.com" }))).toContain("A second seat");
    expect(render(h(MembersApp, { me: me({ authorized: false }), email: "m@example.com" }))).not.toContain("A second seat");
  });
});
