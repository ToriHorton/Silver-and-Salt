// Tests for the meeting/call ingest mapper (src/crm-ingest.mjs).
//
// The @odla-ai/crm write functions are mocked by a small in-memory store that
// honours `mutationId` exactly the way the real ones do (same id => duplicate,
// no second row). That is the property the whole design leans on: it is what
// replaces the old hand-maintained decision ledger, so it is asserted directly
// rather than assumed.

import { describe, expect, it, beforeEach, vi } from "vitest";

const store = vi.hoisted(() => ({
  records: [],
  activities: [],
  tags: [],
  origins: [],
  mutations: new Set(),
  reset() {
    this.records = [];
    this.activities = [];
    this.tags = [];
    this.origins = [];
    this.mutations = new Set();
  },
}));

vi.mock("@odla-ai/crm", () => {
  // Shared mutationId gate, mirroring the real package's replay semantics.
  const gate = (mutationId) => {
    if (!mutationId) return false;
    if (store.mutations.has(mutationId)) return true;
    store.mutations.add(mutationId);
    return false;
  };
  return {
    defineCrm: (config) => ({ config }),
    createRecord: vi.fn(async (_deps, opts) => {
      const id = `rec_${store.records.length + 1}`;
      store.records.push({ id, ...opts });
      return { id };
    }),
    addActivity: vi.fn(async (_deps, opts) => {
      if (gate(opts.mutationId)) return { id: "dup", duplicate: true };
      const id = `act_${store.activities.length + 1}`;
      store.activities.push({ id, ...opts });
      return { id, duplicate: false };
    }),
    addTag: vi.fn(async (_deps, opts) => {
      if (gate(opts.mutationId)) return { tag: opts.tag, duplicate: true };
      store.tags.push(opts);
      return { tag: opts.tag, duplicate: false };
    }),
    upsertRecordOrigin: vi.fn(async (_deps, opts) => {
      if (gate(opts.mutationId)) return { origin: opts, duplicate: true };
      store.origins.push(opts);
      return { origin: opts, duplicate: false };
    }),
  };
});

import {
  ingestMeeting,
  ingestBatch,
  parseDue,
  isSelfEmail,
} from "../src/crm-ingest.mjs";

// A db whose crm_record lookup answers from the same in-memory store, so a
// person created by one call is found by the next (the real resolution path).
const db = {
  async query(q) {
    const want = q.crm_record?.$?.where?.primaryEmail;
    const hit = store.records.find((r) => r.input?.email === want);
    return { crm_record: hit ? [{ id: hit.id }] : [] };
  },
};

const MEETING = {
  sourceId: "granola",
  meetingId: "mtg-abc",
  title: "Intro call with Sharlene Wells",
  summary: "Talked through the founding tier and the retreat.",
  url: "https://granola.example/mtg-abc",
  kind: "call",
  occurredAt: 1_800_000_000_000,
  attendees: [
    { email: "Sharlene@Example.com", name: "Sharlene Wells" },
    { email: "tori@silverandsaltcapital.com", name: "Tori Horton" },
  ],
  actionItems: [
    { text: "Send Sharlene the founding member prospectus", due: "2026-10-01" },
    { text: "Confirm the retreat date", owner: "Millicent", due: "" },
  ],
};

beforeEach(() => store.reset());

describe("parseDue", () => {
  it("anchors a YYYY-MM-DD date at noon UTC so it cannot roll back a day", () => {
    const ms = parseDue("2026-10-01");
    expect(new Date(ms).toISOString()).toBe("2026-10-01T12:00:00.000Z");
    // Still the 1st when read in Utah (UTC-6), which midnight would not be.
    const utah = new Date(ms).toLocaleDateString("en-US", { timeZone: "America/Denver" });
    expect(utah).toBe("10/1/2026");
  });

  it("passes a numeric timestamp through and drops anything unparseable", () => {
    expect(parseDue(1_800_000_000_000)).toBe(1_800_000_000_000);
    expect(parseDue("next Friday")).toBeUndefined();
    expect(parseDue("")).toBeUndefined();
    expect(parseDue(undefined)).toBeUndefined();
  });
});

describe("isSelfEmail", () => {
  it("treats the chapter's own domain as self, and outsiders as not", () => {
    expect(isSelfEmail("tori@silverandsaltcapital.com")).toBe(true);
    expect(isSelfEmail("anyone@silverandsaltcapital.com")).toBe(true);
    expect(isSelfEmail("sharlene@example.com")).toBe(false);
    expect(isSelfEmail("")).toBe(true);
  });
});

