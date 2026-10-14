// The Dashboard workspace, rebuilt from Chapter's own parts so it opens on the
// Journeys view (journeys-dashboard.jsx). Overview and Billing are Chapter's
// own sections, unchanged, in their usual tabs.
//
// When adopting a new Chapter version, compare this with its
// DashboardWorkspace (dist chunk, "function DashboardWorkspace").

import { billingSection, dashboardSection } from "@odla-ai/chapter/ui/admin";
import { Tabs } from "@odla-ai/ui/components";
import { adminViewContext } from "./people-workspace.jsx";
import { JourneysDashboard } from "./journeys-dashboard.jsx";

// ChapterAdmin's `workspaces` transform: swap the Dashboard render, keep the rest.
export function withJourneysDashboard(chapter) {
  return (defaults) =>
    defaults.map((w) => (w.id === "dashboard" ? { ...w, render: (ctx) => <DashboardWorkspace chapter={chapter} ctx={ctx} /> } : w));
}

function DashboardWorkspace({ chapter, ctx }) {
  const copy = chapter.copy.admin;
  const view = ctx.route.viewId;
  const active = view === "billing" || view === "overview" ? view : "journeys";
  const overview = dashboardSection({ id: "overview", label: copy.workspaces.overview });
  const billing = billingSection({ label: copy.workspaces.billing });
  return (
    <Tabs
      ariaLabel={copy.workspaces.dashboardViewsLabel}
      value={active}
      mount="active"
      items={[
        { value: "journeys", label: "Journeys", href: ctx.href({ viewId: "journeys", recordId: null, detailTab: null }), panel: <JourneysDashboard ctx={ctx} /> },
        { value: "overview", label: copy.workspaces.overview, href: ctx.href({ viewId: "overview", recordId: null, detailTab: null }), panel: overview.render(adminViewContext(ctx, "overview", active === "overview")) },
        { value: "billing", label: copy.workspaces.billing, href: ctx.href({ viewId: "billing", recordId: null, detailTab: null }), panel: billing.render(adminViewContext(ctx, "billing", active === "billing")) },
      ]}
    />
  );
}
