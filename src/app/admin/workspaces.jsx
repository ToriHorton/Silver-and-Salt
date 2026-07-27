import { PeopleTab } from "./people-crm.jsx";

/**
 * Compose the site's validated operational workspaces into ChapterAdmin.
 *
 * Chapter's default People workspace is a useful generic CRM, but matching the
 * host's workspace label does not preserve its summary, exploration rail, role
 * signals, or record operations. Keep the packaged defaults for every other
 * workspace and replace only the exact `people` id.
 */
export function operationalAdminWorkspaces(defaults, currentUser) {
  const hasPeople = defaults.some((workspace) => workspace.id === "people");
  if (!hasPeople) {
    throw new Error("ChapterAdmin no longer provides the expected people workspace");
  }

  return defaults.map((workspace) => {
    if (workspace.id !== "people") return workspace;
    return {
      ...workspace,
      render: () => (
        <PeopleTab
          myUserId={currentUser.userId}
          superAdmin={currentUser.superAdmin === true}
        />
      ),
    };
  });
}
