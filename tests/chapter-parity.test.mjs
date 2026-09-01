// Phase 1 schema/rule parity gate + behavior-decision lock.
//
// The frozen fixtures in tests/fixtures/ are acceptance authority: they were
// captured from the DEPLOYED dev tenant (snapshot tx 741), not from source and
// not from memory. These tests fail if Chapter's composed schema, rules, or
// resolved behavior drifts from the product that is live today.
//
// There is one test per accepted behavior decision, so a @odla-ai/chapter
// upgrade cannot silently change the site. When a Chapter default legitimately
// should win, change the config AND the fixture AND record a PM decision in the
// same commit. Do not "fix" a red test by loosening it.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyMemberStripeEvent,
  createChapterIntegration,
  normalizeWebhookEvent,
  planMemberSystemEventReplay,
} from "@odla-ai/chapter";
import { createCrmIntegration } from "@odla-ai/crm";
import { chapter } from "../src/chapter.config.mjs";
import odlaConfig from "../odla.config.mjs";
import { schema as legacySourceSchema } from "../src/odla/schema.mjs";
import { crm as legacyCrm } from "../src/crm.mjs";

const legacySchema = JSON.parse(readFileSync("tests/fixtures/legacy-schema.json", "utf8"));
const legacyRules = JSON.parse(readFileSync("tests/fixtures/legacy-rules.json", "utf8"));
const baseline = JSON.parse(readFileSync("tests/fixtures/legacy-baseline.json", "utf8"));
const integration = createChapterIntegration(chapter);

// ── THE INDEPENDENT LEGACY ANCHOR RE-ARMS WHEN CHAPTER SHIPS ────────────
// The deployed fixture remains immutable evidence. Later legacy-source work
// added a now-retired newsletter namespace and a hand-built tier model that
// never became fixture authority. Keep those differences in exact allowlists:
// a new source drift still fails, while the Chapter candidate is never used as
// its own baseline.
const WORKER_ENTRY = readFileSync("wrangler.jsonc", "utf8");
const CHAPTER_SHIPS = /"main"\s*:\s*"src\/worker-chapter\.ts"/.test(WORKER_ENTRY);
const describeParity = CHAPTER_SHIPS ? describe : describe.skip;

const REVIEWED_LEGACY_SOURCE_NAMESPACES = ["newsletterSignups"];
const REVIEWED_LEGACY_SOURCE_ATTRS = {
  applications: ["clerkPrivateMetadataSyncedAt", "tier"],
  groups: [
    "stewardPriceCents",
    "stewardRefundPolicyText",
    "stewardTrustCopy",
    "stripeStewardPriceId",
  ],
};


// Reviewed 2026-07-30 under shared package decision
// 21c28820-c0b6-5780-b8e1-bd34d01100c4: CRM 0.5.0 adds two deny-all,
// additive namespaces for stable upstream identity and delivery evidence.
// They contain no member/session/key data and are required before this
// follower can accept the leader's signed v2 record envelope.

// Attributes Chapter adds beyond the frozen legacy contract, each reviewed and
// recorded as a PM decision. Anything NOT listed here fails the gate, so an
// upgrade cannot quietly extend the data model.
//
// clerkPrivateMetadataSyncedAt (@odla-ai/chapter 0.25.0): stamps when the
// applicant's profile was synced into Clerk PRIVATE metadata. This is the
// upstream fix for the browser-readable public_metadata.profile exposure —
// the package now writes the profile to private metadata and passes
// publicProfileRemoval ({applicationId:null, profile:null}) on every sync, so
// the legacy public copy on our 37 existing dev accounts is cleared the next
// time each account is touched. Optional, additive, never read by the browser.
// tierId (@odla-ai/chapter 0.31.x): the tier an application chose, pointing at
// a row in the new `tiers` namespace. This is odla shipping the fix for bug
// fd944a76, which asked for per-tier pricing and copy and a free tier, and it
// is what lets Associate / Founding / Steward be expressed on the engine
// instead of by hand. Reviewed 2026-08-24 against decision 54cbc404. Optional
// and additive: rows written before tiers existed carry no tierId.
// Chapter 0.42.4 adds optional, server-only links for three mechanics that are
// disabled in this slice: parent-authored admission, gift purchase/claim, and
// interview waiver. emailNormalized is the bounded lookup key for those flows;
// stripeRuntime partitions test/live provider objects. They do not change an
// existing row and cannot be written directly by a browser (rules below remain
// literal false). merchantDisclosureText is optional operator-owned copy and
// the insert-only group seed leaves the existing row untouched.
const REVIEWED_ADDITIONS = {
  applications: [
    "admissionGrantId",
    "admissionSource",
    "clerkPrivateMetadataSyncedAt",
    "emailNormalized",
    "giftCheckoutStartedAt",
    "giftClaimId",
    "giftIntentId",
    "giftOfferId",
    "giftOrderId",
    "giftPaidAt",
    "giftRevokedAt",
    "interviewWaivedAt",
    "stripeRuntime",
    "tierId",
  ],
  groups: ["merchantDisclosureText"],
};

