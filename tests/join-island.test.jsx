import { expect, it } from "vitest";
import { render } from "preact-render-to-string";
import { Join } from "../src/app/join-island.jsx";

// The tier set production's signup revision publishes (see /api/join-config):
// the Standard tier at its $1,000 list price, Steward, and the free Associate.
const config = { paymentsReady: true, tiers: [
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
