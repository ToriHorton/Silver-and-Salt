import { expect, it } from "vitest";
import { render } from "preact-render-to-string";
import { JourneysView } from "../src/app/admin/journeys-dashboard.jsx";

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 14);
const ev = (event, daysAgo) => ({ event, occurredAt: NOW - daysAgo * DAY, dateQuality: "exact", attempt: "a" });
const people = [
  { id: "p1", name: "Sample Applicant", type: "applicant", path: "website_first", action: "paid", tier: "standard", payment: "required", admission: "call_required", actionSince: NOW - 3 * DAY, flags: ["flag:needs-to-book"], events: [ev("applied", 20), ev("paid", 19)] },
  { id: "p2", name: "Sample Member", type: "member", path: "relationship_first", action: "member_access", tier: "associate", payment: "not_required", admission: "call_waived", actionSince: NOW - 9 * DAY, flags: [], events: [ev("applied", 10), ev("approved", 10), ev("member_access", 10)] },
];
const ctx = { href: () => "#" };
const noop = () => {};

it("draws the filters, the grid, the list and the curves from the people", () => {
  const filters = { type: "applicant", path: "website_first", action: "", tier: "" };
  const html = render(<JourneysView people={people} now={NOW} ctx={ctx} filters={filters} setFilters={noop} rows="path" setRows={noop} cols="type" setCols={noop} />);
  expect(html).toContain("person matches");
  expect(html).toContain("Sample Applicant");
  expect(html).not.toContain("Sample Member");
  expect(html).toContain("Counts ignore the Path and Type filters");
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain("Conversion curves");
  expect(html).toContain('class="seg-ctl small"');
  expect(html).toContain("Include estimated dates");
  expect(html).toContain("Prospect → Applicant");
  // Every step, one after another, each with its people one click away.
  for (const step of ["Identified → Contacted", "Applied → Paid", "Seat invited → Applied"]) expect(html).toContain(step);
  expect(html).toContain("See the 2 people");
  expect(html).toContain("Weekly snapshots");
});
