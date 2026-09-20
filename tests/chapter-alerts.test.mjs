// Chapter's operator alerts on this site (src/chapter-alerts.ts).
//
// From @odla-ai/chapter 0.52.0 a quarantined Stripe webhook raises an alert:
// money captured at Stripe with no local effect. The recorder must keep
// Chapter's structured Workers Logs line (the only channel until the Worker
// carries the o11y ingest token) AND hand the report to @odla-ai/o11y. Each
// half is asserted on its own, so dropping either one fails.
import "./workers-globals.mjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runWithObservability } from "@odla-ai/o11y";
import { recordChapterAlert } from "../src/chapter-alerts.ts";

// The shape Chapter's worker-alerts module reports: a low-cardinality code and
// route, counts as attributes, provider event ids as artifacts. Never PII.
const report = {
  code: "stripe_webhook_quarantined",
  route: "/api/webhooks/stripe",
  attributes: { "odla.stripe.quarantined": 3, "odla.stripe.disposition": "quarantine_unmatched" },
  artifacts: { events: ["evt_1", "evt_2", "evt_3"] },
};

describe("recordChapterAlert", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps Chapter's structured console line, in Chapter's shape", () => {
    const line = vi.spyOn(console, "error").mockImplementation(() => {});
    recordChapterAlert(new Error("stripe webhook quarantined"), report);
    expect(line).toHaveBeenCalledTimes(1);
    const [tag, json] = line.mock.calls[0];
    expect(tag).toBe("chapter_alert");
    // Exactly what Chapter's own consoleErrorRecorder writes: the message,
    // then the report; a Workers Logs query written for the default keeps working.
    expect(JSON.parse(json)).toEqual({ message: "stripe webhook quarantined", ...report });
  });

  it("hands the report to o11y and returns its artifact id", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = recordChapterAlert(new Error("stripe webhook quarantined"), report);
    // Only o11y's recordError returns an artifact id (hex time + 32-hex uuid);
    // the console fallback alone returns nothing.
    expect(id).toMatch(/^[0-9a-f]{40,48}$/);
  });

  it("reaches the o11y collector with the code, route and count on the index", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A configured invocation: the collector is a binding double that keeps
    // every export it is handed, validating each call through the real
    // Request constructor so a malformed export cannot pass as delivered.
    const exported = [];
    const fetcher = {
      fetch: async (input, init) => {
        const req = new Request(input, init);
        exported.push({ url: req.url, body: JSON.parse(await req.text()) });
        return new Response(null, { status: 204 });
      },
    };
    const flushes = [];
    const ctx = { waitUntil: (p) => flushes.push(p), passThroughOnException() {} };
    await runWithObservability({}, ctx, "alert", () => {
      recordChapterAlert(new Error("stripe webhook quarantined"), report);
    }, { fetcher, token: "test-token", endpoint: "https://svc.internal", service: "silver-and-salt-capital", maxExportDelayMs: 0 });
    await Promise.all(flushes);

    const logs = exported.filter((e) => e.url.endsWith("/v1/logs"));
    expect(logs.length).toBeGreaterThan(0);
    // Every OTLP attribute pair in the export, whatever the envelope nesting.
    const pairs = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      if (typeof node.key === "string" && node.value && typeof node.value === "object") {
        pairs.push([node.key, String(Object.values(node.value)[0])]);
      }
      Object.values(node).forEach(walk);
    };
    walk(logs.map((l) => l.body));
    expect(pairs).toContainEqual(["error.code", "stripe_webhook_quarantined"]);
    expect(pairs).toContainEqual(["odla.route", "/api/webhooks/stripe"]);
    expect(pairs).toContainEqual(["odla.stripe.quarantined", "3"]);
  });
});
