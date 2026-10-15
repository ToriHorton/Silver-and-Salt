import { describe, expect, it } from "vitest";
import { actionBars, actionChoices, checkpoint, cohortCurves, CONVERSIONS, grid, matching, snapshotCurves, valueOf, weekEnding } from "../src/labels-dashboard.mjs";

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 14);
const P = (id, type, path, action, tier, extra = {}) => ({ id, type, path, action, tier, ...extra });
const people = [
  P("1", "applicant", "website_first", "paid", "standard"),
  P("2", "applicant", "website_first", "conversation_booked", "associate"),
  P("3", "member", "relationship_first", "member_access", "associate"),
  P("4", "prospect", "relationship_first", "contacted", null),
  P("5", "applicant", "relationship_first", "conversation_booked", "standard"),
];

describe("filters and the grid", () => {
  it("Founding is the standard tier; prospects have no tier", () => {
    expect(valueOf(people[0], "tier")).toBe("founding");
    expect(valueOf(people[3], "tier")).toBe("none");
  });
  it("the list applies every filter", () => {
    expect(matching(people, { type: "applicant", path: "website_first" }).map((p) => p.id)).toEqual(["1", "2"]);
  });
  it("the grid ignores the filters on its own axes, and the selected cell equals the list", () => {
    const filters = { type: "applicant", path: "website_first", tier: "founding" };
    const g = grid(people, filters, "path", "type");
    expect(g.ignored).toEqual(["path", "type"]);
    const r = g.rows.indexOf("website_first");
    const c = g.cols.indexOf("applicant");
    expect(g.counts[r][c]).toBe(matching(people, filters).length);
    expect(g.selected).toEqual({ row: "website_first", col: "applicant" });
    // Tier still applies to the grid: the Associate applicant is not counted.
    expect(g.total).toBe(2);
  });
  it("the Action filter offers only actions that fit the Type and Path", () => {
    const choices = actionChoices({ type: "prospect", path: "relationship_first" });
    expect(choices).toContain("contacted");
    expect(choices).not.toContain("seat_invited");
    expect(choices).not.toContain("paid");
  });
  it("bars count the matching people by Action", () => {
    expect(actionBars(matching(people, { type: "applicant" }))).toEqual([
      { action: "paid", label: "Paid", type: "applicant", count: 1 },
      { action: "conversation_booked", label: "Conversation booked", type: "applicant", count: 2 },
    ]);
  });
});

describe("conversion curves", () => {
  const ev = (event, daysAgo, extra = {}) => ({ event, occurredAt: NOW - daysAgo * DAY, dateQuality: "exact", attempt: "a", ...extra });
  const applied = CONVERSIONS.website_first.find((c) => c.id === "applied_paid");
  it("leaves Associates out of a conversion that ends in Paid, and counts them", () => {
    const ps = [
      P("a", "applicant", "website_first", "paid", "standard", { payment: "required", events: [ev("applied", 20), ev("paid", 19)] }),
      P("b", "applicant", "website_first", "applied", "associate", { payment: "not_required", events: [ev("applied", 20)] }),
    ];
    const r = cohortCurves(ps, applied, { path: "website_first", now: NOW });
    expect(r.ineligible).toBe(1);
    expect(r.tranches[0].eligible).toBe(1);
    expect(r.tranches[0].converted).toBe(1);
    expect(r.tranches[0].pts[1]).toBe(1);
  });
  it("keeps endings in the count as not converted", () => {
    const ps = [
      P("a", "x", "website_first", "paid", "standard", { payment: "required", events: [ev("applied", 30), ev("paid", 28)] }),
      P("b", "x", "website_first", "refunded", "standard", { payment: "required", events: [ev("applied", 30), ev("refunded", 25)] }),
    ];
    const t = cohortCurves(ps, applied, { path: "website_first", now: NOW }).tranches[0];
    expect(t).toMatchObject({ eligible: 2, converted: 1, ended: 1, waiting: 0 });
    expect(t.toDate).toBe(0.5);
  });
  it("leaves estimated dates out by default", () => {
    const ps = [P("a", "x", "website_first", "paid", "standard", { payment: "required", events: [ev("applied", 30), ev("paid", 29, { dateQuality: "estimated" })] })];
    expect(cohortCurves(ps, applied, { path: "website_first", now: NOW }).tranches[0].converted).toBe(0);
    expect(cohortCurves(ps, applied, { path: "website_first", now: NOW, withEstimates: true }).tranches[0].converted).toBe(1);
  });
  it("says not yet for a tranche too young, and too few when fewer than three are left", () => {
    const young = { maxT: 10, maxAge: 10, pts: [] };
    expect(checkpoint(young, 30)).toEqual({ note: "not yet" });
    const thin = { maxT: 12, maxAge: 40, pts: [] };
    expect(checkpoint(thin, 30)).toEqual({ note: "too few" });
  });
  it("Decision recorded counts any decision; Approved counts approvals only", () => {
    const held = (id, outcome) => P(id, "x", "website_first", outcome, "standard", { admission: "call_required", payment: "required", events: [ev("conversation_held", 20), ev(outcome, 18)] });
    const ps = [held("a", "approved"), held("b", "refunded")];
    const dec = CONVERSIONS.website_first.find((c) => c.id === "held_decision");
    const appr = CONVERSIONS.website_first.find((c) => c.id === "held_approved");
    expect(cohortCurves(ps, dec, { path: "website_first", now: NOW }).tranches[0].converted).toBe(2);
    expect(cohortCurves(ps, appr, { path: "website_first", now: NOW }).tranches[0]).toMatchObject({ converted: 1, ended: 1 });
  });
});

