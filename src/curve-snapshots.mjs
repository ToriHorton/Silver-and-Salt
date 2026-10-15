// Weekly snapshots of the Journeys conversion curves (Tori, 2026-10-14).
//
// Every Monday the first five-minute cron run after midnight Mountain time
// freezes the curves for the week that just closed: one curveSnapshots row per
// week, keyed `curves:<week-ending Sunday>`, written once. Later backfills or
// estimated dates never change a week already recorded, so the weekly report
// compares like with like. The rows hold counts and percentages only, no names.

import { crm } from "./crm.mjs";
import { snapshotCurves, weekEnding } from "./labels-dashboard.mjs";
import { loadJourneyPeople } from "./labels-route.mjs";

export const SNAPSHOT_NS = "curveSnapshots";
const snapshotId = (week) => `curves:${week}`;

/** Has this week's snapshot been taken? One indexed lookup, cheap enough for every cron run. */
async function hasSnapshot(db, week) {
  const res = await db.query({ [SNAPSHOT_NS]: { $: { where: { id: snapshotId(week) }, limit: 1 } } });
  return Boolean(res?.[SNAPSHOT_NS]?.length);
}

/**
 * Take the snapshot for the week that just closed, unless it exists. The
 * mutationId makes two overlapping runs write one row.
 */
export async function takeWeeklySnapshot(db, { now = Date.now(), force = false } = {}) {
  const week = weekEnding(now);
  if (!force && (await hasSnapshot(db, week))) return { skipped: "taken", week };
  const people = await loadJourneyPeople({ crm, db });
  const curves = snapshotCurves(people, now);
  const id = snapshotId(week);
  await db.transact(
    [{ t: "update", ns: SNAPSHOT_NS, id, attrs: { id, weekEnding: week, takenAt: now, people: people.length, curves } }],
    { mutationId: force ? `${id}:${now}` : id },
  );
  return { taken: week, conversions: curves.length, people: people.length };
}

/** The most recent snapshots, newest first. */
export async function listCurveSnapshots(db, limit = 26) {
  const res = await db.query({ [SNAPSHOT_NS]: { $: { order: { weekEnding: "desc" }, limit } } });
  return (res?.[SNAPSHOT_NS] ?? [])
    .map((r) => ({ weekEnding: r.weekEnding, takenAt: r.takenAt, people: r.people, curves: typeof r.curves === "string" ? JSON.parse(r.curves) : r.curves ?? [] }))
    .sort((a, b) => (a.weekEnding < b.weekEnding ? 1 : -1));
}

/** The cron entry: Worker env in, a one-line summary out. */
export async function curveSnapshotTick(context, env, { now = Date.now() } = {}) {
  return takeWeeklySnapshot(context.makeDb(env), { now });
}
