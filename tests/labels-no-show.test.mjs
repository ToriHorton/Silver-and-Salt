// "Didn't happen" on the Action tab (POST /api/admin/labels/person/no-show).
// The missed booking must be released in Chapter's rows, or the join page keeps
// answering "You're confirmed" for a time that has passed and the applicant
// cannot rebook.
import { beforeEach, describe, expect, it, vi } from "vitest";

const crmState = vi.hoisted(() => ({ record: null, updates: [] }));
vi.mock("@odla-ai/crm", async (orig) => ({
  ...(await orig()),
  getRecord: vi.fn(async () => crmState.record),
  updateRecord: vi.fn(async (_deps, input) => { crmState.updates.push(input); return {}; }),
}));
const sent = vi.hoisted(() => []);
vi.mock("@odla-ai/chapter", async (orig) => ({
  ...(await orig()),
  sendTemplated: vi.fn(async (_deps, msg) => { sent.push(msg); return { sent: true }; }),
}));

const { labelsRoute, LABELS_NO_SHOW_PATH } = await import("../src/labels-route.mjs");

const CHAPTER = "silver-and-salt-capital";
const PAST = Date.now() - 2 * 3600e3;

function fakeDb(state, { failTransact = false } = {}) {
  return {
    state,
    query: vi.fn(async (q) => {
      const out = {};
      for (const ns of Object.keys(q)) {
        const where = q[ns].$?.where ?? {};
        out[ns] = (state[ns] ?? []).filter((row) => Object.entries(where).every(([k, v]) => row[k] === v));
      }
      return out;
    }),
    transact: vi.fn(async (ops) => {
      if (failTransact) throw new Error("db down");
      for (const op of ops) Object.assign(state[op.ns].find((r) => r.id === op.id), op.attrs);
      return {};
    }),
  };
}

const person = () => ({
  id: "p1", type: "person", updatedAt: 1,
  fields: { journeyAction: "conversation_booked", journeyPath: "website_first", payment: "required", applicationId: "a1", journeyFlags: "flag:attendance-unconfirmed" },
});
const rows = () => ({
  applications: [{ id: "a1", groupId: CHAPTER, status: "call_scheduled", email: "jane@example.com", firstName: "Jane", meetingAt: PAST, meetingLink: "https://meet.example/x" }],
  meetings: [{ id: "m1", applicationId: "a1", status: "scheduled", startAt: PAST, createdAt: PAST - 864e5, googleEventId: "g1" }],
  groups: [{ id: CHAPTER, name: "Silver & Salt Capital" }],
});
const ctxFor = (db) => ({ chapter: { id: CHAPTER, config: {} }, makeDb: () => db, verifyUser: async () => ({ userId: "tori" }), isAdmin: async () => true });
const post = (db) => {
  const req = new Request(`https://x.test${LABELS_NO_SHOW_PATH}`, { method: "POST", body: JSON.stringify({ recordId: "p1" }) });
  return labelsRoute(req, new URL(req.url), { ODLA_ENV: "prod" }, ctxFor(db));
};

beforeEach(() => {
  crmState.record = person();
  crmState.updates = [];
  sent.length = 0;
});

describe("Didn't happen", () => {
  it("releases the missed booking so the join page offers booking again, then invites a rebook", async () => {
    const db = fakeDb(rows());
    const res = await post(db);
    expect(res.status).toBe(200);
    expect(db.state.meetings[0]).toMatchObject({ status: "cancelled", drift: "none", googleEventId: "g1" });
    expect(db.state.applications[0]).toMatchObject({ meetingAt: 0, meetingLink: "", status: "call_scheduled" });
    expect(crmState.updates[0].input).toMatchObject({ journeyAction: "paid" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "jane@example.com", template: "bookingReminder" });
  });

  it("changes nothing when the booking cannot be released, so a retry starts clean", async () => {
    const db = fakeDb(rows(), { failTransact: true });
    const res = await post(db);
    expect(res.status).toBe(502);
    expect(crmState.updates).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("still finishes when an earlier attempt already released the booking", async () => {
    const state = rows();
    Object.assign(state.meetings[0], { status: "cancelled" });
    const db = fakeDb(state);
    const res = await post(db);
    expect(res.status).toBe(200);
    expect(db.transact).not.toHaveBeenCalled();
    expect(crmState.updates).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });
});
