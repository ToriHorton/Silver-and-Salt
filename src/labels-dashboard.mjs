// The Dashboard's maths (Signup Journeys v3.1 dashboard and curve rules;
// build plan v3, section 7 and Appendix A.7). Pure: people and events in,
// counts and curves out. The admin page runs it in the browser over the list
// the server returns, so every number on the page comes from one function.

import { ACTION_BY_ID, ACTIONS, PATH_LABELS, TYPE_LABELS } from "./labels.mjs";

export const TIER_LABELS = { associate: "Associate", standard: "Founding", founding: "Founding", steward: "Steward" };
export const DIMENSIONS = {
  type: { label: "Type", values: ["prospect", "applicant", "member", "former"], names: TYPE_LABELS },
  path: { label: "Path", values: ["relationship_first", "website_first", "second_seat"], names: PATH_LABELS },
  tier: { label: "Tier", values: ["associate", "founding", "steward", "none"], names: { ...TIER_LABELS, none: "No tier" } },
  action: { label: "Action", values: ACTIONS.map((a) => a.id), names: Object.fromEntries(ACTIONS.map((a) => [a.id, a.label])) },
};

/** The value of one dimension for a person. */
export function valueOf(person, dim) {
  if (dim === "tier") {
    const t = person.tier === "standard" ? "founding" : person.tier;
    return t && DIMENSIONS.tier.values.includes(t) ? t : "none";
  }
  return person[dim] ?? null;
}

/** Everyone matching every filter that is set, except the ones named in `ignore`. */
export function matching(people, filters, ignore = []) {
  return people.filter((p) =>
    Object.entries(filters).every(([dim, v]) => !v || ignore.includes(dim) || valueOf(p, dim) === v),
  );
}

/** The Actions offered in the Action filter: those that fit the chosen Type and Path. */
export function actionChoices(filters) {
  return ACTIONS.filter((a) => (!filters.type || a.type === filters.type) && (!filters.path || !a.when.path || a.when.path.includes(filters.path))).map((a) => a.id);
}

/**
 * The grid: rows by one dimension, columns by another. It ignores the filters
 * on its own two dimensions so every row and column stays visible; every
 * other filter applies. The selected cell is the one both filters point at,
 * and its count always equals the list's count.
 */
export function grid(people, filters, rows, cols) {
  const base = matching(people, filters, [rows, cols]);
  const rv = rows === "action" ? actionChoices(filters) : DIMENSIONS[rows].values;
  const cv = DIMENSIONS[cols].values;
  const cell = (r, c) => base.filter((p) => (r == null || valueOf(p, rows) === r) && (c == null || valueOf(p, cols) === c)).length;
  return {
    rows: rv,
    cols: cv,
    counts: rv.map((r) => cv.map((c) => cell(r, c))),
    rowTotals: rv.map((r) => cell(r, null)),
    colTotals: cv.map((c) => cell(null, c)),
    total: base.length,
    selected: filters[rows] && filters[cols] ? { row: filters[rows], col: filters[cols] } : null,
    ignored: [rows, cols],
  };
}

/** The Action bars: the matching people by Action. */
export function actionBars(people) {
  const by = new Map();
  for (const p of people) if (p.action) by.set(p.action, (by.get(p.action) ?? 0) + 1);
  return ACTIONS.filter((a) => by.has(a.id)).map((a) => ({ action: a.id, label: a.label, type: a.type, count: by.get(a.id) }));
}

// ── Conversions ──────────────────────────────────────────────────────────────

const DAY = 864e5;
const ENDINGS = new Set(["passed", "seat_declined", "declined", "refunded", "lapsed", "seat_ended"]);
const DECISIONS = new Set(["approved", "declined", "refunded", "moved_to_associate"]);

