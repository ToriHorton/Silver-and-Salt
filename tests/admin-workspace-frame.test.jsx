import { describe, expect, it, vi } from "vitest";
import { AppShell, NavigationRail, NavigationRailItem } from "@odla-ai/ui/components";
import { WorkspaceFrame } from "../src/app/admin/workspace-frame.jsx";
import { readFileSync } from "node:fs";

describe("BNF-style workspace rail", () => {
  const workspaces = [
    { id: "dashboard", label: "Dashboard" }, { id: "people", label: "People" },
    { id: "admission", label: "Admission" }, { id: "settings", label: "Settings" },
    { id: "host-extension", label: "Host extension", icon: "!" },
  ];
  function frame(workspaceId = "people") {
    const context = { route: { workspaceId, viewId: "person", recordId: "account-only", detailTab: "calls" }, navigate: vi.fn() };
    const children = { type: "section", props: { children: "Existing People / Calls / Prep content" } };
    return { context, children, view: WorkspaceFrame({ context, workspaces,
      activeWorkspace: workspaces.find(w => w.id === workspaceId), children }) };
  }
  it("uses shared shell primitives and preserves the active workspace", () => {
    const { view, children } = frame();
    expect(view.type).toBe(AppShell);
    expect(view.props.mainLabel).toBe("People workspace");
    expect(view.props.sidebar).toBeNull();
    expect(view.props.children).toBe(children);
    expect(view.props.rail.type).toBe(NavigationRail);
    expect(view.props.rail.props["aria-label"]).toBe("Primary admin workspaces");
  });
  it("renders every workspace, including host extensions, with one current item", () => {
    const items = frame().view.props.rail.props.children;
    expect(items.map(item => item.type)).toEqual(workspaces.map(() => NavigationRailItem));
    expect(items.map(item => item.props.label)).toEqual(workspaces.map(w => w.label));
    expect(items.filter(item => item.props.active).map(item => item.props.label)).toEqual(["People"]);
    expect(items.at(-1).props.icon).toBe("!");
    expect(frame("settings").view.props.rail.props.children.find(item => item.props.active).props.label).toBe("Settings");
  });
  it("delegates navigation to Chapter without rewriting the current nested record route", () => {
    const { view, context } = frame();
    const original = { ...context.route };
    view.props.rail.props.children[0].props.onClick();
    expect(context.navigate).toHaveBeenCalledExactlyOnceWith("dashboard");
    expect(context.route).toEqual(original);
  });
  it("mounts the frame through the documented seam in the real entry point", () => {
    const source = readFileSync(new URL("../src/app/admin/index.jsx", import.meta.url), "utf8");
    expect(source).toContain("renderWorkspaceFrame={WorkspaceFrame}");
    expect(source).toContain('chrome="embedded"');
  });
});