// Namespaces Chapter composes that the frozen fixture predates. Same rule as
// REVIEWED_ADDITIONS: an UNREVIEWED new namespace still fails, so a package
// upgrade cannot quietly widen the data model. `tiers` arrived with the same
// 0.31.x tier support reviewed above; it is seeded from the chapter config and
// carries no member data.
const REVIEWED_NAMESPACES = [
  "admissionGrantRevisions",
  "admissionGrants",
  "giftClaims",
  "giftEntitlements",
  "giftOrders",
  "giftPurchaseIntents",
  "giftRedemptionAttempts",
  "memberContentControls",
  "memberContentLocal",
  "signupControls",
  "tiers",
];

// The fixture was captured from the shared dev TENANT, and that tenant is also
// written by other branches. If someone else's build ever pushes a different
// schema, comparing Chapter to the fixture alone could become circular
// (Chapter-vs-Chapter) and pass vacuously. This anchors the fixture to THIS
// branch's legacy source, which no other branch can move. If it ever fails, the
// fixture is contaminated and must be re-derived from source, not re-captured.
describeParity("the frozen fixture still equals this branch's legacy source", () => {
  const fromSource = {
    ...legacySourceSchema.entities,
    ...createCrmIntegration(legacyCrm, { basePath: "/api/crm" }).schema.entities,
  };

  it("covers the same namespaces as the source of truth in this tree", () => {
    const sourceNamespaces = Object.keys(fromSource).filter(
      (namespace) => !REVIEWED_LEGACY_SOURCE_NAMESPACES.includes(namespace),
    );
    expect(Object.keys(legacySchema.entities).sort()).toEqual(sourceNamespaces.sort());
  });

  it("carries the same attributes as the source of truth in this tree", () => {
    for (const ns of Object.keys(fromSource).sort()) {
      if (!legacySchema.entities[ns]) continue;
      const reviewed = REVIEWED_LEGACY_SOURCE_ATTRS[ns] ?? [];
      const sourceAttrs = Object.keys(fromSource[ns].attrs ?? {}).filter(
        (attr) => !reviewed.includes(attr),
      );
      expect(Object.keys(legacySchema.entities[ns].attrs ?? {}).sort(), `${ns} drifted`).toEqual(
        sourceAttrs.sort(),
      );
    }
  });
});

