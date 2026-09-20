// The resumed application's tier (PM bug 854d3a8b, E2E-01): a free Associate
// who reloaded /join without ?tier= resumed at booking with a payment step on
// the rail. The tier now comes from the server, twice removed from the browser:
// the site's route reads it from the stored application, and the site's
// resume loader attaches it to Chapter's canonical state.
//
// Both halves are driven the way they run: the route with a Request in and a
// Response out (its JSON parsed, never string-matched), the loader through the
// same fetch signature loadJoinResume uses, with a double that answers by URL.
import { describe, expect, it, vi } from "vitest";
import { JOIN_RESUME_TIER_PATH, joinResumeTierRoute, tierRowIsFree } from "../src/join-resume.ts";
import { loadSiteJoinResume } from "../src/app/join-resume.mjs";

const CHAPTER = "silver-and-salt-capital";
const ORIGIN = "https://silverandsaltcapital.com";

function fakeDb(state) {
  return {
    query: vi.fn(async (q) => {
      const out = {};
      for (const ns of Object.keys(q)) {
        const where = q[ns].$?.where ?? {};
        out[ns] = (state[ns] ?? []).filter((row) => Object.entries(where).every(([k, v]) => row[k] === v));
      }
      return out;
    }),
  };
}

const app = (id, over = {}) => ({
  id, groupId: CHAPTER, stripeRuntime: "live", status: "submitted", email: `${id}@example.com`, tierId: "associate", ...over,
});
const tiers = [
  { id: "standard", groupId: CHAPTER, name: "Standard Membership", priceCents: 100000, stripePriceId: "price_std" },
  { id: "steward", groupId: CHAPTER, name: "Community Steward", priceCents: 500000, stripePriceId: "price_stw" },
  { id: "associate", groupId: CHAPTER, name: "Associate", priceCents: 0 },
];
const env = { ODLA_RUNTIME: "live" };
const ctx = (db) => ({ chapter: { id: CHAPTER }, makeDb: () => db });
const get = (id, db, e = env) => {
  const url = id === undefined ? `${ORIGIN}${JOIN_RESUME_TIER_PATH}` : `${ORIGIN}${JOIN_RESUME_TIER_PATH}?application=${encodeURIComponent(id)}`;
  return joinResumeTierRoute(new Request(url), new URL(url), e, ctx(db));
};

describe("tierRowIsFree", () => {
  it("is Chapter's rule: no positive price and no Stripe price", () => {
    expect(tierRowIsFree({ priceCents: 0 })).toBe(true);
    expect(tierRowIsFree({})).toBe(true);
    expect(tierRowIsFree({ priceCents: 100000 })).toBe(false);
    // A zero-priced row that still carries a Stripe price is billed by Stripe.
    expect(tierRowIsFree({ priceCents: 0, stripePriceId: "price_x" })).toBe(false);
  });
});

