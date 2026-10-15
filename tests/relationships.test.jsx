import { expect, it } from "vitest";
import { render } from "preact-render-to-string";
import { GroupView, withRelationships } from "../src/app/admin/relationships.jsx";

const group = { id: "partner", label: "Partners", blurb: "Organizations we work alongside.", empty: "No one is tagged partner yet." };
const hrefs = [];
const ctx = { href: (t) => { hrefs.push(t); return `#${t.workspaceId}/${t.recordId}`; } };

it("lists each partner with their organization, both emails, updates consent and latest note", () => {
  const people = [{
    id: "p1", name: "Jane Partner", email: "jane@partner.org", secondaryEmail: "jane@home.com", organization: "Invest for Better", title: "Founder",
    emailStatus: "ok", lastCallAt: Date.UTC(2026, 4, 27, 12), openTasks: 2, latestNote: { body: "Spring course plans", at: Date.UTC(2026, 9, 1, 12) },
  }];
  const html = render(<GroupView group={group} ctx={ctx} loading={false} people={people} error={null} />);
  expect(html).toContain('href="#people/p1"');
  expect(hrefs.at(-1)).toMatchObject({ workspaceId: "people", recordId: "p1" });
  for (const text of ["Invest for Better", "Founder", "jane@partner.org", "jane@home.com", "Yes", "May 27, 2026", "Spring course plans"]) expect(html).toContain(text);
  expect(html).toContain("add the tag <strong>partner</strong>");
});

it("says so when no one is in the group, and reads a missing consent as Not asked", () => {
  expect(render(<GroupView group={group} ctx={ctx} loading={false} people={[]} error={null} />)).toContain("No one is tagged partner yet.");
  const html = render(<GroupView group={group} ctx={ctx} loading={false} people={[{ id: "p2", name: "New Partner", emailStatus: null, openTasks: 0, latestNote: null }]} error={null} />);
  expect(html).toContain("Not asked");
});

it("adds the workspace right after People", () => {
  const ids = withRelationships()([{ id: "dashboard" }, { id: "people" }, { id: "settings" }]).map((w) => w.id);
  expect(ids).toEqual(["dashboard", "people", "relationships", "settings"]);
});
