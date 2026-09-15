// Edge hardening (src/hardening.ts): headers, body cap, rate limit, and the
// static _headers file staying equal to what the Worker sends.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bodyCapFor, hardenFetch, limitBody, rateLimit, renderHeadersFile, securityHeaders, withSecurityHeaders, DEFAULT_BODY_CAP, SIGNED_BODY_CAP, ADMIN_BODY_CAP } from "../src/hardening.ts";
import { SILVER_HARDENING } from "../src/hardening.config.ts";

// Node needs duplex for a streaming body; the Workers runtime does not.
const post = (path, body, headers = {}) => new Request(`https://silverandsaltcapital.com${path}`, { method: "POST", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) });

describe("security headers", () => {
  it("names the frame, sniffing, referrer, transport, and CSP policies", () => {
    const h = securityHeaders(SILVER_HARDENING);
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=31536000/);
    expect(h["Content-Security-Policy-Report-Only"]).toContain("https://clerk.silverandsaltcapital.com");
    expect(h["Content-Security-Policy-Report-Only"]).toContain("frame-src https://clerk.silverandsaltcapital.com https://js.stripe.com https://hooks.stripe.com");
  });
  it("keeps the static _headers file equal to the Worker's set", () => {
    expect(readFileSync("_headers", "utf8")).toBe(renderHeadersFile(SILVER_HARDENING));
  });
  it("adds headers without overriding ones a route already set", () => {
    const res = withSecurityHeaders(new Response("x", { headers: { "X-Frame-Options": "SAMEORIGIN" } }), securityHeaders(SILVER_HARDENING));
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});

describe("body cap", () => {
  it("sizes the cap by route class", () => {
    expect(bodyCapFor("/api/applications")).toBe(DEFAULT_BODY_CAP);
    expect(bodyCapFor("/api/webhooks/stripe")).toBe(SIGNED_BODY_CAP);
    expect(bodyCapFor("/api/membership-authority/live/offers")).toBe(SIGNED_BODY_CAP);
    expect(bodyCapFor("/api/admin/settings")).toBe(ADMIN_BODY_CAP);
  });
  it("refuses an oversized declared length without reading the body", async () => {
    // Node's Request recomputes Content-Length for stream bodies, so the
    // declared-length path is exercised through the minimal request shape
    // limitBody reads: method, url, headers, body.
    let read = false;
    const fake = { method: "POST", url: "https://silverandsaltcapital.com/api/applications",
      headers: new Headers({ "content-length": String(DEFAULT_BODY_CAP + 1) }),
      body: { getReader() { read = true; throw new Error("must not read"); } } };
    const res = await limitBody(fake);
    expect(res.status).toBe(413);
    expect(read).toBe(false);
  });
  it("stops reading an undeclared body at the cap", async () => {
    let pulls = 0;
    const chunk = new Uint8Array(16 * 1024);
    const stream = new ReadableStream({ pull(c) { pulls++; c.enqueue(chunk); } });
    const res = await limitBody(post("/api/applications", stream));
    expect(res.status).toBe(413);
    expect(pulls).toBeLessThanOrEqual(6);
  });
  it("passes a small body through intact and leaves reads alone", async () => {
    const out = await limitBody(post("/api/applications", JSON.stringify({ a: 1 }), { "content-type": "application/json" }));
    expect(out).toBeInstanceOf(Request);
    expect(await out.json()).toEqual({ a: 1 });
    expect(out.headers.get("content-type")).toBe("application/json");
    const get = new Request("https://silverandsaltcapital.com/api/me");
    expect(await limitBody(get)).toBe(get);
  });
});

describe("rate limit", () => {
  const limiter = (success) => ({ PUBLIC_WRITE_LIMIT: { limit: async () => ({ success }) } });
  it("limits public writes by client IP and exempts signed edges and admin", async () => {
    const res = await rateLimit(post("/api/applications", "{}", { "cf-connecting-ip": "1.2.3.4" }), limiter(false));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(await rateLimit(post("/api/webhooks/stripe", "{}"), limiter(false))).toBeNull();
    expect(await rateLimit(post("/api/admin/settings", "{}"), limiter(false))).toBeNull();
    expect(await rateLimit(new Request("https://x/api/me"), limiter(false))).toBeNull();
    expect(await rateLimit(post("/api/applications", "{}"), limiter(true))).toBeNull();
  });
  it("skips when no binding is declared and fails open when the binding throws", async () => {
    expect(await rateLimit(post("/api/applications", "{}"), {})).toBeNull();
    expect(await rateLimit(post("/api/applications", "{}"), { PUBLIC_WRITE_LIMIT: { limit: async () => { throw new Error("down"); } } })).toBeNull();
  });
});

describe("hardenFetch", () => {
  it("wraps a handler with cap, limit, and headers", async () => {
    const wrapped = hardenFetch(async () => new Response("ok"), SILVER_HARDENING);
    const ok = await wrapped(post("/api/applications", "{}"), {}, {});
    expect(await ok.text()).toBe("ok");
    expect(ok.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const big = await wrapped(post("/api/applications", "x", { "content-length": String(DEFAULT_BODY_CAP + 1) }), {}, {});
    expect(big.status).toBe(413);
    expect(big.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