describe("schema parity vs the frozen legacy contract", () => {
  const legacyNs = Object.keys(legacySchema.entities).sort();
  const chapterNs = Object.keys(integration.schema.entities).sort();

  it("composes exactly the deployed namespace set", () => {
    expect(chapterNs).toEqual([...legacyNs, ...REVIEWED_NAMESPACES].sort());
  });

  for (const ns of legacyNs) {
    describe(ns, () => {
      const L = legacySchema.entities[ns].attrs ?? {};

      it("keeps every deployed attribute", () => {
        const C = integration.schema.entities[ns]?.attrs ?? {};
        // Removals and renames are regressions and must fail.
        for (const attr of Object.keys(L)) {
          expect(Object.keys(C), `${ns}.${attr} was dropped by Chapter`).toContain(attr);
        }
        // Additions are allowed ONLY when reviewed and listed below. An
        // unreviewed new attribute still fails, so a package upgrade cannot
        // quietly extend the data model.
        const added = Object.keys(C).filter((a) => !L[a]);
        expect(added.sort()).toEqual((REVIEWED_ADDITIONS[ns] ?? []).sort());
      });

      it("only ever adds OPTIONAL attributes", () => {
        // A new required attribute would break every existing row.
        const C = integration.schema.entities[ns]?.attrs ?? {};
        for (const attr of Object.keys(C).filter((a) => !L[a])) {
          expect(C[attr].optional, `${ns}.${attr} added as required`).toBe(true);
        }
      });

      it("keeps every attribute's type, uniqueness, and index", () => {
        const C = integration.schema.entities[ns]?.attrs ?? {};
        for (const [attr, ld] of Object.entries(L)) {
          const cd = C[attr];
          expect(cd, `${ns}.${attr} missing`).toBeDefined();
          expect(cd.type, `${ns}.${attr} type`).toBe(ld.type);
          expect(Boolean(cd.unique), `${ns}.${attr} unique`).toBe(Boolean(ld.unique));
          expect(Boolean(cd.indexed), `${ns}.${attr} indexed`).toBe(Boolean(ld.indexed));
        }
      });

      it("never makes an existing optional attribute required", () => {
        // Existing rows may not carry it; newly requiring one breaks reads.
        const C = integration.schema.entities[ns]?.attrs ?? {};
        for (const [attr, ld] of Object.entries(L)) {
          if (ld.optional) expect(C[attr]?.optional, `${ns}.${attr}`).toBe(true);
        }
      });
    });
  }
});

describe("rules stay default-deny", () => {
  it("covers exactly the deployed namespaces", () => {
    expect(Object.keys(integration.rules).sort()).toEqual(
      [...Object.keys(legacyRules), ...REVIEWED_NAMESPACES].sort(),
    );
  });

  it("denies every operation on every namespace", () => {
    // Browsers hold no db credential; the Worker mediates with the app key.
    // Any expression other than "false" is a widened rule.
    for (const [ns, ops] of Object.entries(integration.rules)) {
      for (const [op, expr] of Object.entries(ops)) {
        expect(expr, `${ns}.${op} widened`).toBe("false");
      }
    }
  });
});

describe("behavior decisions that override a Chapter default", () => {
  it("provisions the Clerk account at submit (account: create)", () => {
    // Chapter requires an explicit choice; "none" would stop provisioning
    // accounts that the legacy ensureClerkAccount creates today.
    expect(chapter.account).toBe("create");
    expect(chapter.account).toBe(baseline.clerk.account);
  });

  it("fires adminNotification on payment, not on submit", () => {
    // Chapter defaults to "submit"; legacy fires it inside the Stripe webhook.
    expect(chapter.sends.adminNotification).toBe("payment");
    expect(chapter.sends.adminNotification).toBe(baseline.sends.adminNotification);
  });

  it("caps the focus array at the legacy 20, not Chapter's 100", () => {
    expect(chapter.application.maxArrayLen).toBe(20);
    expect(chapter.application.maxArrayLen).toBe(baseline.application.focusArrayCap);
  });

  it("projects nothing into client-readable Clerk metadata", () => {
    // Owner decision 2026-07-25: the legacy projection had no reader anywhere,
    // so it is dropped rather than preserved.
    expect(chapter.application.profileFields).toEqual([]);
  });

  it("requires disclaimer acknowledgement", () => {
    expect(chapter.application.requireDisclaimerAck).toBe(true);
  });
});