// Each conversion: where it starts, where it ends, how units are counted,
// and who is eligible. `to` may be a set ("any decision").
const C = (id, label, from, to, unit, eligible) => ({ id, label, from, to, unit, eligible });
const payable = (u) => u.payment === "required";
const callNeeded = (u) => u.admission === "call_required";
export const CONVERSIONS = {
  all: [
    C("prospect_to_applicant", "Prospect → Applicant", "type:prospect", "type:applicant", "person", () => true),
    C("applicant_to_member", "Applicant → Member", "type:applicant", "type:member", "person", () => true),
  ],
  relationship_first: [
    C("identified_contacted", "Identified → Contacted", "identified", "contacted", "person", () => true),
    C("contacted_intro_booked", "Contacted → Introduction booked", "contacted", "intro_booked", "person", () => true),
    C("intro_booked_held", "Introduction booked → Introduction held", "intro_booked", "intro_held", "person", () => true),
    C("intro_held_soft_commit", "Introduction held → Soft commit", "intro_held", "soft_commit", "person", () => true),
    C("invited_paid", "Invited → Paid", "invited", "paid", "attempt", payable),
  ],
  website_first: [
    C("applied_paid", "Applied → Paid", "applied", "paid", "attempt", payable),
    C("paid_booked", "Paid → Conversation booked", "paid", "conversation_booked", "attempt", callNeeded),
    C("held_decision", "Conversation held → Decision recorded", "conversation_held", "decision", "attempt", callNeeded),
    C("held_approved", "Conversation held → Approved", "conversation_held", "approved", "attempt", callNeeded),
    C("applied_access", "Applied → Member access", "applied", "member_access", "attempt", () => true),
  ],
  second_seat: [
    C("seat_invited_applied", "Seat invited → Applied", "seat_invited", "applied", "person", () => true),
    C("seat_applied_booked", "Applied → Conversation booked", "applied", "conversation_booked", "attempt", callNeeded),
    C("seat_invited_access", "Seat invited → Member access", "seat_invited", "member_access", "person", () => true),
  ],
};

/**
 * The units a conversion counts: one per person, or one per application
 * attempt. Each unit carries its events (oldest first).
 */
export function unitsFor(people, conv, pathFilter) {
  const units = [];
  for (const p of people) {
    if (pathFilter && pathFilter !== "all" && p.path !== pathFilter) continue;
    const events = (p.events ?? []).slice().sort((a, b) => a.occurredAt - b.occurredAt);
    if (conv.unit === "person") {
      units.push({ id: p.id, person: p, events, payment: p.payment, admission: p.admission });
    } else {
      const byAttempt = new Map();
      for (const e of events) {
        const k = e.attempt ?? "none";
        if (!byAttempt.has(k)) byAttempt.set(k, []);
        byAttempt.get(k).push(e);
      }
      for (const [k, evs] of byAttempt) units.push({ id: `${p.id}:${k}`, person: p, events: evs, payment: p.payment, admission: p.admission });
    }
  }
  return units;
}

function firstAt(events, point, after = -Infinity, withEstimates = false) {
  const ok = (e) => withEstimates || e.dateQuality !== "estimated";
  if (point.startsWith("type:")) {
    const t = point.slice(5);
    const e = events.find((x) => x.occurredAt >= after && ok(x) && ACTION_BY_ID[x.event]?.type === t);
    return e ? e.occurredAt : null;
  }
  const match = point === "decision" ? (x) => DECISIONS.has(x.event) : (x) => x.event === point;
  const e = events.find((x) => x.occurredAt >= after && ok(x) && match(x));
  return e ? e.occurredAt : null;
}

/**
 * Appendix A.7, step by step. Returns the tranches (one per start month), each
 * with its curve, and the counts shown under the chart.
 */
