// The People workspace, rebuilt from Chapter's own parts so person records can
// carry the Calls tab (calls-tab.jsx).
//
// Chapter's default People workspace (PeopleWorkspace in @odla-ai/chapter
// 0.55.0) builds each collection with collectionSection() and no
// extendRecordTabs, and does not expose a way to pass one. So this mirrors it
// line for line, with one addition: extendRecordTabs: withCallsTab. Same
// collections, same lifecycle, roles, network sharing and pipeline stages.
//
// When adopting a new Chapter version, compare this against its
// PeopleWorkspace and defaultAdminWorkspaces; if Chapter grows its own
// extendRecordTabs option, drop this file and pass the tab through that.

import { collectionSection } from "@odla-ai/chapter/ui/admin";
import { Tabs } from "@odla-ai/ui/components";
import { withCallsTab } from "./calls-tab.jsx";

// ChapterAdmin's `workspaces` transform: keep every default workspace, swap
// the People render for this one. Module-level so its identity is stable.
export function withCallsPeople(chapter) {
  return (defaults) =>
    defaults.map((w) =>
      w.id === "people" ? { ...w, render: (ctx) => <PeopleWorkspace chapter={chapter} ctx={ctx} /> } : w,
    );
}

function PeopleWorkspace({ chapter, ctx }) {
  const types = Object.entries(chapter.crm.config.types).filter(
    ([, def]) => (def.workspace ?? "people") === "people",
  );
  const fallback = types[0]?.[0] ?? "person";
  const active = types.some(([type]) => type === ctx.route.viewId) ? ctx.route.viewId : fallback;
  const networkSharing = chapter.network.targets.length > 0;
  return (
    <Tabs
      ariaLabel={chapter.copy.admin.workspaces.collectionsLabel}
      value={active}
      variant="pill"
      mount="active"
      items={types.map(([type, def]) => {
        const section = collectionSection({
          crm: chapter.crm,
          type,
          lifecycle: chapter.mode === "chapter" && type === "person",
          roles: chapter.auth.ladder,
          networkSharing,
          applicationStages: chapter.pipeline.stages,
          extendRecordTabs: withCallsTab,
        });
        return {
          value: type,
          label: def.labelPlural ?? def.label,
          href: ctx.href({ viewId: type, recordId: null, detailTab: null }),
          panel: section.render(adminViewContext(ctx, type, active === type)),
        };
      })}
    />
  );
}

// Copy of Chapter's internal adminViewContext: scopes the workspace route to
// one collection view, so record and tab links stay inside it.
function adminViewContext(ctx, viewId, active) {
  const route = {
    workspaceId: ctx.route.workspaceId,
    viewId,
    ...(active && ctx.route.recordId ? { recordId: ctx.route.recordId } : {}),
    ...(active && ctx.route.detailTab ? { detailTab: ctx.route.detailTab } : {}),
  };
  const targetFromView = (target) => {
    if (typeof target === "string") return target;
    if (target.workspaceId && target.workspaceId !== route.workspaceId) return target;
    if (target.viewId && target.viewId !== route.viewId) return target;
    return { ...route, ...target };
  };
  return {
    ...ctx,
    route,
    navigate: (target) => ctx.navigate(targetFromView(target)),
    href: (target) => ctx.href(targetFromView(target)),
  };
}
