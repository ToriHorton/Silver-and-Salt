// Host integration: newsletter signups (door 3 of the three doors).
//
// WHY THIS FILE EXISTS AT ALL. `newsletterSignups` lives in the deployed dev
// tenant with real rows, but this branch declared it nowhere: it is declared in
// src/odla/schema.mjs on a DIFFERENT branch (ea625bd and its line), whose
// Worker shares this same dev tenant and created the namespace. Provisioning
// from here composes a schema without it, which reads to the platform as
// "remove newsletterSignups" — and it refused, because the namespace holds
// data:
//
//   400 schema_conflict: cannot remove strict namespace newsletterSignups
//   while it contains data
//
// That guard did its job. The fix is to DECLARE the namespace, not to delete
// the rows so the removal can proceed: signups are door 3 of the three doors
// (Addendum E), and the tenant is shared, so those rows are not necessarily
// this branch's to discard.
//
// The attribute shapes below are copied EXACTLY from the other branch's
// declaration (`git show ea625bd:src/odla/schema.mjs`). They must stay
// byte-compatible with it: two branches declaring the same namespace with
// different types would trade schema conflicts every time either one
// provisions.
//
// STANDING HAZARD, worth writing down: any branch that provisions this shared
// dev tenant proposes ITS OWN composed schema as the whole truth. A namespace
// another branch owns and this one omits is proposed for deletion, and only the
// strict-namespace guard (plus the data in it) stands in the way. An empty
// namespace would have been dropped silently.

export const newsletterSchema = {
  entities: {
    newsletterSignups: {
      attrs: {
        id: { type: "string", unique: true, indexed: true, optional: false },
        email: { type: "string", unique: false, indexed: true, optional: false },
        // Which surface the signup came from ("index#how", "membership",
        // "footer:/faqs.html", ...) so we learn which asks convert.
        source: { type: "string", unique: false, indexed: false, optional: true },
        groupId: { type: "string", unique: false, indexed: true, optional: true },
        // active | unsubscribed
        status: { type: "string", unique: false, indexed: true, optional: false },
        createdAt: { type: "number", unique: false, indexed: true, optional: false },
      },
    },
  },
};

// Deny-all, like every other namespace here: the Worker mediates with the app
// key and browsers hold no db credential. A readable signup list is an email
// list anyone could harvest.
export const newsletterRules = {
  newsletterSignups: { view: "false", create: "false", update: "false", delete: "false" },
};

export function createNewsletterIntegration() {
  return {
    id: "sas-newsletter",
    title: "Silver & Salt: newsletter signups",
    // Ships in this repo, not an npm package; names the app's own package.
    npm: "silver-and-salt",
    schema: newsletterSchema,
    rules: newsletterRules,
    seeds: [],
    probes: [],
  };
}

export default createNewsletterIntegration;
