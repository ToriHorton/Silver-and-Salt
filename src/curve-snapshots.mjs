// Weekly snapshots of the Journeys conversion curves (Tori, 2026-10-14).
//
// Weeks run Sunday to Saturday (Tori, 2026-10-14). On Saturday night the first
// five-minute cron run after midnight Mountain time freezes the curves for the
// week that just closed, so Monday starts with last week's numbers: one
// curveSnapshots row per week, keyed `curves:<week-ending Saturday>`, written once. Later backfills or
// estimated dates never change a week already recorded, so the weekly report
// compares like with like. The rows hold counts and percentages only, no names.

import { crm } from "./crm.mjs";
import { snapshotCurves, snapshotMembers, weekEnding } from "./labels-dashboard.mjs";
import { loadJourneyPeople } from "./labels-route.mjs";

export const SNAPSHOT_NS = "curveSnapshots";
// A snapshot is taken only on the Sunday or Monday (Mountain time) after its
// week closes. Later than that it would hold numbers from days after the week
// it names, so a late start or a long outage skips the week instead. The
// first run in production (2026-10-14) saved Wednesday's numbers as "week
// ending 10 October"; this rule is why that cannot happen again.
export const SNAPSHOT_GRACE_DAYS = 2;
const snapshotId = (week) => `curves:${week}`;

/** Has this week's snapshot been taken? One indexed lookup, cheap enough for every cron run. */
async function hasSnapshot(db, week) {
  const res = await db.query({ [SNAPSHOT_NS]: { $: { where: { id: snapshotId(week) }, limit: 1 } } });
  return Boolean(res?.[SNAPSHOT_NS]?.length);
}

/** Whole days since the week ending `week` closed: 0 on that Sunday, Mountain time. */
export function daysSinceClose(week, now = Date.now()) {
  const local = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  return Math.round((Date.parse(local + "T12:00:00Z") - Date.parse(week + "T12:00:00Z")) / 864e5) - 1;
}

/**
 * Take the snapshot for the week that just closed, unless it exists or the
 * grace days have passed. The mutationId makes two overlapping runs write one row.
 */
export async function takeWeeklySnapshot(db, { now = Date.now(), force = false } = {}) {
  const week = weekEnding(now);
  if (!force && daysSinceClose(week, now) >= SNAPSHOT_GRACE_DAYS) return { skipped: "late", week };
  if (!force && (await hasSnapshot(db, week))) return { skipped: "taken", week };
  const people = await loadJourneyPeople({ crm, db });
  // `curves` is one json value: the steps plus the member counts.
  const curves = { version: 2, steps: snapshotCurves(people, now), members: snapshotMembers(people, now) };
  const id = snapshotId(week);
  await db.transact(
    [{ t: "update", ns: SNAPSHOT_NS, id, attrs: { id, weekEnding: week, takenAt: now, people: people.length, curves } }],
    { mutationId: force ? `${id}:${now}` : id },
  );
  return { taken: week, conversions: curves.steps.length, people: people.length };
}

/** The most recent snapshots, newest first: `curves` is the steps, `members` the counts. */
export async function listCurveSnapshots(db, limit = 26) {
  const res = await db.query({ [SNAPSHOT_NS]: { $: { order: { weekEnding: "desc" }, limit } } });
  return (res?.[SNAPSHOT_NS] ?? [])
    .map((r) => {
      const c = typeof r.curves === "string" ? JSON.parse(r.curves) : r.curves ?? [];
      return { weekEnding: r.weekEnding, takenAt: r.takenAt, people: r.people, curves: Array.isArray(c) ? c : c.steps ?? [], members: Array.isArray(c) ? null : c.members ?? null };
    })
    .sort((a, b) => (a.weekEnding < b.weekEnding ? 1 : -1));
}

/** The cron entry: Worker env in, a one-line summary out. */
export async function curveSnapshotTick(context, env, { now = Date.now() } = {}) {
  return takeWeeklySnapshot(context.makeDb(env), { now });
}

// ── The Monday weekly report ─────────────────────────────────────────────────
// GET /api/reports/curves feeds the team's Monday report email (Library
// team-dashboard/team-emails.gs, Apps Script). Bearer REPORT_KEY only, failing
// closed when unset; it answers with the eight newest snapshots, newest first:
// per step the totals, the 30-day rate's counts and how many are stuck, plus
// the member counts. Counts only: a snapshot holds no names.

export const CURVE_REPORT_PATH = "/api/reports/curves";

// Constant-time comparison, so response timing never reveals a correct prefix.
function sameSecret(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

const reportJson = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const REPORT_WEEKS = 8;
const totals = (snap) => ({
  weekEnding: snap.weekEnding,
  takenAt: snap.takenAt,
  members: snap.members,
  steps: snap.curves.map(({ path, id, label, eligible, converted, ended, waiting, stuck, rateCohort, rateConverted }) =>
    ({ path, id, label, eligible, converted, ended, waiting, stuck, rateCohort, rateConverted })),
});

export const curveReportRoute = async (req, url, env, ctx) => {
  if (url.pathname !== CURVE_REPORT_PATH) return null;
  if (req.method !== "GET") return reportJson({ error: "method not allowed" }, 405);
  const expected = env?.REPORT_KEY;
  const presented = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (typeof expected !== "string" || !expected || !sameSecret(presented, expected)) return reportJson({ error: "unauthorized" }, 401);
  try {
    const weeks = (await listCurveSnapshots(ctx.makeDb(env), REPORT_WEEKS)).map(totals);
    return reportJson({ weeks, latest: weeks[0] ?? null, previous: weeks[1] ?? null });
  } catch (err) {
    console.error("curve-report", err?.message);
    return reportJson({ error: "snapshots unavailable" }, 503);
  }
};
