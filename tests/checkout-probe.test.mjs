// The synthetic checkout canary (src/checkout-probe.ts).
//
// It exists because of the 2026-09-22 outage: Chapter 0.55.0's quote route
// began answering 400 to the bodyless POST its own payment step sends, and
// membership checkout was down for every paid tier for about 41 hours with no
// signal at all. These cases pin the one distinction the probe is built on.
import { describe, expect, it } from "vitest";
import { probeCheckoutQuote, PROBE_APPLICATION_ID } from "../src/checkout-probe.ts";
import { PAYMENT_QUOTE_PATH } from "../src/payment-quote-path.ts";

const origin = "https://silverandsaltcapital.com";
const answer = (status, body) => async () =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("checkout canary", () => {
  it("asks about an application id that cannot exist, so nothing is mutated", async () => {
    let seen;
    await probeCheckoutQuote(async (req) => {
      seen = req;
      return new Response(null, { status: 404 });
    }, origin);
    const url = new URL(seen.url);
    expect(url.pathname).toBe(PAYMENT_QUOTE_PATH);
    expect(url.searchParams.get("application")).toBe(PROBE_APPLICATION_ID);
    expect(seen.method).toBe("POST");
    // The payment step's opening call carries no body; that is the shape the
    // 0.55.0 route refused, so the probe must send exactly it.
    expect(seen.body).toBeNull();
  });

  it("passes on 404: the body was accepted and the lookup ran", async () => {
    const res = await probeCheckoutQuote(answer(404, { error: "not found" }), origin);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(404);
  });

  it("fails on the 400 that took checkout down, and names the reason", async () => {
    const res = await probeCheckoutQuote(answer(400, { error: "invalid seat selection" }), origin);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.detail).toContain("invalid seat selection");
  });

  it("fails on any other status rather than reading it as health", async () => {
    for (const status of [200, 409, 500, 503]) {
      const res = await probeCheckoutQuote(answer(status, {}), origin);
      expect(res.ok).toBe(false);
      expect(res.status).toBe(status);
    }
  });

  it("fails, without throwing, when the request cannot complete", async () => {
    const res = await probeCheckoutQuote(async () => {
      throw new Error("boom");
    }, origin);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.detail).toContain("boom");
  });

  it("does not double the slash when the origin carries one", async () => {
    let seen;
    await probeCheckoutQuote(async (req) => {
      seen = req;
      return new Response(null, { status: 404 });
    }, `${origin}/`);
    expect(new URL(seen.url).pathname).toBe(PAYMENT_QUOTE_PATH);
  });
});