describe("GET /api/join/resume/tier", () => {
  it("answers the stored tier and only that, with free decided by the tier row", async () => {
    const db = fakeDb({ applications: [app("free-1"), app("paid-1", { tierId: "standard" })], tiers });
    const free = await get("free-1", db);
    expect(free.status).toBe(200);
    expect(free.headers.get("cache-control")).toBe("no-store");
    expect(await free.json()).toEqual({ applicationId: "free-1", tier: { id: "associate", free: true } });
    const paid = await (await get("paid-1", db)).json();
    expect(paid).toEqual({ applicationId: "paid-1", tier: { id: "standard", free: false } });
    // The email on the row never leaves the server.
    expect(Object.keys(paid)).toEqual(["applicationId", "tier"]);
  });

  it("asserts no tier it cannot prove", async () => {
    const db = fakeDb({ applications: [app("legacy", { tierId: undefined }), app("retired", { tierId: "patron" })], tiers });
    expect(await (await get("legacy", db)).json()).toEqual({ applicationId: "legacy", tier: null });
    expect(await (await get("retired", db)).json()).toEqual({ applicationId: "retired", tier: null });
  });

  it("verifies the id the way Chapter's resume does", async () => {
    const db = fakeDb({
      applications: [
        app("other-chapter", { groupId: "someone-else" }),
        app("other-runtime", { stripeRuntime: "test" }),
        app("legacy-runtime", { stripeRuntime: undefined }),
        app("refunded", { status: "refunded" }),
        app("declined", { status: "declined" }),
        app("canceled-flag", { canceled: true }),
      ],
      tiers,
    });
    expect((await get("missing", db)).status).toBe(404);
    expect((await get("other-chapter", db)).status).toBe(404);
    expect((await get("other-runtime", db)).status).toBe(404);
    // A row that never recorded a runtime predates the identity and is served.
    expect((await get("legacy-runtime", db)).status).toBe(200);
    for (const id of ["refunded", "declined", "canceled-flag"]) {
      const res = await get(id, db);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "application is not resumable", code: "application_closed", applicationId: id });
    }
    // Without a runtime var the identity is "default", so a live row is foreign.
    expect((await get("free-1", fakeDb({ applications: [app("free-1")], tiers }), {})).status).toBe(404);
  });

  it("refuses a missing or oversized id before reading anything", async () => {
    const db = fakeDb({});
    const none = await get(undefined, db);
    expect(none.status).toBe(400);
    expect(await none.json()).toEqual({ error: "application is required" });
    expect((await get("x".repeat(161), db)).status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("falls through for any other method or path", async () => {
    const db = fakeDb({});
    const url = `${ORIGIN}${JOIN_RESUME_TIER_PATH}?application=a`;
    expect(await joinResumeTierRoute(new Request(url, { method: "POST" }), new URL(url), env, ctx(db))).toBeNull();
    const other = `${ORIGIN}/api/join/resume?application=a`;
    expect(await joinResumeTierRoute(new Request(other), new URL(other), env, ctx(db))).toBeNull();
  });
});

describe("loadSiteJoinResume", () => {
  // A fetch double keyed by the exact URLs the loader must call, in order.
  function fetcher(answers) {
    const calls = [];
    const fn = vi.fn(async (url) => {
      calls.push(url);
      const a = answers[url];
      if (!a) throw new Error(`unexpected fetch ${url}`);
      return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { "content-type": "application/json" } });
    });
    return Object.assign(fn, { calls });
  }
  const resumeUrl = (id) => `/api/join/resume?application=${encodeURIComponent(id)}`;
  const tierUrl = (id) => `${JOIN_RESUME_TIER_PATH}?application=${encodeURIComponent(id)}`;

  it("attaches the server's tier to the canonical state", async () => {
    const f = fetcher({
      [resumeUrl("app 1")]: { body: { state: "booking", applicationId: "app 1" } },
      [tierUrl("app 1")]: { body: { applicationId: "app 1", tier: { id: "associate", free: true } } },
    });
    expect(await loadSiteJoinResume("app 1", f)).toEqual({ step: "booking", applicationId: "app 1", tier: { id: "associate", free: true } });
    expect(f.calls).toEqual([resumeUrl("app 1"), tierUrl("app 1")]);
  });

  it("carries a paid tier through payment and booking alike", async () => {
    for (const state of ["payment", "paymentPending", "booking"]) {
      const f = fetcher({
        [resumeUrl("p")]: { body: { state, applicationId: "p" } },
        [tierUrl("p")]: { body: { applicationId: "p", tier: { id: "standard", free: false } } },
      });
      expect(await loadSiteJoinResume("p", f)).toEqual({ step: state, applicationId: "p", tier: { id: "standard", free: false } });
    }
  });

  it("keeps the canonical state when the tier cannot be verified", async () => {
    const canonical = { step: "booking", applicationId: "b" };
    const cases = [
      { body: { error: "not found" }, status: 404 },
      { body: { applicationId: "someone-else", tier: { id: "associate", free: true } } },
      { body: { applicationId: "b", tier: null } },
      { body: { applicationId: "b", tier: { id: "associate", free: "yes" } } },
    ];
    for (const answer of cases) {
      const f = fetcher({ [resumeUrl("b")]: { body: { state: "booking", applicationId: "b" } }, [tierUrl("b")]: answer });
      expect(await loadSiteJoinResume("b", f)).toEqual(canonical);
    }
    // A network failure on the tier read never breaks the resume itself.
    const failing = vi.fn(async (url) => {
      if (url === resumeUrl("b")) return new Response(JSON.stringify({ state: "booking", applicationId: "b" }), { status: 200 });
      throw new TypeError("offline");
    });
    expect(await loadSiteJoinResume("b", failing)).toEqual(canonical);
  });

  it("does not ask for a tier on a closed application, and still fails a failed resume", async () => {
    const f = fetcher({ [resumeUrl("c")]: { status: 409, body: { code: "application_closed", applicationId: "c", error: "closed" } } });
    expect(await loadSiteJoinResume("c", f)).toEqual({ step: "closed", applicationId: "c" });
    expect(f.calls).toEqual([resumeUrl("c")]);
    const gone = fetcher({ [resumeUrl("d")]: { status: 404, body: { error: "not found" } } });
    await expect(loadSiteJoinResume("d", gone)).rejects.toThrow();
    expect(gone.calls).toEqual([resumeUrl("d")]);
  });
});