export function cohortCurves(people, conv, { path = "all", now = Date.now(), maxDays = 60, withEstimates = false, months = 6, minFollowed = 3 } = {}) {
  const all = unitsFor(people, conv, path);
  const rows = [];
  let ineligible = 0;
  for (const u of all) {
    const start = firstAt(u.events, conv.from, -Infinity, withEstimates);
    if (start === null) continue;
    if (!conv.eligible(u)) { ineligible++; continue; }
    const end = firstAt(u.events, conv.to, start, withEstimates);
    const ending = end === null ? u.events.find((e) => e.occurredAt >= start && ENDINGS.has(e.event)) : null;
    const age = Math.floor((now - start) / DAY);
    rows.push({
      unit: u.id,
      personId: u.person.id,
      name: u.person.name,
      month: new Date(start).toISOString().slice(0, 7),
      startedAt: start,
      reachedAt: end,
      converted: end !== null,
      ended: Boolean(ending),
      endedAs: ending ? ending.event : null,
      t: end !== null ? Math.floor((end - start) / DAY) : age,
      age,
    });
  }
  const monthsSeen = [...new Set(rows.map((r) => r.month))].sort().slice(-months);
  const tranches = monthsSeen.map((m, i) => {
    const rs = rows.filter((r) => r.month === m);
    const maxAge = Math.min(maxDays, Math.max(0, ...rs.map((r) => r.age)));
    const floor = Math.min(minFollowed, rs.length);
    let maxT = 0;
    for (let d = 0; d <= maxAge; d++) {
      const followed = rs.filter((r) => r.t >= d).length;
      const tooNew = rs.filter((r) => !r.converted && !r.ended && r.t < d).length;
      if (tooNew === 0 || followed >= floor) maxT = d; else break;
    }
    const pts = [];
    let notYet = 1;
    for (let d = 0; d <= maxT; d++) {
      const followed = rs.filter((r) => r.t >= d).length;
      const conversions = rs.filter((r) => r.converted && r.t === d).length;
      if (followed) notYet *= 1 - conversions / followed;
      pts.push(1 - notYet);
    }
    return {
      month: m,
      color: i,
      eligible: rs.length,
      converted: rs.filter((r) => r.converted).length,
      ended: rs.filter((r) => r.ended).length,
      waiting: rs.filter((r) => !r.converted && !r.ended).length,
      units: rs.slice().sort((a, b) => a.startedAt - b.startedAt),
      maxT,
      maxAge,
      pts,
      toDate: pts.length ? pts[pts.length - 1] : 0,
    };
  });
  return { tranches, ineligible, estimatedLeftOut: !withEstimates };
}

/** A checkpoint cell: a percentage, "not yet" (too young) or "too few". */
export function checkpoint(tranche, day) {
  if (tranche.maxT >= day) return { value: tranche.pts[day] };
  if (tranche.maxAge < day) return { note: "not yet" };
  return { note: "too few" };
}

// ── Weekly snapshots ─────────────────────────────────────────────────────────
// Every Monday the Worker freezes the curves for the week that just closed, so
// the weekly report compares like with like even after later backfills.

const SNAPSHOT_DAYS = [7, 14, 30, 60, 90];
const PATH_ORDER = ["all", "relationship_first", "website_first", "second_seat"];

/**
 * The Sunday that ends the last full week (Monday to Sunday, Mountain time)
 * before `now`, as YYYY-MM-DD. On a Sunday that is the Sunday before, because
 * today's week has not finished.
 */
export function weekEnding(now = Date.now()) {
  const local = new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Denver" });
  const d = new Date(local + "T12:00:00Z");
  const back = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  return new Date(d.getTime() - back * DAY).toISOString().slice(0, 10);
}

/**
 * Every conversion on every path, in journey order, reduced to the numbers a
 * weekly report needs: totals and each starting month's checkpoints. Exact
 * dates only, the last twelve months, no names.
 */
export function snapshotCurves(people, now = Date.now()) {
  const out = [];
  for (const path of PATH_ORDER) {
    for (const conv of CONVERSIONS[path]) {
      const r = cohortCurves(people, conv, { path, now, maxDays: 365, months: 12 });
      const sum = (k) => r.tranches.reduce((n, t) => n + t[k], 0);
      out.push({
        path,
        id: conv.id,
        label: conv.label,
        eligible: sum("eligible"),
        converted: sum("converted"),
        ended: sum("ended"),
        waiting: sum("waiting"),
        ineligible: r.ineligible,
        tranches: r.tranches.map((t) => ({
          month: t.month,
          eligible: t.eligible,
          converted: t.converted,
          ended: t.ended,
          waiting: t.waiting,
          toDate: Math.round(t.toDate * 1000) / 1000,
          days: Object.fromEntries(SNAPSHOT_DAYS.map((d) => [d, t.maxT >= d ? Math.round(t.pts[d] * 1000) / 1000 : null])),
        })),
      });
    }
  }
  return out;
}
