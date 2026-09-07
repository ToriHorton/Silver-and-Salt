import { AppShell, NavigationRail, NavigationRailItem } from "@odla-ai/ui/components";

const ICONS = { dashboard: "▦", people: "◎", admission: "◇", settings: "⚙" };

// Same odla-ui shell used by BNF. Chapter still owns the workspace registry,
// authorization, routing and active record; this component changes geometry only.
export function WorkspaceFrame({ context, workspaces, activeWorkspace, children }) {
  return (
    <AppShell mainLabel={`${activeWorkspace?.label ?? "Admin"} workspace`}
      rail={<NavigationRail aria-label="Primary admin workspaces">
        {workspaces.map((workspace) => (
          <NavigationRailItem key={workspace.id}
            active={context.route.workspaceId === workspace.id}
            icon={workspace.icon ?? <span aria-hidden="true">{ICONS[workspace.id] ?? "◇"}</span>}
            label={workspace.label}
            onClick={() => context.navigate(workspace.id)} />
        ))}
      </NavigationRail>}
      sidebar={null}>
      {children}
    </AppShell>
  );
}
