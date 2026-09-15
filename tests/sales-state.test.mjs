// The server-enforced sales state (src/sales-state.ts). Every purchase or
// free-signup entry point is refused unless sales are open to the request.
import { describe, expect, it } from "vitest";
import {
  CANARY_COOKIE, GATED_POSTS, canaryPresented, canarySetCookie, isAllowlisted,
  purchasesOpenFor, resolveSalesState, salesGate, salesStateRoute, timingSafeEqual,
} from "../src/sales-state.ts";
import { joinPage } from "../src/join-page.ts";

const TOKEN = "canary-token-0123456789abcdef";
const post = (path, body = {}, cookie) =>
  new Request(`https://silverandsaltcapital.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
const call = (route, req, env) => route(req, new URL(req.url), env, /* ctx unused */ {});

describe("resolveSalesState", () => {
  it("is disabled by default and for any unknown value", () => {
    expect(resolveSalesState({}).state).toBe("disabled");
    expect(resolveSalesState({ SALES_STATE: "open" }).state).toBe("disabled");
    expect(resolveSalesState({ SALES_STATE: "" }).state).toBe("disabled");
  });
  it("opens only on the literal public value", () => {
    expect(resolveSalesState({ SALES_STATE: "public" }).state).toBe("public");
    expect(resolveSalesState({ SALES_STATE: " Public " }).state).toBe("public");
  });
  it("fails closed when restricted has no usable canary token", () => {
    expect(resolveSalesState({ SALES_STATE: "restricted" }).state).toBe("disabled");
    expect(resolveSalesState({ SALES_STATE: "restricted", SALES_CANARY_TOKEN: "short" }).state).toBe("disabled");
    expect(resolveSalesState({ SALES_STATE: "restricted", SALES_CANARY_TOKEN: TOKEN }).state).toBe("restricted");
  });
  it("SALES_STOP overrides every other state", () => {
    expect(resolveSalesState({ SALES_STATE: "public", SALES_STOP: "1" }).state).toBe("disabled");
    expect(resolveSalesState({ SALES_STATE: "public", SALES_STOP: "0" }).state).toBe("public");
    expect(resolveSalesState({ SALES_STATE: "public", SALES_STOP: "false" }).state).toBe("public");
    expect(resolveSalesState({ SALES_STATE: "restricted", SALES_CANARY_TOKEN: TOKEN, SALES_STOP: "stop" }).state).toBe("disabled");
  });
});

describe("canary", () => {
  it("compares in constant time and only accepts the exact token", () => {
    expect(timingSafeEqual(TOKEN, TOKEN)).toBe(true);
    expect(timingSafeEqual(TOKEN, TOKEN + "x")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
    const env = { SALES_STATE: "restricted", SALES_CANARY_TOKEN: TOKEN };
    expect(canaryPresented(post("/x", {}, `${CANARY_COOKIE}=${TOKEN}`), env)).toBe(true);
    expect(canaryPresented(post("/x", {}, `other=1; ${CANARY_COOKIE}=${TOKEN}`), env)).toBe(true);
    expect(canaryPresented(post("/x", {}, `${CANARY_COOKIE}=nope`), env)).toBe(false);
    expect(canaryPresented(post("/x"), env)).toBe(false);
  });
  it("sets an HttpOnly, SameSite cookie bounded in time", () => {
    const c = canarySetCookie(TOKEN, true);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Secure/);
    expect(c).toMatch(/Max-Age=\d+/);
  });
  it("allowlist matches emails case-insensitively and is optional", () => {
    expect(isAllowlisted("Tori@SilverAndSaltCapital.com", { SALES_ALLOWLIST: "tori@silverandsaltcapital.com, cory@example.com" })).toBe(true);
    expect(isAllowlisted("someone@example.com", { SALES_ALLOWLIST: "tori@silverandsaltcapital.com" })).toBe(false);
    expect(isAllowlisted("anyone@example.com", {})).toBe(true);
  });
});

describe("salesGate", () => {
  it("covers every entry point through which a purchase or free signup can begin", () => {
    expect(GATED_POSTS).toEqual(expect.arrayContaining([
      "/api/applications", "/api/payments/quote", "/api/payments/subscription",
      "/api/named-seat/checkout", "/api/gifts/checkout", "/api/gifts/redeem",
    ]));
    // Webhooks are never gated: money in flight keeps reconciling.
    expect(GATED_POSTS).not.toContain("/api/webhooks/stripe");
  });
  it("refuses gated posts with 503 when disabled and passes everything else through", async () => {
    const env = {};
    for (const path of GATED_POSTS) {
      const res = await call(salesGate, post(path), env);
      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("sales_disabled");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(await call(salesGate, post("/api/webhooks/stripe"), env)).toBeNull();
    expect(await call(salesGate, new Request("https://x/api/applications"), env)).toBeNull();
  });
  it("passes gated posts when public", async () => {
    expect(await call(salesGate, post("/api/payments/subscription"), { SALES_STATE: "public" })).toBeNull();
  });
  it("in restricted mode requires the canary cookie, then the allowlist on applications", async () => {
    const env = { SALES_STATE: "restricted", SALES_CANARY_TOKEN: TOKEN, SALES_ALLOWLIST: "payer@example.com" };
    const noCookie = await call(salesGate, post("/api/payments/subscription"), env);
    expect(noCookie.status).toBe(403);
    expect((await noCookie.json()).error).toBe("sales_restricted");
    const cookie = `${CANARY_COOKIE}=${TOKEN}`;
    expect(await call(salesGate, post("/api/payments/subscription", {}, cookie), env)).toBeNull();
    const wrongEmail = await call(salesGate, post("/api/applications", { email: "other@example.com" }, cookie), env);
    expect(wrongEmail.status).toBe(403);
    expect(await call(salesGate, post("/api/applications", { email: "Payer@Example.com" }, cookie), env)).toBeNull();
    const badJson = await salesGate(
      new Request("https://x/api/applications", { method: "POST", headers: { cookie }, body: "{" }),
      new URL("https://x/api/applications"), env, {},
    );
    expect(badJson.status).toBe(400);
  });
  it("SALES_STOP closes an otherwise public deployment", async () => {
    const res = await call(salesGate, post("/api/applications", {}), { SALES_STATE: "public", SALES_STOP: "1" });
    expect(res.status).toBe(503);
  });
  it("reports state without identities", async () => {
    const res = await call(salesStateRoute, new Request("https://x/api/sales-state"), { SALES_STATE: "public", SALES_ALLOWLIST: "a@b.c" });
    const body = await res.json();
    expect(body.state).toBe("public");
    expect(body.allowlisted).toBe(1);
    expect(JSON.stringify(body)).not.toContain("a@b.c");
  });
});

describe("joinPage", () => {
  const holding = `<html><head><title>x</title></head><body><p>We look forward to welcoming you to our investor community. Memberships open soon.</p>
<!-- membership-holding:start --><div id="coming-soon">soon</div><!-- membership-holding:end --></body></html>`;
  const assets = { fetch: async () => new Response(holding, { status: 200, headers: { "content-type": "text/html" } }) };
  const get = (path, cookie) => new Request(`https://silverandsaltcapital.com${path}`, { headers: cookie ? { cookie } : {} });

  it("falls through to the untouched holding page when sales are closed", async () => {
    expect(await call(joinPage, get("/join"), { ASSETS: assets, ODLA_ENV: "prod" })).toBeNull();
    const restricted = { ASSETS: assets, ODLA_ENV: "prod", SALES_STATE: "restricted", SALES_CANARY_TOKEN: TOKEN };
    expect(await call(joinPage, get("/join"), restricted)).toBeNull();
  });
  it("mounts the island when public, without the dev rehearsal notice in prod", async () => {
    const res = await call(joinPage, get("/join"), { ASSETS: assets, ODLA_ENV: "prod", SALES_STATE: "public" });
    const body = await res.text();
    expect(body).toContain('id="join-root"');
    expect(body).toContain("/assets/app/join-island.js");
    expect(body).not.toContain("coming-soon");
    expect(body).not.toContain("Development rehearsal");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("marks the dev rehearsal", async () => {
    const res = await call(joinPage, get("/join"), { ASSETS: assets, ODLA_ENV: "dev", SALES_STATE: "public" });
    expect(await res.text()).toContain("Development rehearsal");
  });
  it("mounts for the canary only with the cookie, and issues the cookie on the exact token", async () => {
    const env = { ASSETS: assets, ODLA_ENV: "prod", SALES_STATE: "restricted", SALES_CANARY_TOKEN: TOKEN };
    const mounted = await call(joinPage, get("/join", `${CANARY_COOKIE}=${TOKEN}`), env);
    expect(await mounted.text()).toContain('id="join-root"');
    const good = await call(joinPage, get(`/join?canary=${TOKEN}`), env);
    expect(good.status).toBe(302);
    expect(good.headers.get("location")).toBe("/join");
    expect(good.headers.get("set-cookie")).toContain(`${CANARY_COOKIE}=`);
    const bad = await call(joinPage, get("/join?canary=wrong"), env);
    expect(bad.status).toBe(302);
    expect(bad.headers.get("set-cookie")).toBeNull();
    const closed = await call(joinPage, get(`/join?canary=${TOKEN}`), { ...env, SALES_STATE: "disabled" });
    expect(closed.headers.get("set-cookie")).toBeNull();
  });
  it("refuses to splice a page whose markers are ambiguous", async () => {
    const twice = { fetch: async () => new Response(holding + "<!-- membership-holding:start -->", { status: 200, headers: { "content-type": "text/html" } }) };
    const res = await call(joinPage, get("/join"), { ASSETS: twice, ODLA_ENV: "prod", SALES_STATE: "public" });
    expect(res.status).toBe(503);
  });
  it("gates every purchase entry point the same way it gates the page", () => {
    const env = { SALES_STATE: "restricted", SALES_CANARY_TOKEN: TOKEN };
    expect(purchasesOpenFor(get("/join"), env)).toBe(false);
    expect(purchasesOpenFor(get("/join", `${CANARY_COOKIE}=${TOKEN}`), env)).toBe(true);
  });
});
