import { expect, it } from "vitest";
import { render } from "preact-render-to-string";
import { Join } from "../src/app/join-island.jsx";

const config = { paymentsReady: true, tiers: [
  { id: "associate", name: "Associate", priceCents: 0, free: true, blurb: "" },
  { id: "founding", name: "Founding Member", priceCents: 90000, free: false, blurb: "" },
  { id: "steward", name: "Community Steward", priceCents: 500000, free: false, blurb: "" },
] };

it.each(config.tiers)("preserves the offered $id membership chosen on the marketing page", (tier) => {
  const html = render(<Join config={config} initialTierId={tier.id} />);
  expect(html).toContain("Choose your membership");
  expect(html).not.toContain("data-chapter-placeholder");
  expect(html).not.toContain("pass renderTiers");
  expect(html).toMatch(new RegExp(`value="${tier.id}"[^>]*checked`));
  expect(html).toContain("$5,000.00");
  expect(html).toContain("$900.00");
  expect(html).toContain("Free");
});

it("does not invent a selected offer from an unknown URL tier", () => {
  expect(render(<Join config={config} initialTierId="unoffered" />)).not.toMatch(/checked/);
});
