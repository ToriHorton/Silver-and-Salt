// Host integration: the five tier attributes the J1 build added to
// package-owned namespaces.
//
// WHY THIS EXISTS. J1 (three-tier signup, built and verified on dev
// 2026-08-07) predates the chapter engine's own tier system. It modelled tiers
// by adding five attributes to namespaces the engine owns:
//
//   applications.tier              "associate" | "founding" | "steward"
//   groups.stewardPriceCents       the Steward price
//   groups.stripeStewardPriceId    its Stripe price
//   groups.stewardTrustCopy        Steward-specific trust text
//   groups.stewardRefundPolicyText Steward-specific refund text
//
// All five carry live data on the dev tenant, and this branch's composed schema
// declared none of them — so provisioning from here reads as "remove five
// data-bearing attributes" and is refused:
//
//   400 schema_conflict: schema omits data-bearing attribute applications.tier
//
// Declaring them keeps the deployed contract whole while the port proceeds.
// Discovered by walking every row in every composed namespace and diffing the
// attributes actually present against the ones we declare — `npm run
// check:schema` could not be used because exporting the deployed schema needs
// a human Studio session, which an agent device token cannot satisfy.
//
// TEMPORARY, WITH A DEFINED END. The engine now models tiers natively
// (`ChapterTier`, the `tiers` namespace, `applications.tierId`), which is what
// the port adopts. The sequence:
//
//   1. declare these, so provisioning works at all      <- this file
//   2. adopt engine tiers; write `tierId` beside `tier`
//   3. migrate the 5 tiered rows onto `tierId`
//   4. verify, then retire `tier` and delete this file
//
// The two steward COPY attributes may outlive the other three. The engine gives
// each tier a `blurb` but keeps trust and refund text single-valued on the
// group, so per-tier copy has no engine home yet (open upstream ask on bug
// fd944a76). Until that ships, these two ARE the workaround — J1 solved the
// same problem the same way, and the port should not throw that away.
//
// The shapes below are copied verbatim from the J1 branch
// (`git show ea625bd:src/odla/schema.mjs`) and must stay byte-compatible with
// it: both branches provision the same shared dev tenant.

export const tierAttrsSchema = {
  entities: {
    applications: {
      attrs: {
        // Indexed: the admin list filters and sorts by tier.
        tier: { type: "string", unique: false, indexed: true, optional: true },
      },
    },
    groups: {
      attrs: {
        stewardPriceCents: { type: "number", unique: false, indexed: false, optional: true },
        stripeStewardPriceId: { type: "string", unique: false, indexed: false, optional: true },
        stewardTrustCopy: { type: "string", unique: false, indexed: false, optional: true },
        stewardRefundPolicyText: { type: "string", unique: false, indexed: false, optional: true },
      },
    },
  },
};

// NOT a separate integration. `applications` and `groups` belong to the chapter
// integration, and the CLI refuses a second definition of a namespace someone
// else owns:
//
//   integration "sas-tier-attrs" schema namespace "applications" conflicts
//   with an existing definition
//
// which is the right behaviour — two integrations silently co-owning a
// namespace is how contradictory schemas get shipped. So these attributes are
// MERGED INTO the chapter integration instead: one owner, one definition, with
// this branch's additions folded in before the descriptor reaches the CLI.
//
// Additive only, and it says so: merging never replaces an attribute the engine
// already declares, it only fills in ones it does not. If the engine ever grows
// its own `applications.tier`, this throws rather than quietly overriding it —
// a collision there would mean the engine and J1 disagree about what `tier`
// means, which is a decision for a human, not a silent merge.
export function withTierAttrs(integration) {
  const entities = { ...integration.schema.entities };
  for (const [ns, def] of Object.entries(tierAttrsSchema.entities)) {
    const base = entities[ns];
    if (!base) throw new Error(`tier-attrs: chapter integration declares no "${ns}" namespace`);
    const merged = { ...base.attrs };
    for (const [attr, shape] of Object.entries(def.attrs)) {
      if (merged[attr]) {
        throw new Error(
          `tier-attrs: the engine now declares ${ns}.${attr} itself — ` +
          `reconcile the J1 shape with the engine's before removing this merge`,
        );
      }
      merged[attr] = shape;
    }
    entities[ns] = { ...base, attrs: merged };
  }
  return { ...integration, schema: { ...integration.schema, entities } };
}

/** The J1 tier values, and the engine tier id each one maps to in the port. */
export const TIER_MIGRATION = {
  associate: "associate",
  founding: "founding",
  steward: "steward",
};

export default withTierAttrs;
