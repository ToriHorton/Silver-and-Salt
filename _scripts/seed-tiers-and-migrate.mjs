#!/usr/bin/env node
// Seed the three membership tiers and migrate J1's `applications.tier` onto the
// engine's `applications.tierId`.
//
//   node _scripts/seed-tiers-and-migrate.mjs            # plan only, writes nothing
//   node _scripts/seed-tiers-and-migrate.mjs --apply
//
// WHY THIS RUNS OUTSIDE `provision`. Seeding tiers is normally provisioning's
// job — the chapter integration carries one seed row per declared tier. But
// pushing schema on this tenant is currently blocked:
//
//   400 schema_conflict: cannot remove strict namespace calendar_connection
//   while it contains data
//
// `calendar_connection` is created by the PLATFORM when Google Calendar consent
// is granted. No @odla-ai package declares it, so it appears in no integration,
// so the composed schema omits it — and an omission reads as a removal. While
// it is empty the removal succeeds silently (which is how a provision on
// 2026-08-20 dropped a live calendar connection, prompting the CLI to re-run
// consent); once it holds a row, provisioning cannot proceed at all. Report
// upstream via `odla-ai bug report`; do not "fix" it by declaring a platform
// namespace with a guessed shape, which risks altering the platform's own
// indexes.
//
// Seeds are insert-only by design, so writing the same rows directly reaches
// the identical end state. Once the platform issue is resolved, `provision`
// takes this over and this script can go.
//
// Rows are taken straight off the chapter integration's own seed list — the
// exact rows `provision` would write — rather than hand-authored or rebuilt
// from config. If the engine changes how it seeds a tier, this follows.

import { readFile } from "node:fs/promises";
import { initAdmin, tx } from "@odla-ai/db";
import { createChapterIntegration } from "@odla-ai/chapter";
import { chapter } from "../src/chapter.config.mjs";

const APPLY = process.argv.includes("--apply");
const ENV = "dev";

// The J1 `tier` value and the engine `tierId` are the same slug for all three,
// so the map is an identity — written out anyway so a future rename has one
// obvious place to live.
const TIER_IDS = { associate: "associate", founding: "founding", steward: "steward" };

const creds = JSON.parse(await readFile(".odla/credentials.local.json", "utf8"));
const env = creds.envs?.[ENV];
if (!env?.tenantId || !env?.dbKey) throw new Error(`no ${ENV} credentials`);
const db = initAdmin({ appId: env.tenantId, adminToken: env.dbKey, endpoint: creds.dbEndpoint });

// ── 1. Tier seeds ────────────────────────────────────────────────────────
const integration = createChapterIntegration(chapter, { basePath: "/api/crm" });
const seeds = integration.seeds
  .filter((s) => (s.ns ?? s.namespace) === "tiers")
  .map((s) => s.attrs);
if (seeds.length === 0) throw new Error("chapter integration produced no tier seeds — is `tiers` declared in src/chapter.config.mjs?");
const { tiers: existingTiers = [] } = await db.query({ tiers: {} });
const haveTier = new Set(existingTiers.map((t) => t.id));
const toSeed = seeds.filter((row) => !haveTier.has(row.id));

// ── 2. tier -> tierId migration ──────────────────────────────────────────
const { applications = [] } = await db.query({ applications: {} });
const needMigration = applications.filter((a) => a.tier && !a.tierId);
const unknown = needMigration.filter((a) => !TIER_IDS[a.tier]);
const migratable = needMigration.filter((a) => TIER_IDS[a.tier]);

console.log(JSON.stringify({
  mode: APPLY ? "apply" : "plan",
  tiers: {
    declared: seeds.map((s) => `${s.id} @ ${s.priceCents}`),
    alreadyPresent: [...haveTier],
    toSeed: toSeed.map((s) => s.id),
  },
  migration: {
    applications: applications.length,
    carryingTier: applications.filter((a) => a.tier).length,
    alreadyHaveTierId: applications.filter((a) => a.tierId).length,
    toMigrate: migratable.map((a) => `${a.id}: ${a.tier} -> ${TIER_IDS[a.tier]}`),
    unknownTierValues: unknown.map((a) => `${a.id}: ${a.tier}`),
  },
  // Owner decision 2026-08-20: nobody on dev is counted, so this assigns no
  // member numbers. Numbering starts clean in production.
  numbersAssigned: 0,
}, null, 2));

if (unknown.length) {
  throw new Error(`refusing to migrate: ${unknown.length} application(s) carry a tier value with no engine equivalent`);
}

if (!APPLY) {
  console.log("\nplan only — nothing written. Re-run with --apply.");
  process.exit(0);
}

for (const row of toSeed) {
  await db.transact(tx.tiers[row.id].update(row));
}
// `tier` is deliberately LEFT IN PLACE beside `tierId`. Retiring it is a
// separate, verified step; keeping both means no single cut-over moment and an
// easy read-back comparison.
for (const a of migratable) {
  await db.transact(tx.applications[a.id].update({ tierId: TIER_IDS[a.tier] }));
}

const { tiers: after = [] } = await db.query({ tiers: {} });
const { applications: apps2 = [] } = await db.query({ applications: {} });
console.log(JSON.stringify({
  applied: { tiersSeeded: toSeed.length, applicationsMigrated: migratable.length },
  verify: {
    tierRows: after.map((t) => `${t.id}: ${t.name} @ ${t.priceCents}${t.stripePriceId ? " (stripe)" : " (free)"}`),
    withTierId: apps2.filter((a) => a.tierId).length,
    stillOnlyLegacyTier: apps2.filter((a) => a.tier && !a.tierId).length,
  },
}, null, 2));
