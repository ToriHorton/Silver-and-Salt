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
  meetings: {
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
  // Super-admins: deny-all like the rest. The whole TABLE is read-only from the
  // app's side (the Worker only ever queries it, never transacts it); the only
  // writer is a human in the odla Studio data browser. This is the "make the
  // table read-only" guarantee, not a per-field flag.
  superAdmins: {
    view: "false",
    create: "false",
    update: "false",
    delete: "false",
  },
};
