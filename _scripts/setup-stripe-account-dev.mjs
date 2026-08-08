// Point the DEV environment at whatever Stripe account the vault's
// stripe_secret_key belongs to. Idempotent, and safe to re-run.
//
// Use this when moving to a NEW Stripe account (e.g. off a shared sandbox
// onto the owner's own). It replaces the older pair of scripts
// (setup-stripe-dev.mjs + setup-stripe-steward-dev.mjs) by doing all of it:
//   1. membership Product
//   2. Founding $900/year Price
//   3. Community Steward $5,000/year Price
//   4. webhook endpoint aimed at the OWNER'S worker, with its signing secret
//      piped straight into the tenant vault (never printed, never in argv)
//   5. the group row: both price ids, the publishable key, steward copy,
//      and the neutral admin-notification template
//
// Usage: node _scripts/setup-stripe-account-dev.mjs pk_test_...
//   The publishable key is public by design (it ships in the page), so it is
//   fine as an argument. The SECRET key is never an argument: paste it into
//   Studio as the dev secret `stripe_secret_key` first.
import { initAdmin, tx } from "@odla-ai/db";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const GROUP_ID = "silver-and-salt-capital";
const PRODUCT_NAME = "Silver & Salt Capital Membership";
const FOUNDING_YEARLY_CENTS = 90000;
const STEWARD_YEARLY_CENTS = 500000;
// The owner's own dev worker. Stripe can only aim at one endpoint per
// account, and this is the worker she deploys.
const WEBHOOK_URL = "https://silver-and-salt-capital-dev.silver-and-salt.workers.dev/api/webhooks/stripe";
const EVENTS = ["invoice.paid", "charge.refunded", "customer.subscription.deleted"];

const pk = process.argv[2];
if (!pk || !pk.startsWith("pk_")) {
  console.error("usage: node _scripts/setup-stripe-account-dev.mjs pk_test_...");
  console.error("(publishable key only; the secret key goes into Studio, not here)");
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
  console.error("stripe_secret_key is not in the dev vault. Paste it into Studio first.");
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

// Guard: a publishable key from one account with a secret key from another
// yields a payment form that silently fails at confirmation. Stripe encodes
// the account id in the publishable key, so the mismatch is catchable here.
const account = await stripe("GET", "/v1/account");
const pkAccount = "acct_1" + pk.replace(/^pk_(test|live)_51/, "").slice(0, 16);
if (!account.id.startsWith(pkAccount.slice(0, 18))) {
  console.error(`MISMATCH: the vault secret key belongs to ${account.id} (${account.email}),`);
  console.error(`but the publishable key given looks like ${pkAccount}.`);
  console.error("Both keys must come from the SAME Stripe account. Nothing was changed.");
  process.exit(1);
}
console.log("account:", account.id, "|", account.email, "|", account.settings?.dashboard?.display_name ?? "(unnamed)");
if (account.charges_enabled && !pk.startsWith("pk_test_")) {
  console.error("refusing: this looks like a LIVE key. Dev is test-mode only until Phase 5.");
  process.exit(1);
}

// 1. Product
const products = await stripe("GET", "/v1/products", { limit: 100, active: "true" });
let product = products.data.find((p) => p.name === PRODUCT_NAME);
if (!product) {
  product = await stripe("POST", "/v1/products", { name: PRODUCT_NAME });
  console.log("created product", product.id);
} else {
  console.log("found product", product.id);
}

// 2 + 3. Prices
const prices = await stripe("GET", "/v1/prices", { product: product.id, limit: 100, active: "true" });
async function ensurePrice(cents, nickname) {
  const found = prices.data.find(
    (p) => p.unit_amount === cents && p.recurring?.interval === "year" && p.currency === "usd",
  );
  if (found) { console.log("found price", found.id, `(${nickname})`); return found; }
  const made = await stripe("POST", "/v1/prices", {
    product: product.id, unit_amount: cents, currency: "usd",
    "recurring[interval]": "year", nickname,
  });
  console.log("created price", made.id, `(${nickname})`);
  return made;
}
const foundingPrice = await ensurePrice(FOUNDING_YEARLY_CENTS, "Founding member yearly");
const stewardPrice = await ensurePrice(STEWARD_YEARLY_CENTS, "Community Steward yearly");

// 4. Webhook endpoint. The signing secret is returned ONLY at creation, so
// capture it there and pipe it into the vault over stdin; it is never
// printed, never an argument, and never written to disk.
const endpoints = await stripe("GET", "/v1/webhook_endpoints", { limit: 100 });
let endpoint = endpoints.data.find((e) => e.url === WEBHOOK_URL);
if (!endpoint) {
  endpoint = await stripe("POST", "/v1/webhook_endpoints", {
    url: WEBHOOK_URL,
    enabled_events: EVENTS,
    description: "Silver & Salt Capital dev worker (owner account)",
  });
  const r = spawnSync(
    "npx",
    ["odla-ai", "secrets", "set", "stripe_webhook_secret", "--env", "dev", "--stdin", "--yes"],
    { input: endpoint.secret, cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error("created endpoint", endpoint.id, "but the vault write FAILED:", r.stderr || r.stdout);
    console.error("Reveal its signing secret in the Stripe dashboard and paste it into Studio as stripe_webhook_secret.");
    process.exit(1);
  }
  console.log("created webhook endpoint", endpoint.id, "-> signing secret written to the vault");
} else {
  console.log("found webhook endpoint", endpoint.id, "(signing secret unchanged; it is only revealed at creation)");
}

// 5. Group row
const { groups } = await db.query({ groups: { $: { where: { id: GROUP_ID }, limit: 1 } } });
if (!groups.length) throw new Error("group row not found; run _scripts/seed-groups-dev.mjs first");
const templates = { ...(groups[0].emailTemplates ?? {}) };
templates.adminNotification = {
  ...templates.adminNotification,
  subject: "New membership application: {{firstName}} {{lastName}}",
  text:
    "A new membership application is awaiting your review.\n\n" +
    "Name: {{firstName}} {{lastName}}\nTier: {{tier}}\nEmail: {{email}}\nPhone: {{phone}}\nState: {{state}}\n\n" +
    "Review it in the admin console: {{adminUrl}}",
};

await db.transact(
  tx.groups[GROUP_ID].update({
    stripePriceId: foundingPrice.id,
    stripeStewardPriceId: stewardPrice.id,
    stripePublishableKey: pk,
    stewardPriceCents: STEWARD_YEARLY_CENTS,
    emailTemplates: templates,
  }),
);
console.log("group row updated: both price ids, publishable key, steward pricing, admin template");
console.log("");
console.log("dev is now pointed at", account.id + ".");
console.log("Next: redeploy the worker, then run a test payment on each paid tier.");
