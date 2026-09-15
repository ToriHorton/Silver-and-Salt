#!/usr/bin/env node
// Read-only cross-check of a live purchase across Stripe, the Silver tenant
// and the BNF tenant. No writes, no PII beyond email domains and ids.
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";
const silver = JSON.parse(readFileSync("/Users/tori/Projects/Silver-and-Salt/.odla/credentials.local.json", "utf8")).envs.prod;
const bnf = JSON.parse(readFileSync(`${process.env.HOME}/.odla/apps/built-not-found/credentials.json`, "utf8")).envs.prod;
const sdb = initAdmin({ appId: silver.tenantId, adminToken: silver.dbKey, endpoint: "https://db.odla.ai" });
const bdb = initAdmin({ appId: bnf.tenantId, adminToken: bnf.dbKey, endpoint: "https://db.odla.ai" });
const red = (e) => (e || "").replace(/^[^@]+/, "***");
const iso = (t) => (typeof t === "number" ? new Date(t).toISOString() : t ?? null);

const s = await sdb.query({ applications: {}, emailLog: {}, stripeEventReceipts: {}, subscriptionCheckoutIntents: {}, membershipQuoteProjections: {}, meetings: {} });
console.log("SILVER counts:", JSON.stringify(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.length]))));
for (const a of s.applications) console.log(" application:", JSON.stringify({ id: a.id.slice(0, 8), status: a.status, tierId: a.tierId, email: red(a.email), customer: a.stripeCustomerId ? "set" : null, subscription: a.stripeSubscriptionId ? "set" : null, firstPaymentAt: iso(a.firstPaymentAt), paidAt: iso(a.paidAt), approvedAt: iso(a.approvedAt), renewalAt: iso(a.renewalAt) }));
for (const r of s.stripeEventReceipts) console.log(" receipt:", JSON.stringify({ event: r.eventType ?? r.type, disposition: r.disposition, matched: r.matched, kind: r.kind, at: iso(r.createdAt ?? r.receivedAt) }));
for (const e of s.emailLog) console.log(" email:", JSON.stringify({ template: e.template, to: red(e.to), state: e.deliveryState, error: e.error || null }));
for (const i of s.subscriptionCheckoutIntents ?? []) console.log(" checkoutIntent:", JSON.stringify({ status: i.status, tierId: i.tierId, dueTodayCents: i.dueTodayCents ?? i.amountCents, subscription: i.stripeSubscriptionId ? "set" : null }));
for (const q of s.membershipQuoteProjections ?? []) console.log(" quote:", JSON.stringify({ skuId: q.skuId, dueTodayCents: q.dueTodayCents, founding: q.founding, renewalCents: q.renewalCents, termEndsAt: iso(q.initialTermEndsAt) }));

const b = await bdb.query({ membershipRecord: {}, membershipEntitlement: {}, membershipSeat: {}, membershipEffect: {}, networkCommercialEvents: {}, networkCommercialExceptions: {}, signupControlDelivery: {}, membershipAuthorityState: {} });
console.log("BNF counts:", JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.length]))));
for (const m of b.membershipRecord) console.log(" membership:", JSON.stringify({ chapter: m.chapterId, env: m.environment, status: m.status, skuId: m.skuId, founding: m.founding, dueTodayCents: m.dueTodayCents, renewalCents: m.renewalCents, termEndsAt: iso(m.termEndsAt), memberNumber: m.memberNumber }));
for (const e of b.membershipEntitlement) console.log(" entitlement:", JSON.stringify({ status: e.status, chapter: e.chapterId, until: iso(e.endsAt ?? e.termEndsAt) }));
for (const f of b.membershipEffect) console.log(" effect:", JSON.stringify({ kind: f.kind, status: f.status, attempts: f.attempts }));
for (const ev of b.networkCommercialEvents) console.log(" stripeEvent(bnf):", JSON.stringify({ type: ev.eventType, livemode: ev.livemode, partition: ev.runtime ?? ev.partition, at: iso(ev.eventCreated ?? ev.createdAt) }));
for (const x of b.networkCommercialExceptions) console.log(" EXCEPTION:", JSON.stringify({ kind: x.kind, event: x.eventId, reason: x.reason }));
for (const d of b.signupControlDelivery) console.log(" delivery:", JSON.stringify({ target: d.targetId, status: d.status, revision: d.revision }));

// Stripe live, read-only: recent subscriptions on the account.
const sk = await bdb.secrets.get("stripe_secret_key");
const res = await fetch("https://api.stripe.com/v1/subscriptions?limit=5&status=all", { headers: { authorization: `Bearer ${sk}` } });
const subs = await res.json(); console.log("STRIPE live subscriptions:", subs.error ? "ERROR " + subs.error.message : (subs.data?.length ?? 0));
for (const sub of subs.data ?? []) console.log(" stripe subscription:", JSON.stringify({ id: sub.id.slice(0, 12) + "…", status: sub.status, amount: sub.items?.data?.[0]?.price?.unit_amount, discount: sub.discount?.coupon?.percent_off ?? sub.discounts?.length ?? null, price: sub.items?.data?.[0]?.price?.id, livemode: sub.livemode, partition: { app: sub.metadata?.appId, env: sub.metadata?.environment, runtime: sub.metadata?.runtime, chapter: sub.metadata?.chapterId } }));
const inv = await (await fetch("https://api.stripe.com/v1/invoices?limit=5", { headers: { authorization: `Bearer ${sk}` } })).json(); console.log("STRIPE live invoices:", inv.error ? "ERROR " + inv.error.message : (inv.data?.length ?? 0));
for (const i of inv.data ?? []) console.log(" stripe invoice:", JSON.stringify({ status: i.status, amountPaid: i.amount_paid, total: i.total, discount: i.total_discount_amounts?.reduce((a, d) => a + d.amount, 0) ?? 0, reason: i.billing_reason }));
