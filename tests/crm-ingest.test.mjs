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
    updateRecord: vi.fn(async (_deps, opts) => {
      const r = store.records.find((x) => x.id === opts.id);
      if (r) r.updated = { ...r.updated, ...opts.input };
      return { id: opts.id };
    }),
  };
});

import {
  ingestMeeting,
  ingestBatch,
  parseDue,
  isSelfEmail,
  callLabelForStage,
  CALL_LABELS,
} from "../src/crm-ingest.mjs";
import { crm } from "../src/crm.mjs";

const CALL_COUNT_SLOT = crm.config.types.person.fields.callCount.slot;
const LAST_CALL_SLOT = crm.config.types.person.fields.lastCallAt.slot;

// A db whose crm_record lookup answers from the same in-memory store, so a
// person created by one call is found by the next (the real resolution path).
// Committed counter values are reflected back onto the row the way a real
// read-after-write would, so replay and out-of-order behaviour is genuinely
// exercised rather than assumed.
const db = {
  async query(q) {
    const want = q.crm_record?.$?.where?.primaryEmail;
    const hit = store.records.find((r) => r.input?.email === want);
    if (!hit) return { crm_record: [] };
    const row = { id: hit.id, stage: hit.stage };
    if (hit.updated?.callCount != null) row[CALL_COUNT_SLOT] = hit.updated.callCount;
    if (hit.updated?.lastCallAt != null) row[LAST_CALL_SLOT] = hit.updated.lastCallAt;
    return { crm_record: [row] };
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
  it("creates the external attendee as a prospect and skips the chapter's own address", async () => {
    const res = await ingestMeeting(db, MEETING);

    expect(store.records).toHaveLength(1);
    const person = store.records[0];
    expect(person.input.email).toBe("sharlene@example.com"); // normalized
    expect(person.input.name).toBe("Sharlene Wells");
    // Someone who turned up on a call is, by definition, someone Tori wanted
    // a conversation with.
    expect(person.stage).toBe("prospect");
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

// Conversation (before she applied) vs Member call (after). Tori's GTM
// vocabulary, decided 2026-09-24.
describe("call labels", () => {
  const call = () => store.activities.find((a) => a.kind === "call");

  it("maps every pre-application stage to Conversation", () => {
    for (const s of ["prospect", "conversation_booked", "soft_commit"]) {
      expect(callLabelForStage(s)).toBe(CALL_LABELS.conversation);
    }
  });

  it("maps every application stage to Member call", () => {
    for (const s of ["submitted", "paid_pending_vetting", "call_scheduled", "interviewed", "approved"]) {
      expect(callLabelForStage(s)).toBe(CALL_LABELS.member);
    }
  });

  it("treats an unknown or missing stage as pre-application", () => {
    expect(callLabelForStage("")).toBe(CALL_LABELS.conversation);
    expect(callLabelForStage(undefined)).toBe(CALL_LABELS.conversation);
  });

  it("labels a new person's call a Conversation, in the body and in meta", async () => {
    await ingestMeeting(db, MEETING);
    expect(call().body.startsWith("Conversation: ")).toBe(true);
    expect(call().meta.callLabel).toBe("Conversation");
    expect(call().meta.stageAtCall).toBe("prospect");
  });

  it("labels an approved member's call a Member call", async () => {
    store.records.push({ id: "seed", input: { email: "sharlene@example.com" }, stage: "approved" });
    await ingestMeeting(db, MEETING);
    expect(call().body.startsWith("Member call: ")).toBe(true);
    expect(call().meta.callLabel).toBe("Member call");
  });

  it("does not relabel earlier conversations once she applies", async () => {
    store.records.push({ id: "seed", input: { email: "sharlene@example.com" }, stage: "prospect" });
    await ingestMeeting(db, MEETING);
    store.records[0].stage = "approved";
    await ingestMeeting(db, { ...MEETING, meetingId: "later" });

    const calls = store.activities.filter((a) => a.kind === "call");
    expect(calls).toHaveLength(2);
    // What actually happened, not what is true now.
    expect(calls[0].meta.callLabel).toBe("Conversation");
    expect(calls[1].meta.callLabel).toBe("Member call");
  });
});

// Tori's raw shorthand from a meeting. Kept separate from the clean summary,
// and kept away from the parent.
describe("private notes", () => {
  const withPrivate = { ...MEETING, privateNotes: "karen marriott. spv. loon creek." };

  it("lands as its own note activity, not appended to the call", async () => {
    await ingestMeeting(db, withPrivate);
    const call = store.activities.find((a) => a.kind === "call");
    const note = store.activities.find((a) => a.kind === "note");
    expect(note).toBeTruthy();
    expect(note.body).toBe("karen marriott. spv. loon creek.");
    expect(call.body).not.toContain("loon creek");
  });

  it("is flagged private so a view can filter it out", async () => {
    await ingestMeeting(db, withPrivate);
    expect(store.activities.find((a) => a.kind === "note").meta.private).toBe(true);
  });

  it("does not count as a call, so it can never reach Built Not Found", async () => {
    await ingestMeeting(db, withPrivate);
    // Counters are the only call-derived values in the BNF allowlist, and a
    // private note must not touch them.
    expect(store.records[0].updated.callCount).toBe(1);
    expect(store.records[0].updated.lastCallAt).toBe(MEETING.occurredAt);
  });

  it("is not duplicated on replay", async () => {
    await ingestMeeting(db, withPrivate);
    await ingestMeeting(db, withPrivate);
    expect(store.activities.filter((a) => a.kind === "note")).toHaveLength(1);
  });

  it("is simply absent when the meeting has none", async () => {
    await ingestMeeting(db, MEETING);
    expect(store.activities.filter((a) => a.kind === "note")).toHaveLength(0);
  });
});

// The two values that cross to Built Not Found. Everything asserted here is
// about them staying truthful, because the parent sorts on them.
describe("relationship temperature counters", () => {
  const only = (over = {}) => ({ ...MEETING, actionItems: [], ...over });
  const person = () => store.records[0];

  it("uses two distinct pre-declared slots, so no new schema attribute is needed", () => {
    expect(CALL_COUNT_SLOT).toBe("n1");
    expect(LAST_CALL_SLOT).toBe("d1");
    expect(CALL_COUNT_SLOT).not.toBe(LAST_CALL_SLOT);
  });

  it("stamps the first call", async () => {
    await ingestMeeting(db, only());
    expect(person().updated.callCount).toBe(1);
    expect(person().updated.lastCallAt).toBe(MEETING.occurredAt);
  });

  it("does not inflate the count on replay", async () => {
    await ingestMeeting(db, only());
    await ingestMeeting(db, only());
    await ingestMeeting(db, only());
    expect(person().updated.callCount).toBe(1);
  });

  it("increments on a genuinely new call and moves the date forward", async () => {
    await ingestMeeting(db, only());
    await ingestMeeting(db, only({ meetingId: "later", occurredAt: 1_900_000_000_000 }));
    expect(person().updated.callCount).toBe(2);
    expect(person().updated.lastCallAt).toBe(1_900_000_000_000);
  });

  it("backfilling an older call counts it without making the person look colder", async () => {
    await ingestMeeting(db, only({ meetingId: "recent", occurredAt: 1_900_000_000_000 }));
    await ingestMeeting(db, only({ meetingId: "ancient", occurredAt: 1_500_000_000_000 }));
    expect(person().updated.callCount).toBe(2);
    expect(person().updated.lastCallAt).toBe(1_900_000_000_000);
  });

  it("counts per person, not per meeting", async () => {
    await ingestMeeting(
      db,
      only({ attendees: [{ email: "a@example.com" }, { email: "b@example.com" }] }),
    );
    expect(store.records).toHaveLength(2);
    expect(store.records[0].updated.callCount).toBe(1);
    expect(store.records[1].updated.callCount).toBe(1);
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
