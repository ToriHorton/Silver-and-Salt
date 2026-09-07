import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("preact", async (actual) => ({ ...await actual(), render: mocks.render }));

afterEach(() => { vi.unstubAllGlobals(); mocks.render.mockClear(); });

it.each([
  ["protected nonmember", { authorized: true, role: "provisional", superAdmin: true, memberAccess: false }, true],
  ["ordinary admin", { authorized: true, role: "admin", memberAccess: false }, true],
  ["revoked admin", { authorized: false, role: "admin", memberAccess: false }, false],
])("real bootstrap handles %s using the server verdict", async (_name, me, allowed) => {
  vi.resetModules();
  const elements = Object.fromEntries(["status-card", "signin-mount", "console-root", "auth-loading"].map(id => [id, {
    classList: { add: vi.fn(), remove: vi.fn() }, innerHTML: "", textContent: "",
  }]));
  const api = vi.fn(async () => me);
  vi.stubGlobal("document", { getElementById: id => elements[id] });
  vi.stubGlobal("window", { SSCAuth: { loadClerk: async () => ({ user: { id: "subject" } }), api } });
  vi.stubGlobal("location", { pathname: "/admin/", search: "", hash: "#people/person/account/stage" });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  await import("../src/app/admin/index.jsx");
  await vi.waitFor(() => {
    if (allowed) expect(mocks.render).toHaveBeenCalledTimes(1);
    else expect(elements["auth-loading"].innerHTML).toContain("This area is for administrators");
  });
  expect(api).toHaveBeenCalledWith("/api/me");
  if (allowed) {
    const [view, root] = mocks.render.mock.calls[0];
    expect(root).toBe(elements["console-root"]);
    expect(view.props.renderWorkspaceFrame).toBeTypeOf("function");
    expect(view.props.auth.isAuthorized(me)).toBe(true);
    expect(view.props.auth.isAuthorized({ authorized: false, role: "admin" })).toBe(false);
    expect(await view.props.auth.loadCurrentUser()).toBe(me);
  } else expect(mocks.render).not.toHaveBeenCalled();
});
