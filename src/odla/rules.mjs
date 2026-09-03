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
  // Newsletter namespaces. Deny-all like everything else: the unsubscribe
  // route is public, but it runs IN the Worker with the app key, so the
  // browser still never touches odla-db directly. newsletterSignups was
  // previously absent from this file and leaned on defaultRules; it is
  // written out here so the posture is readable rather than inferred.
  newsletterSignups: {
    view: "false",
    create: "false",
    update: "false",
    delete: "false",
  },
  newsletters: {
    view: "false",
    create: "false",
    update: "false",
    delete: "false",
  },
  newsletterRecipients: {
    view: "false",
    create: "false",
    update: "false",
    delete: "false",
  },
};
