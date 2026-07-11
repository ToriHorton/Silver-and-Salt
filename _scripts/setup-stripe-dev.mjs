// One-time Stripe Test Mode setup for the DEV tenant. Idempotent.
// Prerequisite: the owner pasted stripe_secret_key (sk_test_...) into the
// Studio vault for the dev env.
// Usage: node _scripts/setup-stripe-dev.mjs pk_test_...
//   (the publishable key is public by design and passed as the argument)
//
// Creates (or finds) the membership Product, its $900 yearly Price, and the
// webhook endpoint pointing at the dev worker; writes price id and
// publishable key onto the group row. NEVER prints any secret; the webhook
// signing secret is revealed only in the Stripe dashboard for the owner to
// paste into Studio as stripe_webhook_secret.
import { initAdmin, tx } from "@odla-ai/db";
import { readFileSync } from "node:fs";

const GROUP_ID = "silver-and-salt-capital";
const WEBHOOK_URL = "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev/api/webhooks/stripe";
const EVENTS = ["invoice.paid", "charge.refunded", "customer.subscription.deleted"];
const PRODUCT_NAME = "Silver & Salt Capital Membership";
const FOUNDING_YEARLY_CENTS = 90000;

const pk = process.argv[2];
if (!pk || !pk.startsWith("pk_")) {
  console.error("usage: node _scripts/setup-stripe-dev.mjs pk_test_...");
  process.exit(1);
}

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

// Product (find by name, else create).
const products = await stripe("GET", "/v1/products", { limit: 100, active: "true" });
let product = products.data.find((p) => p.name === PRODUCT_NAME);
if (!product) {
  product = await stripe("POST", "/v1/products", { name: PRODUCT_NAME });
  console.log("created product", product.id);
} else {
  console.log("found product", product.id);
}

// Yearly founding price (find matching, else create).
const prices = await stripe("GET", "/v1/prices", { product: product.id, limit: 100, active: "true" });
let price = prices.data.find(
  (p) => p.unit_amount === FOUNDING_YEARLY_CENTS && p.recurring?.interval === "year" && p.currency === "usd",
);
if (!price) {
  price = await stripe("POST", "/v1/prices", {
    product: product.id,
    unit_amount: FOUNDING_YEARLY_CENTS,
    currency: "usd",
    "recurring[interval]": "year",
    nickname: "Founding member yearly",
  });
  console.log("created price", price.id);
} else {
  console.log("found price", price.id);
}

// Webhook endpoint (find by URL, else create; secret never printed).
const endpoints = await stripe("GET", "/v1/webhook_endpoints", { limit: 100 });
let endpoint = endpoints.data.find((e) => e.url === WEBHOOK_URL);
if (!endpoint) {
  endpoint = await stripe("POST", "/v1/webhook_endpoints", {
    url: WEBHOOK_URL,
    enabled_events: EVENTS,
    description: "Silver & Salt Capital dev worker",
  });
  console.log("created webhook endpoint", endpoint.id, "(signing secret NOT printed)");
} else {
  console.log("found webhook endpoint", endpoint.id);
}

// Write price id + publishable key onto the group row.
await db.transact(
  tx.groups[GROUP_ID].update({ stripePriceId: price.id, stripePublishableKey: pk }),
);
console.log("group row updated: stripePriceId + stripePublishableKey set");
console.log("");
console.log("REMAINING HUMAN STEP: Stripe dashboard -> Developers -> Webhooks ->");
console.log(`endpoint ${endpoint.id} -> reveal Signing secret -> paste into Studio`);
console.log("(dev env secrets) as stripe_webhook_secret.");
