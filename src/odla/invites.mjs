// Host integration: pre-approved member invites ("you met her first").
//
// WHY THIS EXISTS. The built join flow assumes ONE order: she finds the site,
// applies, pays, books a call, meets Tori, and is approved or refunded
// (Decision #24, charge-and-refund). That order is wrong for how this business
// actually recruits. Tori does outreach, has coffee, decides on the spot that
// someone is a fit — and then has no way to bring her in, because the only
// door says "fill in the form, pay $1,000, and book a call with me", to a
// person she has already met.
//
// This namespace is the other direction: Tori meets her, sends a single-use
// signup link, and she joins. No calendar booking, because the conversation
// already happened. Owner decisions 2026-08-20: one link per person (not a
// reusable link), and the invited person still chooses her own tier from all
// three rather than being locked to the one Tori had in mind.
//
// POLICY NOTE, deliberately recorded here next to the data. This inverts
// Decision #24 for this path: the vetting conversation happens BEFORE the
// charge instead of after it. That is a stronger position, not a weaker one —
// there is no refund exposure and no taking money from someone who will not
// fit — but it IS a change to a written decision, and the refund copy shown at
// the payment step must not claim a conversation is still to come. Flagged for
// the living document rather than quietly shipped.
//
// Nothing provisions src/odla/schema.mjs (it survives as the frozen parity
// reference only), so a new namespace arrives as its own integration composed
// alongside createChapterIntegration in odla.config.mjs — the same pattern the
// hub uses for its SKU catalog. Keeping it separate also means the chapter
// parity gate, which asserts createChapterIntegration ALONE against the frozen
// fixtures, stays untouched and keeps doing its job.

export const invitesSchema = {
  entities: {
    memberInvites: {
      attrs: {
        // Entity ids are not attrs in odla-db; mirror the id as a unique attr.
        id: { type: "string", unique: true, indexed: true, optional: false },

        // The secret in the URL. Unique + indexed because every redeem is a
        // lookup by this value and two invites must never share one. This is a
        // bearer credential: anyone holding it can join at the tier they pick,
        // so it is generated with crypto random, never derived from the email,
        // and never logged.
        token: { type: "string", unique: true, indexed: true, optional: false },

        // Who it was issued to. NOT unique: a link can be reissued to the same
        // person if the first expires or she loses it, and the old row stays
        // as history rather than being overwritten.
        email: { type: "string", unique: false, indexed: true, optional: false },
        firstName: { type: "string", unique: false, indexed: false, optional: true },
        lastName: { type: "string", unique: false, indexed: false, optional: true },

        // The conversation that justifies skipping vetting. metAt is what makes
        // this auditable later: if anyone asks why this member never had a
        // recorded introductory call, the answer is a date and a note.
        metAt: { type: "number", unique: false, indexed: false, optional: true },
        metNote: { type: "string", unique: false, indexed: false, optional: true },

        // "sent" -> "opened" -> "redeemed", with "revoked" and "expired" as
        // terminal exits. Indexed because the admin list is filtered by it, and
        // because "sent but never opened" is the follow-up list that makes
        // per-person links worth the extra build over one reusable link.
        status: { type: "string", unique: false, indexed: true, optional: false },

        createdBy: { type: "string", unique: false, indexed: false, optional: false },
        createdAt: { type: "number", unique: false, indexed: true, optional: false },
        // An unredeemed bearer token should not live forever.
        expiresAt: { type: "number", unique: false, indexed: true, optional: true },
        openedAt: { type: "number", unique: false, indexed: false, optional: true },
        redeemedAt: { type: "number", unique: false, indexed: false, optional: true },
        revokedAt: { type: "number", unique: false, indexed: false, optional: true },
        revokedBy: { type: "string", unique: false, indexed: false, optional: true },

        // Set on redeem. applicationId is the join back to the operational row
        // that remains the authoritative pipeline; tierId records which of the
        // three she actually chose, which is the interesting half of the owner's
        // "she picks" decision — it tells Tori what her invitations convert to.
        applicationId: { type: "string", unique: false, indexed: true, optional: true },
        tierId: { type: "string", unique: false, indexed: false, optional: true },
      },
    },
  },
};

// Deny-all, like every other namespace here. Browsers hold no db credential;
// the Worker mediates with the app key. This matters more than usual for this
// namespace: a readable `memberInvites` would hand any visitor a list of live
// bearer tokens.
export const invitesRules = {
  memberInvites: { view: "false", create: "false", update: "false", delete: "false" },
};

export function createInviteIntegration() {
  return {
    id: "sas-member-invites",
    title: "Silver & Salt: pre-approved member invites",
    // Ships in this repo, not an npm package; names the app's own package.
    npm: "silver-and-salt",
    schema: invitesSchema,
    rules: invitesRules,
    // No seeds: an invite only ever exists because a human issued one.
    seeds: [],
    probes: [],
  };
}

/** Invite lifecycle states, in the order they normally occur. */
export const INVITE_STATUSES = ["sent", "opened", "redeemed", "revoked", "expired"];

/** How long an unredeemed link stays good. Long enough to survive a holiday,
 *  short enough that a forwarded link does not work months later. */
export const INVITE_TTL_DAYS = 30;

export default createInviteIntegration;
