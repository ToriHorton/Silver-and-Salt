// GET /api/reports/curves (src/curve-snapshots.mjs): the Monday report's read
// of the weekly curve snapshots. This holds the door and the shape.
import { expect, it } from "vitest";
import { curveReportRoute } from "../src/curve-snapshots.mjs";

const KEY = "k".repeat(64);
const snap = (weekEnding, converted) => ({
  weekEnding, takenAt: Date.parse(weekEnding + "T06:05:00Z"), people: 4,
  curves: [{ path: "website_first", id: "applied_paid", label: "Applied → Paid", eligible: 5, converted, ended: 1, waiting: 4 - converted, tranches: [{ month: "2026-10" }] }],
});
const db = { query: async () => ({ curveSnapshots: [snap("2026-10-17", 3), snap("2026-10-10", 2)] }) };
const ctx = { makeDb: () => db };
const call = (auth, env = { REPORT_KEY: KEY }, method = "GET", path = "/api/reports/curves") => {
  const url = new URL("https://silverandsaltcapital.com" + path);
  return curveReportRoute(new Request(url, { method, headers: auth ? { authorization: auth } : {} }), url, env, ctx);
};

it("passes other paths through", async () => {
  expect(await call("Bearer " + KEY, undefined, "GET", "/api/other")).toBeNull();
});
it("turns away a missing or wrong key, and fails closed with no key set", async () => {
  expect((await call()).status).toBe(401);
  expect((await call("Bearer nope")).status).toBe(401);
  expect((await call("Bearer ", { REPORT_KEY: "" })).status).toBe(401);
  expect((await call("Bearer " + KEY, {})).status).toBe(401);
});
it("reads the current snapshot shape: steps and member counts in one json value", async () => {
  const members = { total: 3, paying: 2, joined: 1, payingJoined: 1 };
  const step = { path: "all", id: "applicant_to_member", label: "Applicant → Member", eligible: 4, converted: 2, ended: 0, waiting: 2, stuck: 1, rateCohort: 3, rateConverted: 2, tranches: [] };
  const v2 = { makeDb: () => ({ query: async () => ({ curveSnapshots: [{ weekEnding: "2026-10-17", takenAt: 1, people: 9, curves: { version: 2, steps: [step], members } }] }) }) };
  const url = new URL("https://silverandsaltcapital.com/api/reports/curves");
  const body = await (await curveReportRoute(new Request(url, { headers: { authorization: "Bearer " + KEY } }), url, { REPORT_KEY: KEY }, v2)).json();
  expect(body.weeks).toHaveLength(1);
  expect(body.latest.members).toEqual(members);
  expect(body.latest.steps[0]).toEqual({ path: "all", id: "applicant_to_member", label: "Applicant → Member", eligible: 4, converted: 2, ended: 0, waiting: 2, stuck: 1, rateCohort: 3, rateConverted: 2 });
});
it("answers the two newest weeks' totals per step, without the tranches", async () => {
  const res = await call("Bearer " + KEY);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.latest.weekEnding).toBe("2026-10-17");
  expect(body.previous.weekEnding).toBe("2026-10-10");
  expect(body.weeks.map((w) => w.weekEnding)).toEqual(["2026-10-17", "2026-10-10"]);
  expect(body.latest.steps).toEqual([{ path: "website_first", id: "applied_paid", label: "Applied → Paid", eligible: 5, converted: 3, ended: 1, waiting: 1 }]);
});
it("answers null weeks before the first snapshot", async () => {
  const empty = { makeDb: () => ({ query: async () => ({ curveSnapshots: [] }) }) };
  const url = new URL("https://silverandsaltcapital.com/api/reports/curves");
  const res = await curveReportRoute(new Request(url, { headers: { authorization: "Bearer " + KEY } }), url, { REPORT_KEY: KEY }, empty);
  expect(await res.json()).toEqual({ weeks: [], latest: null, previous: null });
});
