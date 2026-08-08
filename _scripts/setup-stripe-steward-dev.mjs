// Steward-tier Stripe setup for the DEV tenant. Idempotent.
// Adds the Community Steward $5,000 yearly Price to the existing membership
// Product and writes steward pricing, price id, trust copy, and the neutral
// admin-notification template onto the group row (JOURNEYS-PLAN.md J1).
// Prerequisite: _scripts/setup-stripe-dev.mjs has run (product exists) and
// stripe_secret_key is in the dev vault. NEVER prints any secret.
// Usage: node _scripts/setup-stripe-steward-dev.mjs
import { initAdmin, tx } from "@odla-ai/db";
import { readFileSync } from "node:fs";

const GROUP_ID = "silver-and-salt-capital";
const PRODUCT_NAME = "Silver & Salt Capital Membership";
const STEWARD_YEARLY_CENTS = 500000;

// Counsel-pending, like refundPolicyText (counsel review list item 2).
const STEWARD_REFUND_POLICY =
  "Community Steward Pricing & Refund Policy. Your $5,000 Community Steward fee covers your " +
  "first year and is charged when you submit your application, before your introductory " +
  "conversation with Silver & Salt Capital. Membership is annual and renews automatically each " +
  "year unless you cancel before the renewal date. If, after that conversation, Silver & Salt " +
  "Capital determines that membership is not a mutual fit, your full $5,000 is refunded to your " +
  "original payment method and your membership is canceled. Refunds are issued within five " +
  "business days of that decision and typically appear on your statement within five to ten " +
  "business days, depending on your bank. Every application is reviewed and resolved within 30 " +
  "days. Once your membership is approved and active, the fee for the current year covers that " +
  "year and is non-refundable.";

// Counsel-pending, like trustCopy (counsel review list item 3).
const STEWARD_TRUST_COPY =
  "Community Steward rate: $5,000 a year. Your card is charged $5,000.00 today to hold " +
  "your place as a Community Steward. Membership renews automatically each year at $5,000 " +
  "for as long as you remain a member, and you can cancel anytime before a renewal. After " +
  "our conversation, if we decide membership is not the right fit, your $5,000 is refunded " +
  "in full and your membership is canceled.";

// Neutral wording: this heads-up now fires at payment or first booking,
// whichever comes first, so free Associate applications send it too.
const ADMIN_NOTIFICATION = {
  subject: "New membership application: {{firstName}} {{lastName}}",
  text:
    "A new membership application is awaiting your review.\n\n" +
    "Name: {{firstName}} {{lastName}}\nTier: {{tier}}\nEmail: {{email}}\nPhone: {{phone}}\nState: {{state}}\n\n" +
    "Review it in the admin console: {{adminUrl}}",
};

const c = JSON.parse(readFileSync(new URL("../.odla/credentials.local.json", import.meta.url), "utf8"));
const db = initAdmin({
  appId: "silver-and-salt-capital--dev",
  adminToken: c.envs.dev.dbKey,
  endpoint: "https://db.odla.ai",
});

let sk;
try {
  sk = await db.secrets.get("stripe_secret_key");
} catch {
  console.error("stripe_secret_key is not in the dev vault yet. Paste it in Studio first.");
  process.exit(1);
}

async function stripe(method, path, params) {
  const form = params
    ? new URLSearchParams(Object.entries(params).flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((x, i) => [`${k}[${i}]`, x]) : [[k, String(v)]],
      )).toString()
    : undefined;
  const res = await fetch(`https://api.stripe.com${path}${method === "GET" && form ? `?${form}` : ""}`, {
    method,
    headers: {
      authorization: `Bearer ${sk}`,
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? form : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${body?.error?.message ?? "unknown"}`);
  return body;
}

const products = await stripe("GET", "/v1/products", { limit: 100, active: "true" });
const product = products.data.find((p) => p.name === PRODUCT_NAME);
if (!product) {
  console.error(`product "${PRODUCT_NAME}" not found; run _scripts/setup-stripe-dev.mjs first.`);
  process.exit(1);
}
console.log("found product", product.id);

const prices = await stripe("GET", "/v1/prices", { product: product.id, limit: 100, active: "true" });
let price = prices.data.find(
  (p) => p.unit_amount === STEWARD_YEARLY_CENTS && p.recurring?.interval === "year" && p.currency === "usd",
);
if (!price) {
  price = await stripe("POST", "/v1/prices", {
    product: product.id,
    unit_amount: STEWARD_YEARLY_CENTS,
    currency: "usd",
    "recurring[interval]": "year",
    nickname: "Community Steward yearly",
  });
  console.log("created steward price", price.id);
} else {
  console.log("found steward price", price.id);
}

// Merge the template update into the existing emailTemplates json so the
// other templates (and any enabled flags Tori set) survive untouched.
const { groups } = await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } });
if (!groups.length) throw new Error("group row not found");
const templates = { ...(groups[0].emailTemplates ?? {}) };
templates.adminNotification = { ...templates.adminNotification, ...ADMIN_NOTIFICATION };

await db.transact(
  tx.groups[GROUP_ID].update({
    stewardPriceCents: STEWARD_YEARLY_CENTS,
    stripeStewardPriceId: price.id,
    stewardTrustCopy: STEWARD_TRUST_COPY,
    stewardRefundPolicyText: STEWARD_REFUND_POLICY,
    emailTemplates: templates,
  }),
);
console.log("group row updated: stewardPriceCents, stripeStewardPriceId, stewardTrustCopy, adminNotification template");