describe("behavior that must match the frozen baseline exactly", () => {
  it("validates the same join fields with the same caps", () => {
    expect([...chapter.application.required]).toEqual(baseline.application.required);
    expect([...chapter.application.optional]).toEqual(baseline.application.optional);
    expect(chapter.application.maxLen).toMatchObject(baseline.application.maxLen);
    expect(chapter.application.bodyCap).toBe(baseline.application.bodyCap);
    expect(chapter.application.validateEmail).toBe(baseline.application.validateEmail);
  });

  it("keeps phone and state optional server-side", () => {
    // join.html marks them required in markup, but the legacy SERVER accepts
    // them empty. Server validation is the contract being preserved.
    expect(chapter.application.optional).toContain("phone");
    expect(chapter.application.optional).toContain("state");
  });

  it("keeps the seven-stage pipeline and its subsets", () => {
    expect([...chapter.pipeline.stages]).toEqual(baseline.pipeline.stages);
    expect(chapter.pipeline.initial).toBe(baseline.pipeline.initial);
    expect([...chapter.pipeline.bookableFrom]).toEqual(baseline.pipeline.bookableFrom);
    expect([...chapter.pipeline.approvableFrom]).toEqual(baseline.pipeline.approvableFrom);
  });

  it("keeps the claim-mode ladder and the read-only super-admin tier", () => {
    expect(chapter.auth.source).toBe(baseline.auth.source);
    expect(chapter.auth.claim).toBe(baseline.auth.claim);
    expect([...chapter.auth.ladder]).toEqual(baseline.auth.ladder);
    expect(chapter.auth.adminRole).toBe("admin");
    expect(chapter.auth.superAdmins).toBe(true);
  });

  it("approves by promoting to member and sending onboardingInvite", () => {
    expect(chapter.operations.onApprove.promoteTo).toBe(baseline.operations.onApprove.promoteTo);
    expect(chapter.operations.onApprove.send).toBe(baseline.operations.onApprove.send);
  });

  it("blocks refunds from approved and refunded, and cancels the subscription", () => {
    const allowed = chapter.operations.refund.allowedFrom;
    expect(allowed).not.toBeNull();
    expect([...allowed]).toEqual(baseline.operations.refund.allowedFrom);
    for (const blocked of baseline.operations.refund.blockedFrom) {
      expect(allowed, `refund must be blocked from ${blocked}`).not.toContain(blocked);
    }
    expect(chapter.operations.refund.cancelSubscription).toBe(true);
  });

  it("keeps the deployed price shape", () => {
    // The live Stripe Price stays authoritative for what is actually charged;
    // this only asserts the rendered contract.
    expect(chapter.config.prices.standardCents).toBe(baseline.prices.standardPriceCents);
    expect(chapter.config.prices.foundingDiscountCents).toBe(baseline.prices.foundingDiscountCents);
    expect(
      chapter.config.prices.standardCents - chapter.config.prices.foundingDiscountCents,
    ).toBe(baseline.prices.dueTodayCents);
  });

  it("materializes one managed founding tier at the existing $900 Price", () => {
    expect(chapter.config.tiers).toEqual([{
      id: "founding",
      name: "Founding Member",
      priceCents: baseline.prices.dueTodayCents,
      stripePriceId: baseline.prices.stripePriceId,
      sortOrder: 0,
      active: true,
    }]);
  });

  it("keeps the deployed scheduling rules", () => {
    const s = chapter.config.scheduling;
    expect(s.slotMinutes).toBe(baseline.scheduling.slotMinutes);
    expect([...s.days]).toEqual(baseline.scheduling.days);
    expect(s.startHour).toBe(baseline.scheduling.startHour);
    expect(s.endHour).toBe(baseline.scheduling.endHour);
    expect(s.timezone).toBe(baseline.scheduling.timezone);
  });
});

describe("follower role", () => {
  it("leads no edge yet", () => {
    // Owner decision 2026-07-25: follower only. A target appearing here without
    // a decision means someone configured outbound sharing by accident.
    expect(chapter.network.targets).toEqual([]);
  });

  it("exposes only the approved leader read and shared-note lanes", () => {
    expect(chapter.network.readers).toEqual([{
      id: "built-not-found",
      fields: { person: ["name"] },
      sharedNotes: ["person"],
      editableFields: {},
      stageTransitions: [],
    }]);
    expect(chapter.network.readers[0].admissionGrants).toBeUndefined();
  });

  it("declares person as the only receivable CRM type", () => {
    // A custom crm REPLACES Chapter's default; a leader may only send types
    // declared here. Adding a type is a deliberate contract change.
    expect(Object.keys(chapter.crm.config.types)).toEqual(["person"]);
  });

  it("accepts BNF signup control only for the development Stripe runtime", () => {
    expect(chapter.signupControl).toEqual({
      sourceId: "built-not-found",
      secretName: "signup_control_secret",
      stripeMode: "test",
    });
  });

  it("preserves local member content under a separate signed BNF parent layer", () => {
    expect(chapter.memberContent).toEqual({
      enabled: true,
      localAuthoring: true,
      parent: {
        sourceId: "built-not-found",
        secretName: "member_content_control_secret",
      },
    });
  });
});

