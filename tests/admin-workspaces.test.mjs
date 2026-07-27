import { readFileSync } from "node:fs";
import { h } from "preact";
import { renderToStaticMarkup } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { PeopleTab } from "../src/app/admin/people-crm.jsx";
import { operationalAdminWorkspaces } from "../src/app/admin/workspaces.jsx";

const adminHtml = readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");

const defaultWorkspaces = () => [
  { id: "dashboard", label: "Dashboard", render: () => h("p", null, "dashboard") },
  {
    id: "people",
    label: "People",
    defaultViewId: "person",
    accent: "lime",
    render: () => h("p", null, "packaged default"),
  },
  { id: "settings", label: "Settings", render: () => h("p", null, "settings") },
];

describe("ChapterAdmin workspace composition", () => {
  it("preserves the validated CRM People workspace instead of the packaged default", () => {
    const defaults = defaultWorkspaces();
    const composed = operationalAdminWorkspaces(defaults, {
      userId: "user_owner",
      superAdmin: true,
    });
    const people = composed.find((workspace) => workspace.id === "people");
    const vnode = people.render({});

    expect(vnode.type).toBe(PeopleTab);
    expect(vnode.props).toMatchObject({
      myUserId: "user_owner",
      superAdmin: true,
    });
    expect(people.defaultViewId).toBe("person");
    expect(people.accent).toBe("lime");
    expect(defaults[1].render({}).props.children).toBe("packaged default");
  });

  it("renders the CRM summary, exploration, and record-operation affordances", () => {
    const people = operationalAdminWorkspaces(defaultWorkspaces(), {
      userId: "user_owner",
      superAdmin: true,
    }).find((workspace) => workspace.id === "people");
    const html = renderToStaticMarkup(people.render({}));

    expect(html).toContain("Open tasks");
    expect(html).toContain("Search people");
    expect(html).toContain("Select a person");
    expect(html).not.toContain("packaged default");
  });

  it("fails closed when Chapter removes or renames the people workspace id", () => {
    expect(() =>
      operationalAdminWorkspaces(
        [{ id: "contacts", label: "People", render: () => null }],
        { userId: "user_owner" },
      ),
    ).toThrow(/expected people workspace/);
  });

  it("keeps the full-width People canvas free of the centered embedded-shell stripe", () => {
    expect(adminHtml).toMatch(/\.people-full\s*\{[^}]*width:\s*100vw/);
    expect(adminHtml).toMatch(
      /#console-root \[data-chapter-admin\] > \.shell-main\s*\{\s*background:\s*transparent !important;/,
    );
  });
});
