// Partners and Team (src/relationship-groups.mjs): tagged people stay in the
// CRM but never get a Path or an Action, from the job, the dashboard or the
// Action tab. And a person's second email finds them when they apply with it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const crmState = vi.hoisted(() => ({ people: [], tags: {}, updates: [], activities: {} }));
vi.mock("@odla-ai/crm", async (orig) => ({
  ...(await orig()),
  listRecords: vi.fn(async (_deps, params) => {
    const live = crmState.people.filter((p) => !p.archived);
    const records = params.tag ? live.filter((p) => (crmState.tags[p.id] ?? []).includes(params.tag)) : live;
    return { records, total: records.length };
  }),
  listActivities: vi.fn(async (_deps, { recordId }) => crmState.activities[recordId] ?? []),
  getRecord: vi.fn(async (_deps, id) => crmState.people.find((p) => p.id === id) ?? null),
  updateRecord: vi.fn(async (_deps, input) => { crmState.updates.push(input); return {}; }),
  addActivity: vi.fn(async () => ({})),
}));

const { groupMembers, loadRelationships, relationshipsRoute, RELATIONSHIPS_PATH } = await import("../src/relationship-groups.mjs");
const { runLabels } = await import("../src/labels-job.mjs");
const { labelsRoute, loadJourneyPeople, LABELS_ACTION_PATH } = await import("../src/labels-route.mjs");

const CHAPTER = "silver-and-salt-capital";
const person = (id, name, email, fields = {}) => ({ id, type: "person", name, primaryEmail: email, updatedAt: 1, fields: { email, ...fields } });

function fakeDb(apps) {
  return {
    query: vi.fn(async (q) => {
      const out = {};
      for (const ns of Object.keys(q)) out[ns] = ns === "applications" ? apps : [];
      return out;
    }),
    transact: vi.fn(async () => ({})),
  };
}

const ctxFor = (db) => ({ chapter: { id: CHAPTER, config: {} }, makeDb: () => db, verifyUser: async () => ({ userId: "tori" }), isAdmin: async () => true });

beforeEach(() => {
  crmState.people = [
    person("p1", "Jane Partner", "jane@partner.org", { organization: "Invest for Better" }),
    person("p2", "Tom Team", "tom@example.com"),
    person("p3", "Ann Community", "ann@work.com", { secondaryEmail: "ann@home.com" }),
  ];
  crmState.tags = { p1: ["partner"], p2: ["team"] };
  crmState.updates = [];
  crmState.activities = {};
});

describe("groupMembers", () => {
  it("maps each tagged person to their group and leaves everyone else out", async () => {
    const groups = await groupMembers({ db: {} });
    expect([...groups]).toEqual([["p1", "partner"], ["p2", "team"]]);
  });

  it("reads someone tagged both as a Partner", async () => {
    crmState.tags.p2 = ["team", "partner"];
    expect((await groupMembers({ db: {} })).get("p2")).toBe("partner");
  });
});

describe("the labels job", () => {
  const apps = [
    { id: "a1", groupId: CHAPTER, email: "jane@partner.org", status: "submitted", createdAt: 1 },
    { id: "a3", groupId: CHAPTER, email: "ann@home.com", status: "submitted", createdAt: 1 },
  ];

  it("never plans labels for a Partner, even when she applies", async () => {
    const { summary, plans } = await runLabels(fakeDb(apps), CHAPTER, undefined, { write: false });
    expect(plans.map((p) => p.record.id)).not.toContain("p1");
    expect(summary.grouped).toBe(1);
  });

  it("finds a person who applies with their second email", async () => {
    const { summary, plans } = await runLabels(fakeDb(apps), CHAPTER, undefined, { write: false });
    expect(plans.map((p) => p.record.id)).toContain("p3");
    expect(summary.unmatched).toBe(0);
  });

  it("lets a main email win when it is also someone else's second email", async () => {
    crmState.people.push(person("p4", "Home Owner", "ann@home.com"));
    const { plans } = await runLabels(fakeDb(apps), CHAPTER, undefined, { write: false });
    expect(plans.find((p) => p.app.id === "a3").record.id).toBe("p4");
  });

  it("skips a tagged prospect's flag refresh", async () => {
    crmState.people[1].fields.journeyAction = "identified";
    const { plans } = await runLabels(fakeDb([]), CHAPTER, undefined, { write: false });
    expect(plans.map((p) => p.record.id)).not.toContain("p2");
  });
});

describe("the Journeys dashboard and the Action tab", () => {
  it("leaves Partners and Team off the dashboard", async () => {
    const people = await loadJourneyPeople({ db: {} });
    expect(people.map((p) => p.id)).toEqual(["p3"]);
  });

  it("refuses an Action for a Partner, naming the tag to remove", async () => {
    const req = new Request(`https://x.test${LABELS_ACTION_PATH}`, { method: "POST", body: JSON.stringify({ recordId: "p1", action: "contacted" }) });
    const res = await labelsRoute(req, new URL(req.url), {}, ctxFor(fakeDb([])));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tagged Partner.*partner tag/);
    expect(crmState.updates).toHaveLength(0);
  });
});

describe("GET /api/admin/relationships", () => {
  const get = (query, ctx = ctxFor(fakeDb([]))) => {
    const req = new Request(`https://x.test${RELATIONSHIPS_PATH}${query}`);
    return relationshipsRoute(req, new URL(req.url), {}, ctx);
  };

  it("lists a group with its organization, open follow-ups and latest note", async () => {
    crmState.activities.p1 = [
      { kind: "note", body: "Older note", createdAt: 1 },
      { kind: "note", body: "Talked about the spring course", createdAt: 5 },
      { kind: "task", body: "Send the deck", status: "open", createdAt: 3 },
      { kind: "task", body: "Done already", status: "done", createdAt: 2 },
    ];
    const res = await get("?group=partner");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.people).toEqual([
      expect.objectContaining({ id: "p1", organization: "Invest for Better", openTasks: 1, latestNote: { body: "Talked about the spring course", at: 5 } }),
    ]);
  });

  it("refuses an unknown group and anyone who is not an admin", async () => {
    expect((await get("?group=community")).status).toBe(400);
    expect((await get("?group=team", { ...ctxFor(fakeDb([])), isAdmin: async () => false })).status).toBe(403);
  });

  it("passes other paths through", async () => {
    const req = new Request("https://x.test/api/other");
    expect(await relationshipsRoute(req, new URL(req.url), {}, ctxFor(fakeDb([])))).toBeNull();
  });

  it("sorts by name", async () => {
    crmState.tags.p3 = ["partner"];
    expect((await loadRelationships({ db: {} }, "partner")).map((p) => p.name)).toEqual(["Ann Community", "Jane Partner"]);
  });
});