describe("group seed is insert-only and cannot overwrite owner edits", () => {
  it("uses Chapter plus a data-only descriptor for the retired newsletter rows", () => {
    expect(odlaConfig.integrations).toHaveLength(2);
    expect(Object.keys(odlaConfig.integrations[0].schema.entities).sort()).toEqual(
      Object.keys(integration.schema.entities).sort(),
    );
    expect(odlaConfig.integrations[1]).toMatchObject({
      id: "retained-newsletter-data",
      seeds: [],
      probes: [],
      rules: {
        newsletterSignups: {
          view: "false",
          create: "false",
          update: "false",
          delete: "false",
        },
      },
    });
    expect(Object.keys(odlaConfig.integrations[1].schema.entities)).toEqual([
      "newsletterSignups",
    ]);
  });

  it("seeds the groups row, crm_config singleton, and managed founding tier", () => {
    const namespaces = integration.seeds.map((s) => s.ns ?? s.namespace).sort();
    expect(namespaces).toEqual(["crm_config", "groups", "tiers"]);
  });

  it("seeds the group under the live group id", () => {
    const group = integration.seeds.find((s) => (s.ns ?? s.namespace) === "groups");
    expect(group.attrs.id).toBe("silver-and-salt-capital");
  });

  it("seeds the founding tier by its public id without changing the legacy group row", () => {
    const tier = integration.seeds.find((s) => (s.ns ?? s.namespace) === "tiers");
    expect(tier.attrs).toMatchObject({
      id: "founding",
      groupId: "silver-and-salt-capital",
      priceCents: baseline.prices.dueTodayCents,
      stripePriceId: baseline.prices.stripePriceId,
      active: true,
    });
  });
});

describe("shared Stripe account isolation", () => {
  const target = {
    appId: "silver-and-salt-capital",
    environment: "dev",
    dataEnvironment: "dev",
    runtime: "test",
    chapterId: "silver-and-salt-capital",
  };

  it("normalizes the exact app, data environment, and runtime metadata", () => {
    const event = normalizeWebhookEvent({
      id: "evt_ssc",
      type: "invoice.paid",
      data: { object: {
        billing_reason: "subscription_create",
        customer: "cus_ssc",
        metadata: {
          applicationId: "app_ssc",
          odlaAppId: target.appId,
          odlaEnvironment: target.environment,
          odlaDataEnvironment: target.dataEnvironment,
          odlaRuntime: target.runtime,
        },
      } },
    });
    expect(event).toMatchObject({
      kind: "first_payment",
      applicationId: "app_ssc",
      customerId: "cus_ssc",
      appId: target.appId,
      environment: target.environment,
      dataEnvironment: target.dataEnvironment,
      runtime: target.runtime,
    });
  });

  it("applies only an exactly tagged Silver & Salt event", () => {
    expect(classifyMemberStripeEvent(target, target, false)).toBe("apply");
    expect(classifyMemberStripeEvent({ ...target, appId: "sibling-chapter" }, target, true))
      .toBe("ignore_sibling");
    expect(classifyMemberStripeEvent({ ...target, dataEnvironment: "prod" }, target, true))
      .toBe("ignore_sibling");
    expect(classifyMemberStripeEvent({ ...target, runtime: "live" }, target, true))
      .toBe("ignore_sibling");
  });

  it("accepts an untagged legacy event only after a proven local link", () => {
    expect(classifyMemberStripeEvent({}, target, false)).toBe("quarantine_unmatched");
    expect(classifyMemberStripeEvent({}, target, true)).toBe("apply_legacy");
  });

  it("deduplicates an identical Stripe replay and quarantines id collisions", () => {
    expect(planMemberSystemEventReplay([
      { id: "evt_once", digest: "sha256:a" },
      { id: "evt_once", digest: "sha256:a" },
      { id: "evt_collision", digest: "sha256:b" },
      { id: "evt_collision", digest: "sha256:c" },
    ])).toEqual({
      accepted: ["evt_once", "evt_collision"],
      replayed: ["evt_once"],
      collisions: ["evt_collision"],
    });
  });
});