describe("ingestMeeting", () => {
  it("creates the external attendee as a candidate and skips the chapter's own address", async () => {
    const res = await ingestMeeting(db, MEETING);

    expect(store.records).toHaveLength(1);
    const person = store.records[0];
    expect(person.input.email).toBe("sharlene@example.com"); // normalized
    expect(person.input.name).toBe("Sharlene Wells");
    expect(person.stage).toBe("candidate");
    expect(res.createdPeople).toEqual(["sharlene@example.com"]);
  });

  it("marks an auto-created person unsubscribed, so they cannot be swept into a marketing blast", async () => {
    await ingestMeeting(db, MEETING);
    expect(store.records[0].emailConsent).toEqual({
      state: "unsubscribed",
      source: "crm-ingest:auto-created",
    });
    expect(store.tags.map((t) => t.tag)).toContain("auto-created");
  });

  it("writes the call to the person's feed with the meeting in meta", async () => {
    await ingestMeeting(db, MEETING);
    const call = store.activities.find((a) => a.kind === "call");
    expect(call).toBeTruthy();
    expect(call.body).toContain("Intro call with Sharlene Wells");
    expect(call.body).toContain("founding tier");
    expect(call.meta.meetingId).toBe("mtg-abc");
    expect(call.meta.url).toBe("https://granola.example/mtg-abc");
    expect(call.meta.attendees).toEqual(["sharlene@example.com"]);
  });

  it("turns action items into tasks, carrying due dates and delegating via waitingOn", async () => {
    await ingestMeeting(db, MEETING);
    const tasks = store.activities.filter((a) => a.kind === "task");
    expect(tasks).toHaveLength(2);

    expect(tasks[0].body).toBe("Send Sharlene the founding member prospectus");
    expect(tasks[0].dueAt).toBe(parseDue("2026-10-01"));
    expect(tasks[0].waitingOn).toBeUndefined();

    // Someone else's move: lands on the waiting board, not Tori's open list.
    expect(tasks[1].waitingOn).toBe("Millicent");
    expect(tasks[1].dueAt).toBeUndefined();
  });

  it("is idempotent on replay: the same meeting twice adds nothing the second time", async () => {
    const first = await ingestMeeting(db, MEETING);
    const activitiesAfterFirst = store.activities.length;
    const recordsAfterFirst = store.records.length;

    const second = await ingestMeeting(db, MEETING);

    expect(store.activities).toHaveLength(activitiesAfterFirst);
    expect(store.records).toHaveLength(recordsAfterFirst);

    expect(first.activitiesWritten).toBe(1);
    expect(first.tasksWritten).toBe(2);
    expect(second.activitiesWritten).toBe(0);
    expect(second.tasksWritten).toBe(0);
    expect(second.activitiesDuplicate).toBe(1);
    expect(second.tasksDuplicate).toBe(2);
    expect(second.createdPeople).toEqual([]); // resolved the existing person
  });

  it("puts the call on every external attendee but the tasks on only one", async () => {
    await ingestMeeting(db, {
      ...MEETING,
      attendees: [
        { email: "a@example.com", name: "Ann" },
        { email: "b@example.com", name: "Bea" },
      ],
    });
    expect(store.activities.filter((a) => a.kind === "call")).toHaveLength(2);
    expect(store.activities.filter((a) => a.kind === "task")).toHaveLength(2);
  });

  it("reports action items as unattached rather than parking them on a stranger", async () => {
    const res = await ingestMeeting(db, {
      ...MEETING,
      attendees: [{ email: "tori@silverandsaltcapital.com", name: "Tori" }],
    });
    expect(store.records).toHaveLength(0);
    expect(store.activities).toHaveLength(0);
    expect(res.unattached).toEqual([
      "Send Sharlene the founding member prospectus",
      "Confirm the retreat date",
    ]);
  });

  it("refuses a meeting with no id, since it would have no idempotency anchor", async () => {
    await expect(ingestMeeting(db, { ...MEETING, meetingId: "" })).rejects.toThrow(
      /meetingId is required/,
    );
  });

  it("never writes a stage_change or system activity, whatever kind is asked for", async () => {
    await ingestMeeting(db, { ...MEETING, kind: "stage_change" });
    const kinds = store.activities.map((a) => a.kind);
    expect(kinds).not.toContain("stage_change");
    expect(kinds).toContain("meeting"); // fell back to the safe default
  });
});

describe("ingestBatch", () => {
  it("keeps going when one meeting is malformed, and reports the failure", async () => {
    const res = await ingestBatch(db, {
      meetings: [MEETING, { title: "no id here" }],
    });
    expect(res.meetings).toBe(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].error).toMatch(/meetingId is required/);
    expect(res.activitiesWritten).toBe(1);
    expect(res.tasksWritten).toBe(2);
  });

  it("handles an empty or absent payload without throwing", async () => {
    await expect(ingestBatch(db, {})).resolves.toMatchObject({ meetings: 0 });
    await expect(ingestBatch(db, null)).resolves.toMatchObject({ meetings: 0 });
  });
});
