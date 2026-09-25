// The Worker mount (src/worker-chapter.ts) against the chapter-follower
// runbook's step for Chapter 0.52.0:
//
//   export default withObservability(chapterWorker({ chapter, recordError }));
//
// This site builds one Worker per deployment inside that wrapper, so the test
// drives the exported handler the way Cloudflare does (a request in, a
// response out) and holds the options every deployment is built from.
import "./workers-globals.mjs";
import { describe, expect, it } from "vitest";
import worker, { chapterWorkerOptions, withQuoteSelectionBody, PAYMENT_QUOTE_PATH } from "../src/worker-chapter.ts";
import { recordChapterAlert } from "../src/chapter-alerts.ts";

// The development deployment's plain vars (wrangler.jsonc env.dev), no
// secrets, and an asset binding that answers so a fall-through is visible.
const env = {
  ODLA_ENV: "dev",
  ODLA_APP_ID: "silver-and-salt-capital",
  ODLA_TENANT: "silver-and-salt-capital--dev",
  ODLA_PLATFORM: "https://odla.ai",
  ODLA_ENDPOINT: "https://db.odla.ai",
  ASSETS: { fetch: async () => new Response("static asset", { status: 200 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

describe("chapterWorkerOptions", () => {
  it("hands Chapter this site's recorder for its operator alerts", () => {
    for (const envName of ["dev", "prod"]) {
      const options = chapterWorkerOptions(envName);
      expect(options.recordError).toBe(recordChapterAlert);
      expect(options.chapter.id).toBe("silver-and-salt-capital");
      expect(options.chapter.config.emails.fromName).toBe("Tori Horton");
    }
  });

  it("keeps the host routes ahead of the built-ins and the CRM at /api/crm", () => {
    const options = chapterWorkerOptions("dev");
    expect(options.crmBasePath).toBe("/api/crm");
    expect(options.requirePaymentQuote).toBe(true);
    expect(options.routes).toHaveLength(7);
    for (const route of options.routes) expect(typeof route).toBe("function");
  });
});

describe("the exported Worker", () => {
  it("is a fetch and scheduled handler", () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof worker.scheduled).toBe("function");
  });

  it("answers Chapter's health route through the observability wrapper", async () => {
    // /api/health is the one built-in that touches nothing: a 200 here means
    // the wrapper, the hardening layer, the host routes and Chapter's router
    // all ran for a real Request, with no o11y configuration at all.
    const res = await worker.fetch(new Request("https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev/api/health"), env, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // The hardening headers ride every response the Worker produces.
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("mounts the resume-tier host route ahead of Chapter's router", async () => {
    // Without an application id the route refuses before touching the
    // database, so the real Worker can prove the mount with no credential. The
    // built-in router would answer this unknown path 404, so a 400 here is the
    // host route, in front, as src/worker-chapter.ts orders it.
    const res = await worker.fetch(new Request("https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev/api/join/resume/tier"), env, ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "application is required" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("terminates an unknown /api/* path as an API error, never a static asset", async () => {
    const res = await worker.fetch(new Request("https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev/api/no-such-route"), env, ctx);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/json/);
  });
});

// The payment step's opening quote call sends no body, and Chapter 0.55.0's
// route answers 400 "invalid seat selection" when it parses one that is empty.
// That took every paid tier's checkout down on 2026-09-22. The mount gives the
// request the empty object the route already accepts, and leaves a real seat
// selection alone.
describe("payment quote body", () => {
  const quoteUrl = `https://silverandsaltcapital.com${PAYMENT_QUOTE_PATH}?application=abc`;
  const read = async (req) => (req.body === null ? "" : await req.text());

  it("gives the bodyless opening call an empty JSON object", async () => {
    const req = new Request(quoteUrl, { method: "POST", headers: { "content-length": "0" } });
    const out = await withQuoteSelectionBody(req);
    expect(await read(out)).toBe("{}");
    expect(out.headers.get("content-type")).toBe("application/json");
    expect(out.method).toBe("POST");
    expect(new URL(out.url).search).toBe("?application=abc");
  });

  it("treats a request with no declared length as the opening call too", async () => {
    const req = new Request(quoteUrl, { method: "POST" });
    expect(await read(await withQuoteSelectionBody(req))).toBe("{}");
  });

  it("hands a real seat selection through untouched and unread", async () => {
    const selection = JSON.stringify({ namedSeat: { name: "A", email: "a@example.com" } });
    const req = new Request(quoteUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(selection.length) },
      body: selection,
    });
    const out = await withQuoteSelectionBody(req);
    expect(out).toBe(req);
    expect(await read(out)).toBe(selection);
  });

  it("leaves every other request alone", async () => {
    const get = new Request(quoteUrl);
    expect(await withQuoteSelectionBody(get)).toBe(get);
    const other = new Request("https://silverandsaltcapital.com/api/applications", { method: "POST", headers: { "content-length": "0" } });
    expect(await withQuoteSelectionBody(other)).toBe(other);
  });
});
