#!/usr/bin/env node
// Read-only: which membership offerings (SKUs) the Built Not Found commercial
// authority has published for this chapter. A tier the join page offers but
// the authority has no published offering for cannot produce a payment quote,
// so its payment step dead-ends before Stripe is ever reached.
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
const bnf = JSON.parse(readFileSync(`${process.env.HOME}/.odla/apps/built-not-found/credentials.json`, "utf8")).envs.prod;
const bdb = initAdmin({ appId: bnf.tenantId, adminToken: bnf.dbKey, endpoint: "https://db.odla.ai" });
const r = await bdb.query({ membershipOfferingVersion: {}, discountPolicyVersion: {} });
console.log("offeringVersions:", (r.membershipOfferingVersion ?? []).length);
for (const row of r.membershipOfferingVersion ?? []) {
  const s = row.snapshot ?? {};
  console.log(" offering:", JSON.stringify({ chapter: s.chapterId, baseSkuId: s.baseSkuId, status: s.status, version: s.version, priceCents: s.basePriceCents ?? s.priceCents, seatPriceCents: s.seatPriceCents, providerPriceId: s.providerPriceId ?? s.stripePriceId }));
}
for (const row of r.discountPolicyVersion ?? []) {
  const s = row.snapshot ?? {};
  console.log(" policy:", JSON.stringify({ chapter: s.chapterId, status: s.status, cohort: s.cohortLabel, skus: s.cohortEligibleSkuIds, discountSkus: s.discountEligibleSkuIds }));
}

// Follower side: the tier catalog the signed revision delivered, and the
// steward application that never reached Stripe.
const silver = JSON.parse(readFileSync("/Users/tori/Projects/Silver-and-Salt/.odla/credentials.local.json", "utf8")).envs.prod;
const sdb = initAdmin({ appId: silver.tenantId, adminToken: silver.dbKey, endpoint: "https://db.odla.ai" });
const s = await sdb.query({ tiers: {}, applications: {}, membershipQuoteProjections: {} });
console.log("\nFOLLOWER TIERS:", (s.tiers ?? []).length);
for (const t of s.tiers ?? []) console.log(" tier:", JSON.stringify({ id: t.id, name: t.name, groupId: t.groupId, priceCents: t.priceCents, stripePriceId: t.stripePriceId ?? null, currency: t.currency, interval: t.interval, active: t.active, free: t.free }));
console.log("\nSTEWARD APPLICATIONS:");
for (const a of (s.applications ?? []).filter((a) => a.tierId === "steward")) {
  console.log(" app:", JSON.stringify({ id: String(a.id).slice(0, 8), tierId: a.tierId, groupId: a.groupId, status: a.status, stripeRuntime: a.stripeRuntime ?? null, canceled: a.canceled ?? null, giftOfferId: a.giftOfferId ?? null, namedSeatId: a.namedSeatId ?? null, giftSeatInterest: a.giftSeatInterest ?? null, createdAt: a.$createdAt }));
}
console.log("\nQUOTE PROJECTIONS:");
for (const q of s.membershipQuoteProjections ?? []) console.log(" proj:", JSON.stringify({ app: String(q.applicationId).slice(0, 8), skuId: q.skuId, status: q.status, revision: q.revision }));
