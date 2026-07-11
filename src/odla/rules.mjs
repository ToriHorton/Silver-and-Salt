// odla-db is default-deny and stays that way. Browsers never talk to the db
// directly; the Worker mediates all access with its app key (which bypasses
// rules). Loosening any rule below is a human checkpoint per MIGRATION.md.
export const rules = {
  applications: {
    view: "false",
    create: "false",
    update: "false",
    delete: "false",
  },
  groups: {
    view: "false",
    create: "false",
    update: "false",
    delete: "false",
  },
  emailLog: {
    view: "false",
    create: "false",
    update: "false",
    delete: "false",
  },
};
