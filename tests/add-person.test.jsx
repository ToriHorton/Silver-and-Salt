// Add person in the admin People workspace (src/add-person.mjs and
// src/app/admin/add-person.jsx): one person at a time, found by either email
// before anyone is created, the same as the contact-list upload.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "preact-render-to-string";

const crmState = vi.hoisted(() => ({ people: [], created: [], tags: [] }));
vi.mock("@odla-ai/crm", async (orig) => ({
  ...(await orig()),
  listRecords: vi.fn(async (_deps, params) => {
    const records = crmState.people.filter((p) => !!p.archived === !!params.archived);
    return { records, total: records.length };
  }),
  createRecord: vi.fn(async (_deps, opts) => { crmState.created.push(opts); return { id: "new1", duplicate: false, record: {} }; }),
  addTag: vi.fn(async (_deps, opts) => { crmState.tags.push(opts); return {}; }),
}));

const { ADD_PERSON_PATH, addPersonRoute, findExisting, planPerson } = await import("../src/add-person.mjs");
const { AddPerson } = await import("../src/app/admin/add-person.jsx");

const person = (id, name, email, fields = {}, archived = false) => ({ id, type: "person", name, primaryEmail: email, archived, fields: { email, ...fields } });
const ctx = (admin = true) => ({ makeDb: () => ({}), verifyUser: async () => ({ userId: "tori" }), isAdmin: async () => admin });
const call = (body, c = ctx()) =>
  addPersonRoute(new Request("https://x" + ADD_PERSON_PATH, { method: "POST", body: JSON.stringify(body) }), new URL("https://x" + ADD_PERSON_PATH), {}, c);

beforeEach(() => {
  crmState.people = [
    person("p1", "Ann Live", "ann@work.com", { secondaryEmail: "ann@home.com" }),
    person("p2", "Bea Archived", "bea@example.com", {}, true),
  ];
  crmState.created = [];
  crmState.tags = [];
});

describe("planPerson", () => {
  it("needs a name and a valid email", () => {
    expect(planPerson({ email: "a@b.co" }).error).toBe("Add their name.");
    expect(planPerson({ name: "A", email: "nope" }).error).toBe("Add a valid email address.");
  });

  it("lowercases emails, trims fields and drops blanks", () => {
    const { input } = planPerson({ name: " Cara New ", email: " Cara@Ex.com ", organization: " IFB ", title: "  " });
    expect(input).toEqual({ name: "Cara New", email: "cara@ex.com", organization: "IFB" });
  });

  it("refuses an unknown group and a second email equal to the first", () => {
    expect(planPerson({ name: "A", email: "a@b.co", group: "vip" }).error).toMatch(/Group/);
    expect(planPerson({ name: "A", email: "a@b.co", secondaryEmail: "A@b.co" }).error).toMatch(/same/);
  });

  it("subscribes only when ticked; Community otherwise starts unsubscribed, Partner and Team unasked", () => {
    expect(planPerson({ name: "A", email: "a@b.co", optedIn: true }).emailConsent.state).toBe("subscribed");
    expect(planPerson({ name: "A", email: "a@b.co" }).emailConsent.state).toBe("unsubscribed");
    expect(planPerson({ name: "A", email: "a@b.co", group: "partner" }).emailConsent).toBeNull();
  });
});

describe("findExisting", () => {
  it("matches either address and prefers a live record", () => {
    const people = [person("old", "Ann", "ann@work.com", {}, true), ...crmState.people];
    expect(findExisting(people, ["ann@home.com"]).id).toBe("p1");
    expect(findExisting(people, ["ann@work.com"]).id).toBe("p1");
    expect(findExisting(people, ["zed@x.com"])).toBeNull();
  });
});

describe("POST /api/admin/people/add", () => {
  it("is for admins only", async () => {
    expect((await call({ name: "A", email: "a@b.co" }, ctx(false))).status).toBe(403);
    expect(crmState.created).toHaveLength(0);
  });

  it("creates a prospect and tags a Partner", async () => {
    const res = await call({ name: "Cara New", email: "cara@ex.com", group: "partner" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ recordId: "new1", name: "Cara New" });
    expect(crmState.created[0]).toMatchObject({ type: "person", stage: "prospect", input: { name: "Cara New", email: "cara@ex.com" } });
    expect(crmState.created[0].emailConsent).toBeUndefined();
    expect(crmState.tags[0]).toMatchObject({ recordId: "new1", tag: "partner" });
  });

  it("answers 409 with the record when a second email already belongs to someone", async () => {
    const res = await call({ name: "Ann Again", email: "ANN@home.com" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ recordId: "p1", archived: false });
    expect(crmState.created).toHaveLength(0);
  });

  it("points to an archived match rather than making a duplicate", async () => {
    const res = await call({ name: "Bea", email: "bea@example.com" });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body).toMatchObject({ recordId: "p2", archived: true });
    expect(body.error).toMatch(/archived/);
  });

  it("answers 400 with the reason for a bad form", async () => {
    const res = await call({ name: "", email: "a@b.co" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Add their name.");
  });
});

describe("the Add person form", () => {
  it("starts as a single button", () => {
    const html = render(<AddPerson />);
    expect(html).toContain(">Add person</button>");
    expect(html).not.toContain("<form");
  });

  it("opens with name and email required and Community as the default group", () => {
    const html = render(<AddPerson initialOpen />);
    expect(html).toMatch(/name="name"[^>]*required/);
    expect(html).toMatch(/name="email"[^>]*required/);
    expect(html).toMatch(/<option selected value>Community<\/option>/);
    expect(html).toContain("They have agreed to receive our updates");
  });
});
