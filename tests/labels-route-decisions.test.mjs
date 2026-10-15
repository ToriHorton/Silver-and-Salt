// Server tests for the Action tab's buttons (src/labels-route.mjs): what each
// one records, which emails go out and how often, and what is refused. A
// stand-in CRM and database keep every write in memory, and enforce the same
// compare-and-swap rule as the real CRM (a write carrying an old
// last-updated time is refused), so stale screens are tested for real.

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ records: new Map(), audits: [], activities: [], transacts: [], sends: [], sendResult: null }));

vi.mock("@odla-ai/crm", async (orig) => {
  const real = await orig();
  return {
    ...real,
    getRecord: vi.fn(async (_deps, id) => {
      const r = store.records.get(id);
      return r ? structuredClone(r) : null;
    }),
    updateRecord: vi.fn(async (_deps, opts) => {
      const r = store.records.get(opts.id);
      if (!r) throw new Error("not found");
      if (typeof opts.expectedUpdatedAt === "number" && opts.expectedUpdatedAt !== r.updatedAt) throw new Error("conflict");
      r.fields = { ...r.fields, ...opts.input };
      r.updatedAt += 1;
      if (opts.audit) store.audits.push({ recordId: opts.id, ...opts.audit });
      return { record: structuredClone(r), duplicate: false };
    }),
    addActivity: vi.fn(async (_deps, opts) => {
      store.activities.push(opts);
      return { id: `act_${store.activities.length}`, duplicate: false };
    }),
    listActivities: vi.fn(async () => []),
    // Honors a tag filter, as the real list does (Partners & Team use it).
    listRecords: vi.fn(async (_deps, params = {}) => {
      const all = [...store.records.values()].filter((r) => !params.tag || (r.tags ?? []).includes(params.tag));
      return { records: all.map((r) => structuredClone(r)), total: all.length };
    }),
  };
});

vi.mock("@odla-ai/chapter", async (orig) => {
  const real = await orig();
  return {
    ...real,
    emailGroupFrom: (row) => ({ id: row.id }),
    sendTemplated: vi.fn(async (_deps, msg) => {
      store.sends.push(msg);
      const r = typeof store.sendResult === "function" ? store.sendResult(msg) : store.sendResult;
      return r ?? { sent: true };
    }),
  };
});

vi.mock("../src/labels-job.mjs", () => ({ runLabels: vi.fn(async () => ({ summary: { people: 1 } })) }));

const { labelsRoute } = await import("../src/labels-route.mjs");

const NOW = Date.now();
const DAY = 864e5;

function person(id, fields) {
  store.records.set(id, { id, type: "person", name: "Sample Person", primaryEmail: "sample@example.com", updatedAt: 10, createdAt: 1, fields: { applicationId: "app1", journeyPath: "website_first", admission: "call_required", payment: "required", journeyFlags: "", ...fields } });
}

function db({ grants = [], meetings = [], app = { id: "app1", email: "sample@example.com", firstName: "Sample", status: "call_scheduled" } } = {}) {
  return {
    async query(q) {
      if (q.applications) return { applications: app ? [app] : [] };
      if (q.meetings) return { meetings };
      if (q.groups) return { groups: [{ id: "silver-and-salt-capital" }] };
      if (q.admissionGrants) return { admissionGrants: grants };
      return {};
    },
    async transact(ops) { store.transacts.push(ops); return {}; },
  };
}

function ctx({ admin = true, user = { userId: "user_tori", email: "tori@example.com" }, dbOpts } = {}) {
  const d = db(dbOpts);
  return {
    verifyUser: async () => user,
    isAdmin: async () => admin,
    makeDb: () => d,
    chapter: { id: "silver-and-salt-capital", config: { emails: { events: {} } } },
  };
}

async function post(path, body, c = ctx()) {
  const url = new URL(`https://silverandsaltcapital.com${path}`);
  const req = new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  const res = await labelsRoute(req, url, { ODLA_ENV: "prod", EMAIL_FROM: "tori@silverandsaltcapital.com" }, c);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  store.records.clear();
  store.audits = [];
  store.activities = [];
  store.transacts = [];
  store.sends = [];
  store.sendResult = null;
});

describe("who may press the buttons", () => {
  it("refuses anyone not signed in, and anyone not an admin", async () => {
    person("p1", { journeyAction: "contacted" });
    expect((await post("/api/admin/labels/person/action", { recordId: "p1", action: "passed" }, ctx({ user: null }))).status).toBe(401);
    expect((await post("/api/admin/labels/person/action", { recordId: "p1", action: "passed" }, ctx({ admin: false }))).status).toBe(403);
  });
});