describe("the people behind each curve and the weekly snapshot", () => {
  const ev = (event, daysAgo) => ({ event, occurredAt: NOW - daysAgo * DAY, dateQuality: "exact", attempt: "a" });
  const applied = CONVERSIONS.website_first.find((c) => c.id === "applied_paid");
  const ps = [
    P("a", "applicant", "website_first", "paid", "standard", { name: "Ann", payment: "required", events: [ev("applied", 30), ev("paid", 28)] }),
    P("b", "former", "website_first", "refunded", "standard", { name: "Bea", payment: "required", events: [ev("applied", 30), ev("refunded", 25)] }),
    P("c", "applicant", "website_first", "applied", "standard", { name: "Cat", payment: "required", events: [ev("applied", 3)] }),
  ];
  it("keeps each person in their tranche with how it went", () => {
    const units = cohortCurves(ps, applied, { path: "website_first", now: NOW }).tranches.flatMap((t) => t.units);
    expect(units.map((u) => [u.name, u.converted, u.endedAs, u.t])).toEqual([
      ["Ann", true, null, 2], ["Bea", false, "refunded", 30], ["Cat", false, null, 3],
    ]);
    expect(units[0].reachedAt).toBe(NOW - 28 * DAY);
  });
  it("snapshots every conversion on every path, in journey order, without names", () => {
    const snap = snapshotCurves(ps, NOW);
    const all = Object.entries(CONVERSIONS).flatMap(([path, cs]) => cs.map((c) => `${path}:${c.id}`));
    expect(snap.map((c) => `${c.path}:${c.id}`)).toEqual(all);
    expect(snap.find((c) => c.id === "applied_paid")).toMatchObject({ eligible: 3, converted: 1, ended: 1, waiting: 1 });
    expect(JSON.stringify(snap)).not.toContain("Ann");
  });
  it("names the week by the Sunday that closed it, in Mountain time", () => {
    // Wednesday 14 October 2026 → the week that ended Sunday 11 October.
    expect(weekEnding(Date.UTC(2026, 9, 14, 18))).toBe("2026-10-11");
    // Monday 19 October, 00:10 Mountain (06:10 UTC) → Sunday 18 October.
    expect(weekEnding(Date.UTC(2026, 9, 19, 6, 10))).toBe("2026-10-18");
    // Sunday 18 October, 23:50 Mountain is still inside that week → 11 October.
    expect(weekEnding(Date.UTC(2026, 9, 19, 5, 50))).toBe("2026-10-11");
  });
});
