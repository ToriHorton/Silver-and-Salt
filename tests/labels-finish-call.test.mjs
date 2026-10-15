// "Finish the call" on the Action tab (POST /api/admin/labels/person/outcome).
// Tori picks the decision and the call is recorded with it: Conversation held
// first, then the outcome, each as its own event so the curves keep both.
import { beforeEach, describe, expect, it, vi } from "vitest";

const crmState = vi.hoisted(() => ({ record: null, updates: [] }));
vi.mock("@odla-ai/crm", async (orig) => ({
  ...(await orig()),
  getRecord: vi.fn(async () => crmState.record),
  updateRecord: vi.fn(async (_deps, input) => {
    crmState.updates.push(input);
    const r = crmState.record;
    crmState.record = { ...r, updatedAt: r.updatedAt + 1, fields: { ...r.fields, ...input.input } };
    return {};
  }),
}));

const { labelsRoute, LABELS_OUTCOME_PATH } = await import("../src/labels-route.mjs");

const ctx = { chapter: { id: "silver-and-salt-capital", config: {} }, makeDb: () => ({}), verifyUser: async () => ({ userId: "tori" }), isAdmin: async () => true };
const person = (fields) => ({
  id: "p1", type: "person", updatedAt: 1,
  fields: { journeyPath: "website_first", admission: "call_required", payment: "required", applicationId: "a1", journeyFlags: "flag:attendance-unconfirmed", ...fields },
});
const post = (body) => {
  const req = new Request(`https://x.test${LABELS_OUTCOME_PATH}`, { method: "POST", body: JSON.stringify({ recordId: "p1", ...body }) });
  return labelsRoute(req, new URL(req.url), {}, ctx);
};
const steps = () => crmState.updates.map((u) => u.audit.meta.to);

beforeEach(() => {
  crmState.updates = [];
});

describe("Finish the call", () => {
  it("records the call as held, then the decision, from a booked call", async () => {
    crmState.record = person({ journeyAction: "conversation_booked" });
    const res = await post({ outcome: "fit", expectedUpdatedAt: 1 });
    expect(res.status).toBe(200);
    expect(steps()).toEqual(["conversation_held", "fit"]);
    expect(crmState.updates[0].audit.meta).toMatchObject({ from: "conversation_booked", journeyEvent: "action_changed", sourceType: "finish_call" });
    expect(crmState.updates[1].audit.meta.from).toBe("conversation_held");
    // The first write carries the time Tori saw; the second, the time after the first.
    expect(crmState.updates.map((u) => u.expectedUpdatedAt)).toEqual([1, 2]);
    expect(crmState.record.fields.journeyFlags).toBe("");
    expect((await res.json()).labels.action).toBe("fit");
  });

  it("records only the decision when the call is already held", async () => {
    crmState.record = person({ journeyAction: "conversation_held" });
    await post({ outcome: "not_paid_fit" });
    expect(steps()).toEqual(["not_paid_fit"]);
  });

  it("writes nothing on a retry once the same decision is recorded", async () => {
    crmState.record = person({ journeyAction: "not_fit" });
    const res = await post({ outcome: "not_fit" });
    expect(res.status).toBe(200);
    expect(crmState.updates).toHaveLength(0);
  });

  it("refuses someone with no call, and an outcome that does not fit them", async () => {
    crmState.record = person({ journeyAction: "paid" });
    expect((await post({ outcome: "fit" })).status).toBe(400);
    crmState.record = person({ journeyAction: "conversation_booked", payment: "not_required" });
    expect((await post({ outcome: "not_paid_fit" })).status).toBe(400);
    expect((await post({ outcome: "approved" })).status).toBe(400);
    expect(crmState.updates).toHaveLength(0);
  });
});
