#!/usr/bin/env node
// Read-only: why money has or has not reached the bank account.
// Reads the live Stripe account the Built Not Found tenant bills through.
// No writes, no transfers, no payout creation. Amounts and statuses only.
import { readFileSync } from "node:fs";
import { initAdmin } from "@odla-ai/db";

const bnf = JSON.parse(readFileSync(`${process.env.HOME}/.odla/apps/built-not-found/credentials.json`, "utf8")).envs.prod;
const bdb = initAdmin({ appId: bnf.tenantId, adminToken: bnf.dbKey, endpoint: "https://db.odla.ai" });
const sk = await bdb.secrets.get("stripe_secret_key");
const api = async (path) => {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${sk}` } });
  return res.json();
};
const usd = (c) => (typeof c === "number" ? `$${(c / 100).toFixed(2)}` : String(c));
const day = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : null);

const acct = await api("account");
console.log("ACCOUNT");
console.log("  id:", acct.id, "| country:", acct.country, "| default currency:", acct.default_currency);
console.log("  business name:", acct.business_profile?.name ?? acct.settings?.dashboard?.display_name ?? null);
console.log("  charges_enabled:", acct.charges_enabled, "| payouts_enabled:", acct.payouts_enabled, "| details_submitted:", acct.details_submitted);
const sched = acct.settings?.payouts?.schedule;
console.log("  payout schedule:", sched ? JSON.stringify(sched) : "none");
console.log("  statement descriptor:", acct.settings?.payments?.statement_descriptor ?? null);

const req = acct.requirements ?? {};
console.log("\nREQUIREMENTS (what Stripe is still waiting for)");
console.log("  disabled_reason:", req.disabled_reason ?? null);
console.log("  currently_due:", JSON.stringify(req.currently_due ?? []));
console.log("  past_due:", JSON.stringify(req.past_due ?? []));
console.log("  pending_verification:", JSON.stringify(req.pending_verification ?? []));
console.log("  current_deadline:", req.current_deadline ? new Date(req.current_deadline * 1000).toISOString() : null);
if (acct.future_requirements?.currently_due?.length) console.log("  future currently_due:", JSON.stringify(acct.future_requirements.currently_due));

const ext = await api("account/external_accounts?object=bank_account&limit=10");
console.log("\nBANK ACCOUNTS ON FILE:", ext.error ? `ERROR ${ext.error.message}` : (ext.data?.length ?? 0));
for (const b of ext.data ?? []) {
  console.log(`  ${b.bank_name ?? "(unnamed bank)"} ****${b.last4} | ${b.currency} | status: ${b.status} | default_for_currency: ${b.default_for_currency}`);
}

const bal = await api("balance");
console.log("\nBALANCE");
for (const k of ["available", "pending", "connect_reserved"]) {
  for (const b of bal[k] ?? []) console.log(`  ${k}: ${usd(b.amount)} ${b.currency}`);
}

const payouts = await api("payouts?limit=10");
console.log("\nPAYOUTS:", payouts.error ? `ERROR ${payouts.error.message}` : (payouts.data?.length ?? 0));
for (const p of payouts.data ?? []) {
  console.log(`  ${day(p.created)} ${usd(p.amount)} status=${p.status} arrival=${day(p.arrival_date)} method=${p.method} failure=${p.failure_code ?? "none"}`);
}

const txns = await api("balance_transactions?limit=20");
console.log("\nBALANCE TRANSACTIONS:", txns.data?.length ?? 0);
let net = 0;
for (const t of txns.data ?? []) {
  net += t.net;
  console.log(`  ${day(t.created)} ${t.type.padEnd(18)} gross=${usd(t.amount)} fee=${usd(t.fee)} net=${usd(t.net)} status=${t.status} available=${day(t.available_on)}`);
}
console.log("  net of the above:", usd(net));
