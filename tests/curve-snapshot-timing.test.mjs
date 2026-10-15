// The weekly snapshot's timing rule (src/curve-snapshots.mjs): taken only on
// the Sunday or Monday after its week closes, never days later.
import { expect, it, vi } from "vitest";

vi.mock("../src/labels-route.mjs", () => ({ loadJourneyPeople: async () => [] }));
const { daysSinceClose, takeWeeklySnapshot } = await import("../src/curve-snapshots.mjs");

const db = () => ({ writes: [], async query() { return { curveSnapshots: [] }; }, async transact(ops) { this.writes.push(...ops); } });

it("counts days from the Sunday the week closed, in Mountain time", () => {
  expect(daysSinceClose("2026-10-17", Date.UTC(2026, 9, 18, 6, 5))).toBe(0); // Sunday 00:05
  expect(daysSinceClose("2026-10-17", Date.UTC(2026, 9, 19, 15))).toBe(1); // Monday
  expect(daysSinceClose("2026-10-17", Date.UTC(2026, 9, 21, 1))).toBe(2); // Tuesday evening
});

it("takes the snapshot just after Saturday midnight", async () => {
  const d = db();
  expect(await takeWeeklySnapshot(d, { now: Date.UTC(2026, 9, 18, 6, 5) })).toMatchObject({ taken: "2026-10-17" });
  expect(d.writes[0].attrs.weekEnding).toBe("2026-10-17");
});

it("still takes it on Monday, after an outage on Sunday", async () => {
  expect(await takeWeeklySnapshot(db(), { now: Date.UTC(2026, 9, 19, 20) })).toMatchObject({ taken: "2026-10-17" });
});

it("skips a week that closed days ago instead of filing late numbers under it", async () => {
  // Wednesday 14 October: the week ending 10 October closed on Sunday the 11th.
  const d = db();
  expect(await takeWeeklySnapshot(d, { now: Date.UTC(2026, 9, 15, 1, 26) })).toEqual({ skipped: "late", week: "2026-10-10" });
  expect(d.writes).toHaveLength(0);
});
