// odla-db schema for Silver & Salt Capital.
//
// applications: one row per membership application submitted from join.html.
// Field names mirror the form's input names (camelCased). Per the porting
// notes in @odla-ai/db/llms.txt:
//   - `id` is mirrored as a unique attr so rows can be queried by id.
//   - Optional scalars (referralName, linkedin) are OMITTED on write when
//     absent; there is no NULL.
//   - `focus` (checkbox multi-select) is a json array; the worker always
//     writes an array, possibly empty.
//   - email is indexed but NOT unique: a person may reapply. Duplicate
//     submissions are handled with a stable mutationId at write time.
//
// status pipeline: "submitted" -> "call_scheduled" -> "interviewed"
//   -> "approved" | "declined". The owner's user states (provisional/member/
//   admin) live on the Clerk-mirrored $users record from Phase 3b; an
//   application row tracks the interview pipeline that drives the
//   provisional -> member promotion.
export const schema = {
  entities: {
    applications: {
      attrs: {
        id: { type: "string", unique: true, indexed: true, optional: false },
        firstName: { type: "string", unique: false, indexed: false, optional: false },
        lastName: { type: "string", unique: false, indexed: false, optional: false },
        email: { type: "string", unique: false, indexed: true, optional: false },
        referral: { type: "string", unique: false, indexed: false, optional: false },
        referralName: { type: "string", unique: false, indexed: false, optional: true },
        whoYouAre: { type: "string", unique: false, indexed: false, optional: false },
        focus: { type: "json", unique: false, indexed: false, optional: false },
        linkedin: { type: "string", unique: false, indexed: false, optional: true },
        message: { type: "string", unique: false, indexed: false, optional: false },
        status: { type: "string", unique: false, indexed: true, optional: false },
        createdAt: { type: "number", unique: false, indexed: true, optional: false },
        // Epoch ms of the scheduled intro call. Set by an admin (the Google
        // Calendar booking widget cannot call us back). Omitted until known.
        meetingAt: { type: "number", unique: false, indexed: true, optional: true },
        // Clerk user id, linked lazily when a signed-in user's email matches.
        clerkUserId: { type: "string", unique: false, indexed: true, optional: true },
      },
    },
  },
  links: {},
};
