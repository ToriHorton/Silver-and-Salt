// Call ingest lands on the live record (src/crm-ingest.mjs lookupPerson).
// Since the 2026-10-14 contact upload and its repair, some emails have two
// crm_record rows: the live original and an archived duplicate. A new call
// must never attach to the archived one, and must never create a third.
import { describe, expect, it, vi } from "vitest";

const created = vi.hoisted(() => []);
vi.mock("@odla-ai/crm", async (orig) => ({
  ...(await orig()),
  createRecord: vi.fn(async (_deps, opts) => { created.push(opts); return { id: "new" }; }),
  addTag: vi.fn(async () => ({})),
}));

const { bestRow, findPerson, lookupPerson, resolvePerson } = await import("../src/crm-ingest.mjs");

// A db that answers the primary-email lookup and the person scan from rows.
function dbOf(rows) {
  return {
    async query(q) {
      const where = q.crm_record?.$?.where ?? {};
      const hits = rows.filter((r) => (where.primaryEmail === undefined || r.primaryEmail === where.primaryEmail));
      return { crm_record: hits.slice(0, q.crm_record?.$?.limit ?? 1000) };
    },
  };
}

const live = { id: "orig", primaryEmail: "rocky@mavenslc.com", archived: false, createdAt: 1 };
const dup = { id: "dup", primaryEmail: "rocky@mavenslc.com", archived: true, createdAt: 9 };

describe("bestRow", () => {
  it("prefers live over archived, then the oldest", () => {
    expect(bestRow([dup, live]).id).toBe("orig");
    expect(bestRow([{ id: "b", createdAt: 5 }, { id: "a", createdAt: "1970-01-01T00:00:00.002Z" }]).id).toBe("a");
    expect(bestRow([])).toBeNull();
  });
});

describe("lookupPerson", () => {
  it("finds the live original when an archived duplicate shares the email", async () => {
    expect((await lookupPerson(dbOf([dup, live]), "Rocky@MavenSLC.com")).id).toBe("orig");
  });

  it("reads a second email from the row's fields, and prefers a live second-email match over an archived main one", async () => {
    const archivedMain = { id: "old", primaryEmail: "ann@home.com", archived: true, createdAt: 1 };
    const liveWork = { id: "ann", primaryEmail: "ann@work.com", archived: false, createdAt: 2, fields: { secondaryEmail: "ann@home.com" } };
    expect((await lookupPerson(dbOf([archivedMain, liveWork]), "ann@home.com")).id).toBe("ann");
  });

  it("reads fields stored as a JSON string", async () => {
    const row = { id: "j", primaryEmail: "j@work.com", fields: JSON.stringify({ secondaryEmail: "j@home.com" }) };
    expect((await findPerson(dbOf([row]), "j@home.com")).id).toBe("j");
  });

  it("falls back to an archived record when it is the only one", async () => {
    expect((await lookupPerson(dbOf([dup]), "rocky@mavenslc.com")).id).toBe("dup");
  });

  it("answers null for an unknown or empty email", async () => {
    expect(await lookupPerson(dbOf([live]), "nobody@example.com")).toBeNull();
    expect(await lookupPerson(dbOf([live]), "")).toBeNull();
  });
});

describe("resolvePerson", () => {
  it("attaches a call to the live original and creates no one", async () => {
    created.length = 0;
    const res = await resolvePerson(dbOf([dup, live]), { email: "rocky@mavenslc.com", name: "Rocky" });
    expect(res).toMatchObject({ recordId: "orig", created: false });
    expect(created).toHaveLength(0);
  });
});
