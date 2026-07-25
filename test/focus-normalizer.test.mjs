// Covers the multi-select workaround in src/worker.ts.
//
// @odla-ai/chapter 0.23.0's JoinIsland collects the form with
//   `for (const [k, v] of new FormData(form).entries()) fields[k] = v`
// so repeated input names overwrite and only the last value survives. Our seven
// "Interests" checkboxes share name="focus", so src/app/join.jsx posts them as
// a JSON array string and the worker parses it back before chapter validates.
//
// Delete this file together with the workaround once JoinIsland uses getAll.

import { describe, expect, it } from "vitest";
import { normalizeApplication } from "../src/worker.ts";

const post = (body) =>
  new Request("https://example.com/api/applications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const focusOf = async (req) => (await req.json()).focus;

describe("focus normalizer", () => {
  it("parses a JSON array string into a real array", async () => {
    const out = await normalizeApplication(post({ focus: '["Building financial confidence","Starting or growing a business"]' }));
    expect(await focusOf(out)).toEqual([
      "Building financial confidence",
      "Starting or growing a business",
    ]);
  });

  it("turns an empty selection into an empty array, not the string \"[]\"", async () => {
    const out = await normalizeApplication(post({ focus: "[]" }));
    expect(await focusOf(out)).toEqual([]);
  });

  it("leaves an array alone", async () => {
    const out = await normalizeApplication(post({ focus: ["A"] }));
    expect(await focusOf(out)).toEqual(["A"]);
  });

  it("leaves a plain string alone", async () => {
    // A single value is legitimate input, not a broken array.
    const out = await normalizeApplication(post({ focus: "Building financial confidence" }));
    expect(await focusOf(out)).toBe("Building financial confidence");
  });

  it("does not parse a free-text answer that happens to start with a bracket", async () => {
    // message is a free-text field and must never be reinterpreted.
    const req = post({ message: '["not", "an", "array"]', focus: "[]" });
    const out = await normalizeApplication(req);
    const body = await out.json();
    expect(body.message).toBe('["not", "an", "array"]');
  });

  it("leaves a JSON string that parses to a non-array alone", async () => {
    const out = await normalizeApplication(post({ focus: '{"a":1}' }));
    expect(await focusOf(out)).toBe('{"a":1}');
  });

  it("preserves every other field", async () => {
    const out = await normalizeApplication(
      post({ firstName: "Martha", email: "m@example.com", disclaimerAck: "true", focus: '["A"]' }),
    );
    const body = await out.json();
    expect(body.firstName).toBe("Martha");
    expect(body.email).toBe("m@example.com");
    expect(body.disclaimerAck).toBe("true");
  });

  it("passes a non-JSON body through untouched rather than throwing", async () => {
    // chapter returns its own validation error for this; the shim must not
    // swallow the body or 500 first.
    const req = new Request("https://example.com/api/applications", {
      method: "POST",
      body: "not json",
    });
    expect(await (await normalizeApplication(req)).text()).toBe("not json");
  });
});
