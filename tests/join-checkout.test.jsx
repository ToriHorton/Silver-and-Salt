import { expect, it, vi } from "vitest";
import { render } from "preact-render-to-string";

const capture = vi.hoisted(() => ({ props: null }));
vi.mock("@odla-ai/chapter/ui/member", () => ({
  JoinIsland: (props) => { capture.props = props; return null; },
}));
import { Join } from "../src/app/join-island.jsx";

const config = { paymentsReady: true, tiers: [{ id: "standard", name: "Standard", priceCents: 100000, free: false }] };

it.each([
  { standardCents: 100000, discountCents: 10000, dueTodayCents: 140000, namedSeatCents: 50000, founding: true, seat: "$500.00", total: "$1,400.00" },
  { standardCents: 500000, discountCents: 0, dueTodayCents: 500000, namedSeatCents: 0, seat: "Included", total: "$5,000.00" },
  { standardCents: 220000, discountCents: 0, dueTodayCents: 295000, namedSeatCents: 75000, seat: "$750.00", total: "$2,950.00" },
])("renders the configured seat allocation and combined total ($namedSeatCents)", (lines) => {
  render(<Join config={config} initialTierId="standard" />);
  const html = render(capture.props.payment.renderPriceLines(lines));
  expect(html).toContain(`<span>Additional family member</span><span>${lines.seat}</span>`);
  expect(html).toContain(`<span>Due today</span><span>${lines.total}</span>`);
});

it("keeps the catalog comparison's member rate separate from the added seat", () => {
  render(<Join config={config} initialTierId="standard" />);
  const html = render(capture.props.payment.renderPriceLines({ standardCents: 100000, discountCents: 10000,
    dueTodayCents: 140000, namedSeatCents: 50000, presentation: {} }));
  expect(html).toContain("<span>Your rate</span><span>$900.00</span>");
  expect(html).toContain("<span>Due today</span><span>$1,400.00</span>");
});

it("omits an unselected seat from the member-only total", () => {
  render(<Join config={config} initialTierId="standard" />);
  const html = render(capture.props.payment.renderPriceLines({ standardCents: 100000, discountCents: 10000, dueTodayCents: 90000 }));
  expect(html).not.toContain("Additional family member");
  expect(html).toContain("<span>Due today</span><span>$900.00</span>");
});
