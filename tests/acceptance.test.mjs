// Phase 7 executable acceptance manifest, run against a DEPLOYED origin.
//
//   ACCEPTANCE_URL=https://silver-and-salt-capital-canary.cory-ondrejka.workers.dev npm test
//
// Skipped when ACCEPTANCE_URL is unset, so the default `npm test` stays offline
// and fast. This asserts the deployed contract, not the source: it is the check
// that the thing actually serving traffic behaves as the frozen baseline says.
//
// SCOPE AND ITS LIMITS. Everything here is non-side-effecting and unauthenticated.
// The runbook's Phase 7 also requires a real authenticated journey (submit the
// join form, take a Stripe test payment, book and receive the debug-routed mail,
// sign in as provisional/member/admin, run every admin mutation family, then
// replay it all and prove no duplicate row, charge, booking, account, or email).
// Those steps WRITE: real application rows, real Stripe test charges, real
// calendar events, and real email sends. They are deliberately NOT automated
// here, because a test file that quietly creates member records and charges on
// every run is a worse outcome than an honest gap. Run them deliberately, with
// the deterministic synthetic ids recorded in PM.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const BASE = process.env.ACCEPTANCE_URL;
const baseline = JSON.parse(readFileSync("tests/fixtures/legacy-baseline.json", "utf8"));
const run = BASE ? describe : describe.skip;

/** Always bust the edge cache: a stale 404 from an earlier deploy once cost a
 *  false bug diagnosis on this exact worker. */
const get = (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: { "cache-control": "no-cache", pragma: "no-cache", ...(init.headers ?? {}) },
  });

