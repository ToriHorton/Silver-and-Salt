import { expect, it } from "vitest";
import { render } from "preact-render-to-string";
import { DEFAULT_CHAPTER_COPY } from "@odla-ai/chapter";
import { Join } from "../src/app/join-island.jsx";

// The tier set production's signup revision publishes (see /api/join-config):
// the Standard tier at its $1,000 list price, Steward, and the free Associate.
// join-config also carries Chapter's resolved join copy, which the packaged
// steps past the form read; the defaults stand in for the group's own words.
const config = { paymentsReady: true, copy: DEFAULT_CHAPTER_COPY.join, tiers: [
  { id: "standard", name: "Standard Membership", priceCents: 100000, free: false, blurb: "" },
  { id: "steward", name: "Community Steward", priceCents: 500000, free: false, blurb: "" },
  { id: "associate", name: "Associate", priceCents: 0, free: true, blurb: "" },
] };

it.each(config.tiers)("preserves the offered $id membership chosen on the marketing page", (tier) => {
  const html = render(<Join config={config} initialTierId={tier.id} />);
  expect(html).toContain("Choose your membership");
  expect(html).not.toContain("data-chapter-placeholder");
  expect(html).not.toContain("pass renderTiers");
  expect(html).toMatch(new RegExp(`value="${tier.id}"[^>]*checked`));
});

it("names the tiers the way the membership page sells them", () => {
  const html = render(<Join config={config} initialTierId="standard" />);
  // The Standard tier is sold as Founding Member at the founding rate, with
  // the list price struck, never as "Standard Membership $1,000.00".
  expect(html).toContain("Founding Member");
  expect(html).not.toContain("Standard Membership");
  expect(html).not.toContain("$1,000.00");
  expect(html).toContain("$900 a year");
  expect(html).toMatch(/<s class="membership-was">\$1,000<\/s>/);
  expect(html).toContain("Confirmed at checkout");
  expect(html).toContain("Community Steward");
  expect(html).toContain("$5,000 a year");
  expect(html).toContain("Associate Member");
  expect(html).toContain("Free");
});

it("falls back to the server's name and list price for a tier it has no words for", () => {
  const extra = { ...config, tiers: [...config.tiers, { id: "patron", name: "Patron", priceCents: 250000, free: false, blurb: "" }] };
  const html = render(<Join config={extra} initialTierId="patron" />);
  expect(html).toContain("Patron");
  expect(html).toContain("$2,500.00");
});

it("shows three steps for a paid tier and two for the free tier", () => {
  const paid = render(<Join config={config} initialTierId="standard" />);
  expect(paid).toContain("Secure your place");
  expect(paid).toContain('<div class="step-dot">3</div>');
  const free = render(<Join config={config} initialTierId="associate" />);
  expect(free).not.toContain("Secure your place");
  expect(free).not.toContain('<div class="step-dot">3</div>');
  expect(free).toContain("Book your conversation");
});

it("does not invent a selected offer from an unknown URL tier", () => {
  expect(render(<Join config={config} initialTierId="unoffered" />)).not.toMatch(/checked/);
});

// The step rail on a RESUMED application (PM bug 854d3a8b, E2E-01). The tier
// rides the server-verified state, so the rail must agree with the stored
// membership whatever the URL says, and a fresh visit is exactly as before.
const dot = (html, id) => html.match(new RegExp(`<div id="${id}" class="(step [a-z]+)">`))?.[1];

it("keeps a resumed free application on two steps, whatever the URL says", () => {
  const html = render(<Join config={config} initialTierId="standard"
    initialState={{ step: "booking", applicationId: "app-free", tier: { id: "associate", free: true } }} />);
  expect(html).not.toContain("Secure your place");
  expect(html).not.toContain('<div class="step-dot">3</div>');
  expect(dot(html, "dot-1")).toBe("step complete");
  expect(dot(html, "dot-pay")).toBeUndefined();
  expect(dot(html, "dot-2")).toBe("step active");
});

it("keeps a resumed paid application's payment step, complete once it is booking", () => {
  const html = render(<Join config={config} initialTierId="associate"
    initialState={{ step: "booking", applicationId: "app-paid", tier: { id: "standard", free: false } }} />);
  expect(html).toContain("Secure your place");
  expect(dot(html, "dot-1")).toBe("step complete");
  expect(dot(html, "dot-pay")).toBe("step complete");
  expect(dot(html, "dot-2")).toBe("step active");
  expect(html).toContain('<div class="step-dot">3</div>');
  const paying = render(<Join config={config} initialTierId="associate"
    initialState={{ step: "payment", applicationId: "app-paid", tier: { id: "standard", free: false } }} />);
  expect(dot(paying, "dot-pay")).toBe("step active");
  expect(dot(paying, "dot-2")).toBe("step pending");
});

// The gift-seat step (Tori, 2026-09-20): offered right after a paid member's
// payment, on the booking step, never to a free applicant and never to a gift
// recipient. Its answer on the application form prefills it.
it("offers the gift seat after payment for a paid tier only", () => {
  const paid = render(<Join config={config} initialTierId="standard"
    initialState={{ step: "booking", applicationId: "app-paid", tier: { id: "standard", free: false } }} />);
  expect(paid).toContain("Add a membership for your mother or daughter.");
  expect(paid).toContain("Continue to booking");
  const free = render(<Join config={config} initialTierId="associate"
    initialState={{ step: "booking", applicationId: "app-free", tier: { id: "associate", free: true } }} />);
  expect(free).not.toContain("Add a membership for your mother or daughter.");
  const form = render(<Join config={config} initialTierId="standard" />);
  expect(form).toContain('name="giftSeatInterest"');
  expect(form).toContain("Yes, I would like to add one family member to my payment.");
  expect(form).not.toContain("Add a membership for your mother or daughter.");
});

it("falls back to the chooser only when the server asserted no tier", () => {
  const free = render(<Join config={config} initialTierId="associate" initialState={{ step: "booking", applicationId: "legacy" }} />);
  expect(free).not.toContain("Secure your place");
  const paid = render(<Join config={config} initialTierId="standard" initialState={{ step: "booking", applicationId: "legacy" }} />);
  expect(dot(paid, "dot-pay")).toBe("step complete");
});

it("leaves a fresh visit with ?tier= on the form step, two steps free and three paid", () => {
  const free = render(<Join config={config} initialTierId="associate" />);
  expect(dot(free, "dot-1")).toBe("step active");
  expect(dot(free, "dot-pay")).toBeUndefined();
  expect(dot(free, "dot-2")).toBe("step pending");
  const paid = render(<Join config={config} initialTierId="standard" />);
  expect(dot(paid, "dot-1")).toBe("step active");
  expect(dot(paid, "dot-pay")).toBe("step pending");
  expect(dot(paid, "dot-2")).toBe("step pending");
});