describe("Update the relationship", () => {
  it("refuses Approved, Refunded and Member access by hand, naming the real button", async () => {
    person("p1", { journeyAction: "conversation_held" });
    for (const action of ["approved", "refunded", "member_access"]) {
      const res = await post("/api/admin/labels/person/action", { recordId: "p1", action, expectedUpdatedAt: 10 });
      expect(res.status).toBe(400);
    }
    expect(store.audits).toEqual([]);
  });

  it("Keep informed sets a revisit date 90 days out and adds a follow-up task", async () => {
    store.records.clear();
    person("p2", { applicationId: "", journeyPath: "relationship_first", admission: "", payment: "", journeyAction: "contacted" });
    const res = await post("/api/admin/labels/person/action", { recordId: "p2", action: "keep_informed", expectedUpdatedAt: 10 });
    expect(res.status).toBe(200);
    const f = store.records.get("p2").fields;
    expect(f.journeyAction).toBe("keep_informed");
    expect(f.revisitAt).toBeGreaterThan(NOW + 89 * DAY);
    expect(store.activities.find((a) => a.kind === "task")).toMatchObject({ recordId: "p2", dueAt: f.revisitAt });
    expect(store.audits[0].meta).toMatchObject({ journeyEvent: "action_changed", from: "contacted", to: "keep_informed", method: "manual", actor: "user_tori" });
  });

  it("Invited needs a live Waive interview decision for their email", async () => {
    person("p3", { applicationId: "", journeyPath: "relationship_first", admission: "", payment: "", journeyAction: "soft_commit" });
    const without = await post("/api/admin/labels/person/action", { recordId: "p3", action: "invited", expectedUpdatedAt: 10 });
    expect(without.status).toBe(400);
    const withGrant = await post("/api/admin/labels/person/action", { recordId: "p3", action: "invited", expectedUpdatedAt: 10 },
      ctx({ dbOpts: { grants: [{ id: "g1", decision: "waive_interview", active: true, emailNormalized: "sample@example.com" }] } }));
    expect(withGrant.status).toBe(200);
    expect(store.records.get("p3").fields.journeyAction).toBe("invited");
  });

  it("keeps a tagged Partner off the signup journey", async () => {
    person("p30", { applicationId: "", journeyPath: "relationship_first", admission: "", payment: "", journeyAction: "identified" });
    store.records.get("p30").tags = ["partner"];
    const res = await post("/api/admin/labels/person/action", { recordId: "p30", action: "contacted", expectedUpdatedAt: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tagged Partner/);
  });

  it("refuses a screen that is out of date, and changes nothing", async () => {
    person("p4", { applicationId: "", journeyPath: "relationship_first", admission: "", payment: "", journeyAction: "identified" });
    const res = await post("/api/admin/labels/person/action", { recordId: "p4", action: "contacted", expectedUpdatedAt: 3 });
    expect(res.status).toBe(409);
    expect(store.records.get("p4").fields.journeyAction).toBe("identified");
  });
});

describe("Suggested update", () => {
  const suggested = { applicationId: "", journeyPath: "relationship_first", admission: "", payment: "", journeyAction: "contacted", proposedAction: "intro_booked", proposalEvidence: "calendar:ev1", proposalReason: "Found", journeyFlags: "flag:move-to-confirm" };

  it("Confirm moves them and clears the suggestion", async () => {
    person("p5", suggested);
    const res = await post("/api/admin/labels/person/action", { recordId: "p5", action: "intro_booked", method: "confirmed", evidence: "calendar:ev1", expectedUpdatedAt: 10 });
    expect(res.status).toBe(200);
    const f = store.records.get("p5").fields;
    expect(f).toMatchObject({ journeyAction: "intro_booked", proposedAction: "", proposalEvidence: "" });
    expect(store.audits[0].meta).toMatchObject({ method: "confirmed", sourceType: "proposal", sourceId: "calendar:ev1" });
  });

  it("Confirm on a suggestion that has changed is refused", async () => {
    person("p6", suggested);
    const res = await post("/api/admin/labels/person/action", { recordId: "p6", action: "intro_booked", method: "confirmed", evidence: "calendar:OLD", expectedUpdatedAt: 10 });
    expect(res.status).toBe(409);
    expect(store.records.get("p6").fields.journeyAction).toBe("contacted");
  });

  it("Dismiss records the evidence so it never returns, and clears the flag", async () => {
    person("p7", suggested);
    const res = await post("/api/admin/labels/person/dismiss", { recordId: "p7", action: "intro_booked", evidence: "calendar:ev1", expectedUpdatedAt: 10 });
    expect(res.status).toBe(200);
    expect(store.audits[0].meta).toMatchObject({ journeyEvent: "proposal_dismissed", to: "intro_booked", evidence: "calendar:ev1" });
    expect(store.records.get("p7").fields).toMatchObject({ proposedAction: "", journeyFlags: "" });
  });
});

describe("Save decision (after the call)", () => {
  it("records that the call took place, then the outcome, as two dated steps, and clears Attendance unconfirmed", async () => {
    person("p8", { journeyAction: "conversation_booked", journeyFlags: "flag:attendance-unconfirmed" });
    const res = await post("/api/admin/labels/person/outcome", { recordId: "p8", outcome: "fit", expectedUpdatedAt: 10 });
    expect(res.status).toBe(200);
    expect(res.body.recorded).toEqual(["conversation_held", "fit"]);
    expect(store.audits.map((a) => [a.meta.from, a.meta.to])).toEqual([["conversation_booked", "conversation_held"], ["conversation_held", "fit"]]);
    expect(store.records.get("p8").fields).toMatchObject({ journeyAction: "fit", journeyFlags: "" });
  });

  it("is safe to send again after the operation failed: nothing is recorded twice", async () => {
    person("p9", { journeyAction: "fit" });
    const res = await post("/api/admin/labels/person/outcome", { recordId: "p9", outcome: "fit", expectedUpdatedAt: 10 });
    expect(res.status).toBe(200);
    expect(res.body.recorded).toEqual([]);
    expect(store.audits).toEqual([]);
  });

  it("refuses someone with no booked or held call, and an unknown outcome", async () => {
    person("p10", { journeyAction: "paid" });
    expect((await post("/api/admin/labels/person/outcome", { recordId: "p10", outcome: "fit", expectedUpdatedAt: 10 })).status).toBe(400);
    person("p11", { journeyAction: "conversation_booked" });
    expect((await post("/api/admin/labels/person/outcome", { recordId: "p11", outcome: "approved", expectedUpdatedAt: 10 })).status).toBe(400);
  });

  it("refuses Not a paid fit for someone who owes nothing", async () => {
    person("p12", { journeyAction: "conversation_booked", payment: "not_required" });
    expect((await post("/api/admin/labels/person/outcome", { recordId: "p12", outcome: "not_paid_fit", expectedUpdatedAt: 10 })).status).toBe(400);
  });
});

describe("They missed the call", () => {
  const booked = (startAt = NOW - DAY) => ({ meetings: [{ id: "m1", applicationId: "app1", status: "scheduled", startAt, createdAt: NOW - 3 * DAY }] });

  it("reopens booking, steps a paid member back to Paid, records the missed time, and sends the missed-call email once", async () => {
    person("p13", { journeyAction: "conversation_booked", journeyFlags: "flag:attendance-unconfirmed" });
    const res = await post("/api/admin/labels/person/no-show", { recordId: "p13", expectedUpdatedAt: 10 }, ctx({ dbOpts: booked() }));
    expect(res.status).toBe(200);
    expect(res.body.emailed).toBe(true);
    expect(store.transacts[0]).toEqual([
      { t: "update", ns: "meetings", id: "m1", attrs: { status: "cancelled", drift: "none" } },
      { t: "update", ns: "applications", id: "app1", attrs: { meetingAt: 0, meetingLink: "" } },
    ]);
    expect(store.records.get("p13").fields).toMatchObject({ journeyAction: "paid", journeyFlags: "" });
    expect(store.audits[0].meta).toMatchObject({ journeyEvent: "no_show", to: "paid", meetingKey: `m1:${NOW - DAY}` });
    expect(store.sends).toHaveLength(1);
    expect(store.sends[0]).toMatchObject({ template: "missedCallRebook", to: "sample@example.com", dedupeKey: `no-show-rebook:app1:m1:${NOW - DAY}` });
  });

  it("steps someone who owes nothing back to Applied", async () => {
    person("p14", { journeyAction: "conversation_booked", payment: "not_required" });
    await post("/api/admin/labels/person/no-show", { recordId: "p14", expectedUpdatedAt: 10 }, ctx({ dbOpts: booked() }));
    expect(store.records.get("p14").fields.journeyAction).toBe("applied");
  });

  it("falls back to the booking reminder while the missed-call email is not installed", async () => {
    person("p15", { journeyAction: "conversation_booked" });
    store.sendResult = (msg) => (msg.template === "missedCallRebook" ? { sent: false, reason: "template-missing" } : { sent: true });
    const res = await post("/api/admin/labels/person/no-show", { recordId: "p15", expectedUpdatedAt: 10 }, ctx({ dbOpts: booked() }));
    expect(store.sends.map((s) => s.template)).toEqual(["missedCallRebook", "bookingReminder"]);
    expect(res.body.emailed).toBe(true);
  });

  it("says emailed: false when the email does not send, and still records the missed call", async () => {
    person("p16", { journeyAction: "conversation_booked" });
    store.sendResult = { sent: false, reason: "provider-error" };
    const res = await post("/api/admin/labels/person/no-show", { recordId: "p16", expectedUpdatedAt: 10 }, ctx({ dbOpts: booked() }));
    expect(res.body.emailed).toBe(false);
    expect(store.records.get("p16").fields.journeyAction).toBe("paid");
  });

  it("only works on a booked call, and refuses an out-of-date screen", async () => {
    person("p17", { journeyAction: "paid" });
    expect((await post("/api/admin/labels/person/no-show", { recordId: "p17", expectedUpdatedAt: 10 }, ctx({ dbOpts: booked() }))).status).toBe(400);
    person("p18", { journeyAction: "conversation_booked" });
    const stale = await post("/api/admin/labels/person/no-show", { recordId: "p18", expectedUpdatedAt: 2 }, ctx({ dbOpts: booked() }));
    expect(stale.status).toBe(409);
    expect(store.sends).toEqual([]);
  });
});