run("deployed acceptance", () => {
  describe("liveness and static fallback", () => {
    it("serves the health endpoint", async () => {
      const res = await get("/api/health");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    it("serves the marketing homepage from the assets binding", async () => {
      const res = await get("/");
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("Silver &amp; Salt Capital");
    });

    it("terminates an unknown /api path as JSON 404, never an SPA document", async () => {
      const res = await get("/api/definitely-not-a-route");
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
    });
  });

  describe("private surfaces reject anonymous callers", () => {
    // Every one of these must fail closed. A 200 here is a data leak.
    for (const path of [
      "/api/me",
      "/api/admin/dashboard",
      "/api/admin/people",
      "/api/admin/billing",
      "/api/admin/meetings",
      "/api/admin/migration-readiness",
      "/api/applications/count",
      "/api/admin/group/scheduling",
      "/api/crm/records",
    ]) {
      it(`401s ${path}`, async () => {
        expect((await get(path)).status).toBe(401);
      });
    }
  });

  describe("public join contract matches the frozen baseline", () => {
    it("exposes the approved prices and payment readiness", async () => {
      const body = await (await get("/api/join-config")).json();
      expect(body.standardPriceCents).toBe(baseline.prices.standardPriceCents);
      expect(body.foundingDiscountCents).toBe(baseline.prices.foundingDiscountCents);
      // The upgrade gate proves the managed founding offer is present and
      // unique. A signed BNF signup-control delivery is the separately tracked
      // authority transition that retires any historical tenant offers.
      expect(body.tiers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "founding",
          name: "Founding Member",
          priceCents: baseline.prices.dueTodayCents,
          free: false,
        }),
      ]));
      expect(body.tiers.filter((tier) => tier.id === "founding")).toHaveLength(1);
      // Proves stripe_secret_key + publishable key + price id all resolve. It
      // does NOT prove webhook readiness or provider-side amount equality;
      // those stay cutover gates.
      expect(body.paymentsReady).toBe(true);
    });

    it("no longer serves the retired group-scoped join-config route", async () => {
      // JoinIsland gets lineItems and publishableKey from the subscription
      // route, so this legacy host route was retired with PM bug 019f9c67.
      // Asserting the 404 keeps it retired: a future change that re-mounts it
      // is a signal the join page slipped back onto the old contract.
      const res = await get(`/api/groups/silver-and-salt-capital/join-config?cb=${Date.now()}`);
      expect(res.status).toBe(404);
    });

    it("gates the subscription route that now carries the payment contract", async () => {
      // The publishableKey and lineItems the join page needs come from here,
      // and the route must still refuse an unidentified caller.
      const res = await fetch(`${BASE}/api/payments/subscription`, {
        method: "POST",
        headers: { "content-type": "application/json", "cache-control": "no-cache" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/applicationId/i);
    });
  });

  describe("scheduling readiness", () => {
    it("reports schedulingReady true with the approved slot rules", async () => {
      // The runbook is explicit: HTTP 200 carrying schedulingReady:false is a
      // FAILED gate, not a pass. Assert the flag, not the status code.
      const res = await get("/api/schedule/slots?days=7");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.schedulingReady).toBe(true);
      expect(body.slotMinutes).toBe(baseline.scheduling.slotMinutes);
      expect(body.timezone).toBe(baseline.scheduling.timezone);
      expect(Array.isArray(body.slots)).toBe(true);
    });
  });

  describe("follower receive route fails closed", () => {
    it("rejects a wrong share secret with 401", async () => {
      const res = await fetch(`${BASE}/api/network/shared`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer wrong-secret" },
        body: JSON.stringify({
          version: 1,
          type: "person",
          hubRecordId: "acceptance-probe-person",
          input: { name: "Acceptance Probe" },
        }),
      });
      expect(res.status).toBe(401);
    });

    it("rejects an unauthenticated push", async () => {
      const res = await fetch(`${BASE}/api/network/shared`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1, type: "person", record: {} }),
      });
      expect(res.status).toBe(401);
    });
  });

  describe("local auth matrix (chapter-follower v7)", () => {
    // v7 is explicit that the ABSENCE of an aud/azp check is not evidence of
    // anything. Our reviewed legacy policy verifies the issuer only, so aud and
    // azp are recorded as n/a in the baseline, NOT as a security success, and
    // the real obligation is proving the rest of the matrix fails closed.
    const bearer = (token) => ({ authorization: `Bearer ${token}` });
    // Structurally valid JWT, unknown signing key, foreign issuer.
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const foreignIssuerToken = [
      b64({ alg: "RS256", typ: "JWT", kid: "not-a-real-kid" }),
      b64({ iss: "https://attacker.example.com", sub: "user_evil", exp: Math.floor(Date.now() / 1000) + 3600 }),
      "ZmFrZS1zaWduYXR1cmU",
    ].join(".");

    for (const [label, token] of [
      ["a malformed token", "not.a.jwt"],
      ["an empty bearer", ""],
      ["a token with no signature", b64({ alg: "none" }) + "." + b64({ sub: "x" }) + "."],
      ["a foreign-issuer token", foreignIssuerToken],
    ]) {
      it(`rejects ${label} on /api/me`, async () => {
        const res = await get("/api/me", { headers: bearer(token) });
        expect(res.status).toBe(401);
      });

      it(`rejects ${label} on an admin route`, async () => {
        const res = await get("/api/admin/people", { headers: bearer(token) });
        // 401 or 403 both fail closed; a 200 would be the bug.
        expect([401, 403]).toContain(res.status);
      });
    }

    it("records aud and azp as n/a rather than as a passing control", () => {
      // Asserting the RECORD, not the runtime: the baseline must not claim a
      // security property the product does not actually enforce.
      expect(baseline.auth.audAzp).toBe("n/a");
    });

    // NOT COVERED HERE, and deliberately not faked: allowed, forbidden, the
    // role ladder, a genuinely EXPIRED token, sign out, and safe return
    // routing. Each needs a real Clerk-signed session; an expired token in
    // particular cannot be distinguished from a bad signature without the
    // signing key, so asserting it from a hand-built JWT would prove nothing.
  });

  describe("application replay identity (chapter-follower v10 gate)", () => {
    // Regression cover for the phantom-id defect fixed in @odla-ai/chapter
    // 0.25.3: a deduped replay used to return a freshly minted uuid that
    // resolved to nothing, so a lost-response retry stranded the applicant with
    // an id that 404'd against payment and booking.
    //
    // This is the ONE side-effecting assertion in the suite, and it is bounded
    // BY the fix itself: the id is derived from the fixed submissionId below,
    // so every run of this test converges on the same single row rather than
    // accumulating one per run. Re-running is free; the row is labelled.
    const SUBMISSION_ID = "acceptance-replay-identity-fixed";
    const applicant = {
      firstName: "Acceptance",
      lastName: "Replayfixture",
      email: "cory.ondrejka+acceptance-replay@gmail.com",
      phone: "(801) 555-0000",
      state: "Utah",
      referral: "other",
      whoYouAre: "Working professional",
      message: "Automated acceptance fixture for replay identity. Safe to delete.",
      focus: ["Building financial confidence"],
      disclaimerAck: true,
      tierId: "founding",
      submissionId: SUBMISSION_ID,
    };
    const submit = () =>
      fetch(`${BASE}/api/applications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(applicant),
      }).then((r) => r.json());

    it("returns the same canonical id for a replayed submission", async () => {
      const first = await submit();
      const second = await submit();
      expect(first.id).toBeTruthy();
      expect(second.id).toBe(first.id);
      // The second submit is always a replay once the fixture row exists.
      expect(second.duplicate).toBe(true);
    }, 15_000);

    it("returns an id that actually resolves, not a phantom", async () => {
      // The precise failure mode of the old defect: duplicate:true carrying an
      // id that no row answered to.
      const { id } = await submit();

      // Bounded retry, because a read immediately after the row is first
      // created can lose a race with write propagation — observed once, on the
      // run right after this fixture was created, and never since. This does
      // NOT weaken the assertion: a phantom id never resolves, so the real
      // defect still fails here after exhausting the attempts.
      let res;
      for (let attempt = 0; attempt < 5; attempt++) {
        res = await get(`/api/join/resume?application=${id}`);
        if (res.status === 200) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      expect(res.status, "canonical id never resolved").toBe(200);
      expect((await res.json()).applicationId).toBe(id);
    });

    it("writes exactly one application no matter how many times it replays", async () => {
      const ids = [];
      for (let i = 0; i < 3; i++) ids.push((await submit()).id);
      expect(new Set(ids).size).toBe(1);
    }, 15_000);
  });

  describe("clerk configuration is the expected dev instance", () => {
    it("serves the dev publishable key from Chapter config", async () => {
      const body = await (await get("/api/config")).json();
      expect(body.clerkPublishableKey).toBe(baseline.clerk.publishableKey);
      // Never a live key on a dev origin.
      expect(body.clerkPublishableKey.startsWith("pk_live_")).toBe(false);
    });
  });
});
