// The Calls tab on person records in the live admin console
// (src/app/admin/calls-tab.jsx, people-workspace.jsx). It first shipped in a
// panel the console no longer loads, so these pin that it is wired into the
// console that actually runs, and where it sits.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { withCallsTab } from "../src/app/admin/calls-tab.jsx";
import { withCallsPeople } from "../src/app/admin/people-workspace.jsx";

const ctx = (type = "person") => ({ type, client: {}, detail: { record: { id: "r1" } } });
const tabs = (...ids) => ids.map((id) => ({ id, label: id, panel: null }));
const ids = (list) => list.map((t) => t.id);

describe("withCallsTab", () => {
  it("puts Calls between Billing and Notes", () => {
    const out = withCallsTab(tabs("stage", "profile", "comms", "history", "billing", "notes", "connections"), ctx());
    expect(ids(out)).toEqual(["stage", "profile", "comms", "history", "billing", "calls", "notes", "connections"]);
  });

  it("goes just before Notes when a record has no Billing tab", () => {
    expect(ids(withCallsTab(tabs("profile", "notes"), ctx()))).toEqual(["profile", "calls", "notes"]);
  });

  it("goes last when there is neither", () => {
    expect(ids(withCallsTab(tabs("profile"), ctx()))).toEqual(["profile", "calls"]);
  });

  it("leaves other collections alone", () => {
    const base = tabs("profile", "billing", "notes");
    expect(withCallsTab(base, ctx("company"))).toBe(base);
  });
});

describe("withCallsPeople", () => {
  it("swaps only the People workspace and keeps the rest as they were", () => {
    const defaults = [
      { id: "dashboard", label: "Dashboard", render: () => "d" },
      { id: "people", label: "People", defaultViewId: "person", render: () => "p" },
      { id: "settings", label: "Settings", render: () => "s" },
    ];
    const out = withCallsPeople({})(defaults);
    expect(out[0]).toBe(defaults[0]);
    expect(out[2]).toBe(defaults[2]);
    expect(out[1]).toMatchObject({ id: "people", label: "People", defaultViewId: "person" });
    expect(out[1].render).not.toBe(defaults[1].render);
  });

  it("is what the live admin entry passes to ChapterAdmin", () => {
    const entry = readFileSync(new URL("../src/app/admin/index.jsx", import.meta.url), "utf8");
    expect(entry).toMatch(/workspaces=\{WORKSPACES\}/);
    expect(entry).toMatch(/withCallsPeople\(chapter\)/);
  });
});
