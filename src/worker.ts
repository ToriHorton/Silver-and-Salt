// Worker for the Silver & Salt Capital site.
// Phase 1: health endpoint + static assets pass-through.
// Phase 2: /api/applications routes backed by odla-db (dev tenant).
//
// The Worker is the only thing that talks to odla-db; it uses the app key
// (ODLA_API_KEY, a Wrangler secret), which bypasses the deny-all rules.
// Browsers never receive a db credential.

import { initAdmin, tx, uuidv7, OdlaError } from "@odla-ai/db";
import { initCalendar } from "@odla-ai/calendar";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { sendTemplated, type GroupRow } from "./email";

interface Env {
  ASSETS: Fetcher;
  ODLA_ENDPOINT: string;
  ODLA_TENANT: string;
  ODLA_PLATFORM: string;
  ODLA_APP_ID: string;
  ODLA_ENV: string;
  ODLA_API_KEY: string;
}

// ── Auth (Phase 3) ─────────────────────────────────────────────────
// Clerk is the source of truth for identity. The worker verifies session
// JWTs itself: issuer comes from the platform's public-config (cached ~5
// minutes per isolate, so a key rotation propagates without a redeploy),
// keys from the issuer's JWKS (cached per issuer).
//
// Roles (owner-specified): provisional | member | admin. The role rides in
// the session token's `role` claim (Clerk publicMetadata.role); a missing
// or unknown claim means provisional, the safest default.

type PublicConfig = {
  env?: string;
  clerkPublishableKey?: string | null;
  issuer?: string | null;
  link?: string;
};

type Role = "provisional" | "member" | "admin";
type AuthedUser = { userId: string; email?: string; role: Role };

let publicConfigCache: { value: PublicConfig; at: number } | null = null;
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

async function getPublicConfig(env: Env): Promise<PublicConfig> {
  if (publicConfigCache && Date.now() - publicConfigCache.at < 5 * 60_000) {
    return publicConfigCache.value;
  }
  const res = await fetch(
    `${env.ODLA_PLATFORM}/registry/apps/${env.ODLA_APP_ID}/public-config?env=${env.ODLA_ENV}`,
  );
  if (!res.ok) throw new Error(`public-config fetch failed: ${res.status}`);
  const value = (await res.json()) as PublicConfig;
  publicConfigCache = { value, at: Date.now() };
  return value;
}

async function verifyUser(req: Request, env: Env): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);

  const { issuer } = await getPublicConfig(env);
  if (!issuer) return null;

  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    jwksByIssuer.set(issuer, jwks);
  }

  try {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (!payload.sub) return null;
    const role: Role =
      payload.role === "admin" || payload.role === "member"
        ? payload.role
        : "provisional";
    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      role,
    };
  } catch {
    return null;
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

// join.html form fields (see src/odla/schema.mjs). Optional scalars are
// omitted when blank: odla-db has no NULL.
const REQUIRED = ["firstName", "lastName", "email", "referral", "whoYouAre", "message"] as const;
const OPTIONAL = ["referralName", "linkedin", "phone", "state"] as const;
const MAX_LEN: Record<string, number> = {
  firstName: 200, lastName: 200, email: 320, referral: 100,
  referralName: 200, whoYouAre: 100, linkedin: 500, message: 5000,
  phone: 40, state: 60,
};

function parseApplication(body: Record<string, unknown>):
  | { ok: true; attrs: Record<string, unknown> }
  | { ok: false; error: string } {
  const attrs: Record<string, unknown> = {};
  for (const f of REQUIRED) {
    const v = typeof body[f] === "string" ? (body[f] as string).trim() : "";
    if (!v) return { ok: false, error: `missing required field: ${f}` };
    if (v.length > MAX_LEN[f]) return { ok: false, error: `field too long: ${f}` };
    attrs[f] = v;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attrs.email as string)) {
    return { ok: false, error: "invalid email" };
  }
  for (const f of OPTIONAL) {
    const v = typeof body[f] === "string" ? (body[f] as string).trim() : "";
    if (v.length > MAX_LEN[f]) return { ok: false, error: `field too long: ${f}` };
    if (v) attrs[f] = v;
  }
  const focus = Array.isArray(body.focus)
    ? body.focus.filter((x): x is string => typeof x === "string").slice(0, 20)
    : [];
  attrs.focus = focus;
  return { ok: true, attrs };
}

const STATUSES = [
  "submitted",
  "paid_pending_vetting",
  "call_scheduled",
  "interviewed",
  "approved",
  "declined",
  "refunded",
] as const;

// The default (and at launch, only) group. Applications may carry another
// groupId when a second brand exists (PAYMENT-SPEC.md lift-and-shift).
const DEFAULT_GROUP_ID = "silver-and-salt-capital";

type Db = ReturnType<typeof initAdmin>;

// ── Groups (per-brand settings, odla-db) ───────────────────────────
let groupCache: { value: GroupRow; at: number } | null = null;

async function getGroup(db: Db, groupId: string): Promise<GroupRow | null> {
  if (groupCache && groupCache.value.id === groupId && Date.now() - groupCache.at < 60_000) {
    return groupCache.value;
  }
  const { groups } = await db.query({ groups: { $: { where: { id: groupId }, limit: 1 } } });
  const row = (groups?.[0] as unknown as GroupRow) ?? null;
  if (row) groupCache = { value: row, at: Date.now() };
  return row;
}

const groupLineItems = (g: GroupRow) => ({
  standardCents: g.standardPriceCents,
  discountCents: g.foundingDiscountCents,
  dueTodayCents: g.standardPriceCents - g.foundingDiscountCents,
  renews: "annually",
});

// ── Stripe (REST via fetch; secret key from the tenant vault) ──────
async function getVaultSecret(db: Db, name: string): Promise<string | null> {
  try {
    return await db.secrets.get(name);
  } catch {
    return null;
  }
}

// Form-encode with Stripe's bracket syntax for nested params.
function stripeForm(params: Record<string, string | number | Record<string, string>>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "object") {
      for (const [k2, v2] of Object.entries(v)) out.append(`${k}[${k2}]`, v2);
    } else {
      out.append(k, String(v));
    }
  }
  return out.toString();
}

async function stripeCall(
  sk: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, string | number | Record<string, string>>,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const url = `https://api.stripe.com${path}${method === "GET" && params ? `?${stripeForm(params)}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${sk}`,
      ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" && params ? stripeForm(params) : undefined,
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

// Verify a Stripe webhook signature: HMAC-SHA256 over `${t}.${payload}`
// with the endpoint signing secret, constant-time compare, 5 min tolerance.
async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=", 2) as [string, string]),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// Latest application for an email (a person may reapply; newest wins).
async function findApplicationByEmail(db: Db, email: string) {
  const { applications } = await db.query({
    applications: { $: { where: { email }, order: { createdAt: "desc" }, limit: 1 } },
  });
  return applications?.[0] ?? null;
}

// Create (or find) the applicant's Clerk account at application time, so
// their member account exists without a separate sign-up step. The email
// stays unverified until their first sign-in; Clerk's email-code flow
// verifies it then. The Clerk secret key lives in the tenant vault
// (Studio-pasted, name "clerk_secret_key", never in the repo or Wrangler);
// while it is absent this quietly no-ops and applicants can still sign up
// by hand at /members/.
async function ensureClerkAccount(
  db: Db,
  email: string,
  firstName: string,
  lastName: string,
  // Application profile stored on the Clerk user too (owner-directed):
  // phone, state, whoYouAre, focus, linkedin. Readable client-side as
  // user.publicMetadata.profile; the intro message stays db-only.
  profile?: Record<string, unknown>,
): Promise<boolean> {
  let sk: string;
  try {
    sk = await db.secrets.get("clerk_secret_key");
  } catch {
    return false;
  }
  try {
    const res = await fetch("https://api.clerk.com/v1/users", {
      method: "POST",
      headers: { authorization: `Bearer ${sk}`, "content-type": "application/json" },
      body: JSON.stringify({
        email_address: [email],
        first_name: firstName,
        last_name: lastName,
        skip_password_requirement: true,
        ...(profile ? { public_metadata: { profile } } : {}),
      }),
    });
    if (res.ok) return true;
    if (res.status === 422) {
      // The email already has an account: refresh its profile metadata.
      if (profile) {
        try {
          const found = await fetch(
            `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
            { headers: { authorization: `Bearer ${sk}` } },
          );
          const users = (await found.json()) as Array<{ id: string }>;
          if (users?.[0]?.id) {
            await fetch(`https://api.clerk.com/v1/users/${users[0].id}/metadata`, {
              method: "PATCH",
              headers: { authorization: `Bearer ${sk}`, "content-type": "application/json" },
              body: JSON.stringify({ public_metadata: { profile } }),
            });
          }
        } catch (err) {
          console.error("clerk profile refresh failed", err);
        }
      }
      return true;
    }
    console.error("clerk account create failed", res.status);
    return false;
  } catch (err) {
    console.error("clerk account create errored", err);
    return false;
  }
}

// Roles live in Clerk publicMetadata (the source of truth). Read them in
// bulk with the vault secret key; a missing key degrades to "everyone with
// an account is provisional" rather than failing the console.
// Note: single page of 100; paginate when the community outgrows it.
async function fetchClerkRoles(db: Db): Promise<Map<string, Role> | null> {
  let sk: string;
  try {
    sk = await db.secrets.get("clerk_secret_key");
  } catch {
    return null;
  }
  try {
    const res = await fetch("https://api.clerk.com/v1/users?limit=100", {
      headers: { authorization: `Bearer ${sk}` },
    });
    if (!res.ok) return null;
    const users = (await res.json()) as Array<{
      id: string;
      public_metadata?: Record<string, unknown>;
    }>;
    const map = new Map<string, Role>();
    for (const u of users) {
      const r = u.public_metadata?.role;
      map.set(u.id, r === "admin" || r === "member" ? r : "provisional");
    }
    return map;
  } catch {
    return null;
  }
}

const applicationSummary = (a: Record<string, unknown>) => ({
  id: a.id,
  firstName: a.firstName,
  lastName: a.lastName,
  email: a.email,
  status: a.status,
  meetingAt: (a.meetingAt as number) || null,
  meetingLink: (a.meetingLink as string) || null,
  createdAt: a.createdAt,
  paid: Boolean(a.stripeSubscriptionId) && a.status !== "refunded",
  renewalAt: a.renewalAt ?? null,
  canceled: a.canceled === true,
});

// ── Calendar mirror correlation (PAYMENT-SPEC / phase-2b) ─────────
// The $bookings mirror (read-only Google sync) is the authoritative source
// of introduction-call bookings. On read paths we correlate a booking to
// its application by attendee email: meetingAt/meetingLink follow the
// mirror, and status only ever advances to call_scheduled (never regresses
// an admin-advanced status). A vanished booking clears the time (0 / "")
// but leaves status alone. The mirror being unavailable is never an error.
type CalClient = ReturnType<typeof initCalendar>;

const BOOKING_SYNCABLE = ["submitted", "paid_pending_vetting", "call_scheduled"];

async function syncBookingFromMirror(
  db: Db,
  cal: CalClient,
  env: Env,
  app: Record<string, unknown>,
): Promise<void> {
  if (!BOOKING_SYNCABLE.includes(app.status as string)) return;

  let next: { startAt: number; htmlLink?: string } | null = null;
  try {
    // Look back one hour so an in-progress call still shows.
    next = await cal.bookings.next(app.email as string, { from: Date.now() - 3_600_000 });
  } catch {
    return; // mirror optional: not connected / transient failure
  }

  const attrs: Record<string, unknown> = {};
  if (next) {
    if (app.meetingAt !== next.startAt) attrs.meetingAt = next.startAt;
    if (next.htmlLink && app.meetingLink !== next.htmlLink) attrs.meetingLink = next.htmlLink;
    if (app.status === "submitted" || app.status === "paid_pending_vetting") {
      attrs.status = "call_scheduled";
    }
  } else if (app.meetingLink) {
    // Mirror-sourced booking disappeared (cancelled): clear the time.
    attrs.meetingAt = 0;
    attrs.meetingLink = "";
  }
  if (Object.keys(attrs).length === 0) return;

  await db.transact(tx.applications[app.id as string].update(attrs));
  Object.assign(app, attrs);

  // A newly discovered booking triggers the pre-meeting prep email once.
  if (next && !app.prepEmailSentAt) {
    const group = await getGroup(db, (app.groupId as string) ?? DEFAULT_GROUP_ID);
    if (group) {
      await sendTemplated(db, env.ODLA_ENV, group, {
        template: "prepEmail",
        to: app.email as string,
        vars: { firstName: app.firstName as string },
        applicationId: app.id as string,
        dedupeKey: `prep:${app.id}`,
      });
      await db.transact(tx.applications[app.id as string].update({ prepEmailSentAt: Date.now() }));
      app.prepEmailSentAt = Date.now();
    }
  }
}

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  // Public: the sign-in page bootstraps ClerkJS from this (same-origin, so
  // the page needs no hardcoded key and prod picks up its own config).
  if (req.method === "GET" && url.pathname === "/api/auth/config") {
    const { clerkPublishableKey, issuer } = await getPublicConfig(env);
    return json({ publishableKey: clerkPublishableKey ?? null, issuer: issuer ?? null });
  }

  const db = initAdmin({
    appId: env.ODLA_TENANT,
    adminToken: env.ODLA_API_KEY,
    endpoint: env.ODLA_ENDPOINT,
  });
  const cal = initCalendar({
    appId: env.ODLA_TENANT,
    adminToken: env.ODLA_API_KEY,
    endpoint: env.ODLA_ENDPOINT,
  });

  // Public: everything the join page needs to render its compliance and
  // payment steps. Copy comes from the group row, never code; paymentsReady
  // stays false until Stripe is configured, and the page then skips the
  // payment step entirely (also the GitHub Pages behavior, where /api 404s).
  const joinConfigMatch = url.pathname.match(/^\/api\/groups\/([a-z0-9-]+)\/join-config$/);
  if (req.method === "GET" && joinConfigMatch) {
    const group = await getGroup(db, joinConfigMatch[1]);
    if (!group) return json({ error: "not found" }, 404);
    const stripeKey = await getVaultSecret(db, "stripe_secret_key");
    return json({
      groupId: group.id,
      name: group.name,
      disclaimerText: group.disclaimerText,
      refundPolicyText: group.refundPolicyText,
      trustCopy: group.trustCopy,
      lineItems: groupLineItems(group),
      publishableKey: group.stripePublishableKey ?? null,
      paymentsReady: Boolean(group.stripePublishableKey && group.stripePriceId && stripeKey),
      // The group's booking page (Google appointment schedule embed). Must
      // be a schedule on the calendar the mirror is connected to, or
      // bookings never correlate.
      calendarLink: group.calendarLink ?? null,
    });
  }

  // Public: create the annual subscription for a submitted application and
  // return the first invoice's payment client secret. The application id is
  // the capability (unguessable uuid known to the submitting browser).
  if (req.method === "POST" && url.pathname === "/api/payments/subscription") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
    if (!applicationId) return json({ error: "missing applicationId" }, 400);
    if (body.refundPolicyAck !== true) {
      return json({ error: "refund policy must be acknowledged" }, 400);
    }

    const { applications } = await db.query({
      applications: { $: { where: { id: applicationId }, limit: 1 } },
    });
    const app = applications?.[0];
    if (!app) return json({ error: "not found" }, 404);
    if (app.status !== "submitted") return json({ error: "already processed" }, 409);

    const group = await getGroup(db, (app.groupId as string) ?? DEFAULT_GROUP_ID);
    if (!group?.stripePriceId) return json({ error: "payments not configured" }, 503);
    const sk = await getVaultSecret(db, "stripe_secret_key");
    if (!sk) return json({ error: "payments not configured" }, 503);

    const meta = {
      applicationId,
      groupId: group.id,
      email: app.email as string,
    };

    let customerId = app.stripeCustomerId as string | undefined;
    if (!customerId) {
      const customer = await stripeCall(sk, "POST", "/v1/customers", {
        email: app.email as string,
        name: `${app.firstName} ${app.lastName}`,
        metadata: meta,
      });
      if (!customer.ok) {
        console.error("stripe customer create failed", customer.status, customer.body?.error);
        return json({ error: "payment setup failed" }, 502);
      }
      customerId = customer.body.id as string;
    }

    const sub = await stripeCall(sk, "POST", "/v1/subscriptions", {
      customer: customerId,
      "items[0][price]": group.stripePriceId,
      payment_behavior: "default_incomplete",
      "payment_settings[save_default_payment_method]": "on_subscription",
      // Card only: keeps Link/Amazon Pay/Cash App/Klarna (and Link's
      // save-my-info upsell) out of the Payment Element; the Express
      // Checkout element then offers just the card wallets
      // (Apple Pay / Google Pay once the domain is verified).
      "payment_settings[payment_method_types][0]": "card",
      // 2025+ Stripe API: the first invoice's client secret lives on
      // confirmation_secret (invoices no longer carry payment_intent).
      "expand[]": "latest_invoice.confirmation_secret",
      metadata: meta,
    });
    if (!sub.ok) {
      console.error("stripe subscription create failed", sub.status, sub.body?.error);
      return json({ error: "payment setup failed" }, 502);
    }
    const invoice = sub.body.latest_invoice as Record<string, unknown> | undefined;
    const confirmation = invoice?.confirmation_secret as Record<string, unknown> | undefined;
    const intent = invoice?.payment_intent as Record<string, unknown> | undefined;
    const clientSecret =
      (confirmation?.client_secret as string | undefined) ??
      (intent?.client_secret as string | undefined);
    if (!clientSecret) {
      console.error("stripe subscription missing client secret");
      return json({ error: "payment setup failed" }, 502);
    }

    await db.transact(
      tx.applications[applicationId].update({
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.body.id as string,
        refundPolicyAckAt: Date.now(),
      }),
    );

    return json({
      clientSecret,
      publishableKey: group.stripePublishableKey ?? null,
      lineItems: groupLineItems(group),
    });
  }

  // Public, signature-verified: the Stripe webhook.
  if (req.method === "POST" && url.pathname === "/api/webhooks/stripe") {
    const whsec = await getVaultSecret(db, "stripe_webhook_secret");
    if (!whsec) return json({ error: "webhook not configured" }, 503);
    const payload = await req.text();
    const sigHeader = req.headers.get("stripe-signature") ?? "";
    if (!(await verifyStripeSignature(payload, sigHeader, whsec))) {
      return json({ error: "invalid signature" }, 400);
    }

    const event = JSON.parse(payload) as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    const obj = event.data.object;

    // Locate the application. Subscription metadata is the join key; the
    // customer id and email are fallbacks (PAYMENT-SPEC.md 5.2).
    async function findApplication(): Promise<Record<string, unknown> | null> {
      const metaHolders = [
        obj.metadata,
        (obj.subscription_details as Record<string, unknown> | undefined)?.metadata,
        ((obj.parent as Record<string, unknown> | undefined)?.subscription_details as
          | Record<string, unknown>
          | undefined)?.metadata,
      ];
      for (const m of metaHolders) {
        const appId = (m as Record<string, unknown> | undefined)?.applicationId;
        if (typeof appId === "string" && appId) {
          const { applications } = await db.query({
            applications: { $: { where: { id: appId }, limit: 1 } },
          });
          if (applications?.[0]) return applications[0];
        }
      }
      const customerId = typeof obj.customer === "string" ? obj.customer : "";
      if (customerId) {
        const { applications } = await db.query({
          applications: {
            $: { where: { stripeCustomerId: customerId }, order: { createdAt: "desc" }, limit: 1 },
          },
        });
        if (applications?.[0]) return applications[0];
      }
      return null;
    }

    if (event.type === "invoice.paid") {
      const app = await findApplication();
      if (!app) {
        console.error("webhook: no application for invoice", event.id);
        return json({ ok: true, matched: false });
      }
      const lines = (obj.lines as { data?: Array<Record<string, unknown>> } | undefined)?.data;
      const period = lines?.[0]?.period as { end?: number } | undefined;
      const renewalAt = period?.end ? period.end * 1000 : undefined;
      const first = obj.billing_reason === "subscription_create";

      if (first) {
        const attrs: Record<string, unknown> = {
          ...(app.status === "submitted" ? { status: "paid_pending_vetting" } : {}),
          ...(renewalAt ? { renewalAt } : {}),
        };
        if (Object.keys(attrs).length) {
          await db.transact(tx.applications[app.id as string].update(attrs), {
            mutationId: `stripe:${event.id}`,
          });
        }
        const group = await getGroup(db, (app.groupId as string) ?? DEFAULT_GROUP_ID);
        if (group) {
          const vars = {
            firstName: app.firstName as string,
            lastName: app.lastName as string,
            email: app.email as string,
            phone: (app.phone as string) ?? "",
            state: (app.state as string) ?? "",
            adminUrl: `${url.origin}/admin/`,
            membersUrl: `${url.origin}/members/`,
          };
          await sendTemplated(db, env.ODLA_ENV, group, {
            template: "adminNotification",
            to: group.notificationEmail,
            vars,
            applicationId: app.id as string,
            dedupeKey: `${event.id}:admin`,
          });
          await sendTemplated(db, env.ODLA_ENV, group, {
            template: "paymentConfirmation",
            to: app.email as string,
            vars,
            applicationId: app.id as string,
            dedupeKey: `${event.id}:confirm`,
          });
        }
      } else if (renewalAt) {
        await db.transact(tx.applications[app.id as string].update({ renewalAt }), {
          mutationId: `stripe:${event.id}`,
        });
      }
      return json({ ok: true });
    }

    if (event.type === "charge.refunded") {
      const app = await findApplication();
      if (!app) return json({ ok: true, matched: false });
      await db.transact(tx.applications[app.id as string].update({ status: "refunded" }), {
        mutationId: `stripe:${event.id}`,
      });
      // Phase R hook: reverse any pending referral credit here.
      return json({ ok: true });
    }

    if (event.type === "customer.subscription.deleted") {
      const app = await findApplication();
      if (!app) return json({ ok: true, matched: false });
      await db.transact(tx.applications[app.id as string].update({ canceled: true }), {
        mutationId: `stripe:${event.id}`,
      });
      return json({ ok: true });
    }

    return json({ ok: true, ignored: event.type });
  }

  // Gated: any verified session. Returns the user plus their application
  // (matched by email) so the member area can show status and meeting time.
  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = await verifyUser(req, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    let application = null;
    if (user.email) {
      const a = await findApplicationByEmail(db, user.email);
      if (a) {
        await syncBookingFromMirror(db, cal, env, a);
        application = applicationSummary(a);
        if (a.clerkUserId !== user.userId) {
          // Lazy link; mutationId makes retries exactly-once.
          await db.transact(
            tx.applications[a.id as string].update({ clerkUserId: user.userId }),
            { mutationId: `link:${a.id}:${user.userId}` },
          );
        }
      }
    }
    return json({ ...user, application });
  }

  // ── Admin routes ────────────────────────────────────────────────
  if (url.pathname.startsWith("/api/admin/")) {
    const user = await verifyUser(req, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (user.role !== "admin") return json({ error: "forbidden" }, 403);

    // One row per person, joined by lowercased email: the $users mirror
    // (accounts), applications (pipeline), and Clerk roles. Replaces the
    // former separate applications/members listings.
    if (req.method === "GET" && url.pathname === "/api/admin/people") {
      const [appsRes, usersRes, roles] = await Promise.all([
        db.query({ applications: { $: { order: { createdAt: "desc" }, limit: 200 } } }),
        db.query({ $users: { $: { limit: 200 } } }),
        fetchClerkRoles(db),
      ]);

      // Refresh booking state from the mirror for the active pipeline
      // (bounded; terminal statuses are skipped inside the sync).
      const syncable = ((appsRes.applications ?? []) as Array<Record<string, unknown>>)
        .filter((a) => BOOKING_SYNCABLE.includes(a.status as string))
        .slice(0, 50);
      await Promise.all(syncable.map((a) => syncBookingFromMirror(db, cal, env, a)));

      type PersonRow = {
        email: string;
        name: string;
        userId: string | null;
        role: Role | null;
        application: ReturnType<typeof applicationSummary> | null;
      };
      const people = new Map<string, PersonRow>();

      for (const u of (usersRes.$users ?? []) as Array<Record<string, unknown>>) {
        // Deleted Clerk users stay in the mirror as tombstones; they are
        // not accounts any more.
        if (u.deleted === true) continue;
        const email = typeof u.email === "string" ? u.email : "";
        if (!email) continue;
        people.set(email.toLowerCase(), {
          email,
          name: typeof u.name === "string" ? u.name : "",
          userId: u.id as string,
          role: roles?.get(u.id as string) ?? "provisional",
          application: null,
        });
      }

      for (const a of (appsRes.applications ?? []) as Array<Record<string, unknown>>) {
        const key = (a.email as string).toLowerCase();
        const row = people.get(key);
        const name = `${a.firstName} ${a.lastName}`;
        if (row) {
          // Applications are newest-first; keep only the latest per person.
          if (!row.application) row.application = applicationSummary(a);
          if (!row.name) row.name = name;
        } else {
          people.set(key, {
            email: a.email as string,
            name,
            userId: null,
            role: null,
            application: applicationSummary(a),
          });
        }
      }

      // Applications first (newest on top), account-only rows after.
      const rows = [...people.values()].sort((x, y) => {
        const xc = (x.application?.createdAt as number) ?? -1;
        const yc = (y.application?.createdAt as number) ?? -1;
        return yc - xc;
      });
      return json({ people: rows });
    }

    // Upcoming mirrored bookings (the owner's booking calendar), each
    // flagged with the application it correlates to, if any. Read-only:
    // changes happen in Google Calendar via htmlLink.
    if (req.method === "GET" && url.pathname === "/api/admin/bookings") {
      const [bookingsRes, appsRes] = await Promise.all([
        db.query({ $bookings: { $: { order: { startAt: "desc" }, limit: 500 } } }),
        db.query({ applications: { $: { order: { createdAt: "desc" }, limit: 200 } } }),
      ]);
      const appByEmail = new Map<string, Record<string, unknown>>();
      for (const a of (appsRes.applications ?? []) as Array<Record<string, unknown>>) {
        const key = (a.email as string).toLowerCase();
        if (!appByEmail.has(key)) appByEmail.set(key, a);
      }
      const cutoff = Date.now() - 3_600_000;
      const upcoming = ((bookingsRes.$bookings ?? []) as Array<Record<string, unknown>>)
        .filter((b) => b.status === "confirmed" && (b.startAt as number) >= cutoff)
        .sort((x, y) => (x.startAt as number) - (y.startAt as number))
        .slice(0, 25)
        .map((b) => {
          const attendees = ((b.attendees as Array<string | { email?: string }>) ?? [])
            .map((a) => (typeof a === "string" ? a : a.email ?? ""))
            .filter(Boolean);
          const matched = attendees
            .map((e) => appByEmail.get(e.toLowerCase()))
            .find(Boolean);
          return {
            startAt: b.startAt,
            endAt: b.endAt,
            summary: b.summary,
            attendees,
            htmlLink: b.htmlLink,
            application: matched
              ? { id: matched.id, name: `${matched.firstName} ${matched.lastName}`, status: matched.status }
              : null,
          };
        });
      return json({ bookings: upcoming });
    }

    // Change a person's role (Clerk publicMetadata, the source of truth).
    if (req.method === "POST" && url.pathname === "/api/admin/people/role") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }
      const targetId = typeof body.userId === "string" ? body.userId : "";
      const role = body.role;
      if (!targetId.startsWith("user_")) return json({ error: "invalid userId" }, 400);
      if (role !== "provisional" && role !== "member" && role !== "admin") {
        return json({ error: "role must be provisional, member, or admin" }, 400);
      }
      // Self-demotion lockout guard: admins change other people's roles.
      if (targetId === user.userId) {
        return json({ error: "you cannot change your own role" }, 400);
      }

      let sk: string;
      try {
        sk = await db.secrets.get("clerk_secret_key");
      } catch {
        return json({ error: "role management unavailable: clerk_secret_key missing from vault" }, 503);
      }
      const res = await fetch(`https://api.clerk.com/v1/users/${targetId}/metadata`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${sk}`, "content-type": "application/json" },
        body: JSON.stringify({ public_metadata: { role } }),
      });
      if (res.status === 404) return json({ error: "user not found" }, 404);
      if (!res.ok) {
        console.error("clerk role update failed", res.status);
        return json({ error: "role update failed upstream" }, 502);
      }
      return json({ ok: true });
    }

    // The deliberate approval action (PAYMENT-SPEC.md 5.3): status ->
    // approved, Clerk role -> member, onboarding invite. Fires once; never
    // triggered by payment alone.
    const approveMatch = url.pathname.match(/^\/api\/admin\/applications\/([0-9a-f-]+)\/approve$/);
    if (req.method === "POST" && approveMatch) {
      const id = approveMatch[1];
      const { applications } = await db.query({
        applications: { $: { where: { id }, limit: 1 } },
      });
      const app = applications?.[0];
      if (!app) return json({ error: "not found" }, 404);
      const from = app.status as string;
      if (!["paid_pending_vetting", "call_scheduled", "interviewed"].includes(from)) {
        return json({ error: `cannot approve from status "${from}"` }, 409);
      }

      await db.transact(tx.applications[id].update({ status: "approved" }));

      // Promote the linked account to member (best effort; reported).
      // clerkUserId links lazily at first sign-in, so fall back to a Clerk
      // lookup by email for accounts that have never signed in.
      let rolePromoted = false;
      const sk = await getVaultSecret(db, "clerk_secret_key");
      if (sk) {
        let targetUserId = (app.clerkUserId as string) || null;
        if (!targetUserId) {
          try {
            const found = await fetch(
              `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(app.email as string)}`,
              { headers: { authorization: `Bearer ${sk}` } },
            );
            const users = (await found.json()) as Array<{ id: string }>;
            targetUserId = users?.[0]?.id ?? null;
            if (targetUserId) {
              await db.transact(tx.applications[id].update({ clerkUserId: targetUserId }));
            }
          } catch (err) {
            console.error("approve: clerk lookup failed", err);
          }
        }
        if (targetUserId) {
          const res = await fetch(`https://api.clerk.com/v1/users/${targetUserId}/metadata`, {
            method: "PATCH",
            headers: { authorization: `Bearer ${sk}`, "content-type": "application/json" },
            body: JSON.stringify({ public_metadata: { role: "member" } }),
          });
          rolePromoted = res.ok;
          if (!res.ok) console.error("approve: role promotion failed", res.status);
        }
      }

      let emailLogged = false;
      const group = await getGroup(db, (app.groupId as string) ?? DEFAULT_GROUP_ID);
      if (group) {
        await sendTemplated(db, env.ODLA_ENV, group, {
          template: "onboardingInvite",
          to: app.email as string,
          vars: {
            firstName: app.firstName as string,
            membersUrl: `${url.origin}/members/`,
          },
          applicationId: id,
          dedupeKey: `approve:${id}`,
        });
        emailLogged = true;
      }

      // Phase R hook: write the referral credit here.
      return json({ ok: true, status: "approved", rolePromoted, emailLogged });
    }

    // The non-fit action (PAYMENT-SPEC.md 5.4): refund the first invoice in
    // full and cancel the subscription. The status flip to "refunded" comes
    // from the charge.refunded webhook, keeping Stripe the source of truth.
    const refundMatch = url.pathname.match(/^\/api\/admin\/applications\/([0-9a-f-]+)\/refund$/);
    if (req.method === "POST" && refundMatch) {
      const id = refundMatch[1];
      const { applications } = await db.query({
        applications: { $: { where: { id }, limit: 1 } },
      });
      const app = applications?.[0];
      if (!app) return json({ error: "not found" }, 404);
      if (app.status === "refunded") return json({ error: "already refunded" }, 409);
      if (app.status === "approved") {
        return json({ error: "approved memberships are non-refundable per policy; handle in Stripe if truly needed" }, 409);
      }
      const subscriptionId = app.stripeSubscriptionId as string | undefined;
      if (!subscriptionId) return json({ error: "no subscription on file" }, 409);
      const sk = await getVaultSecret(db, "stripe_secret_key");
      if (!sk) return json({ error: "payments not configured" }, 503);

      // 2025+ Stripe API: invoices no longer expose payment_intent, so
      // find the earliest succeeded, unrefunded charge on the customer.
      const customerId = app.stripeCustomerId as string | undefined;
      if (!customerId) return json({ error: "no customer on file" }, 409);
      const charges = await stripeCall(sk, "GET", "/v1/charges", {
        customer: customerId,
        limit: 100,
      });
      if (!charges.ok) {
        console.error("refund: charge list failed", charges.status);
        return json({ error: "refund failed upstream" }, 502);
      }
      const chargeRows = ((charges.body.data as Array<Record<string, unknown>>) ?? [])
        .filter((c) => c.status === "succeeded" && c.refunded !== true);
      const firstCharge = chargeRows[chargeRows.length - 1];
      if (!firstCharge) return json({ error: "no paid charge to refund" }, 409);

      const refund = await stripeCall(sk, "POST", "/v1/refunds", {
        charge: firstCharge.id as string,
      });
      if (!refund.ok) {
        console.error("refund failed", refund.status, refund.body?.error);
        return json({ error: "refund failed upstream" }, 502);
      }

      const cancel = await stripeCall(sk, "DELETE", `/v1/subscriptions/${subscriptionId}`);
      if (!cancel.ok) console.error("subscription cancel failed", cancel.status);

      return json({
        ok: true,
        refundedCents: (refund.body.amount as number) ?? null,
        subscriptionCanceled: cancel.ok,
      });
    }

    const patchMatch = url.pathname.match(/^\/api\/admin\/applications\/([0-9a-f-]+)$/);
    if (req.method === "PATCH" && patchMatch) {
      const id = patchMatch[1];
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }

      const attrs: Record<string, unknown> = {};
      if (body.status !== undefined) {
        if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) {
          return json({ error: `status must be one of: ${STATUSES.join(", ")}` }, 400);
        }
        attrs.status = body.status;
      }
      if (body.meetingAt !== undefined) {
        if (typeof body.meetingAt !== "number" || !Number.isFinite(body.meetingAt)) {
          return json({ error: "meetingAt must be epoch milliseconds" }, 400);
        }
        attrs.meetingAt = body.meetingAt;
      }
      if (Object.keys(attrs).length === 0) return json({ error: "nothing to update" }, 400);

      // Verify the row exists first: update() upserts, and a typo'd id must
      // not create a phantom partial row.
      const { applications } = await db.query({
        applications: { $: { where: { id }, limit: 1 } },
      });
      if (!applications?.length) return json({ error: "not found" }, 404);

      await db.transact(tx.applications[id].update(attrs));
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  }

  if (req.method === "POST" && url.pathname === "/api/applications") {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 32_768) return json({ error: "body too large" }, 413);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }

    const parsed = parseApplication(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const id = uuidv7();
    // Stable mutationId when the client sends a submissionId: retries and
    // double-clicks dedupe server-side to exactly one row.
    const submissionId = typeof body.submissionId === "string" && body.submissionId.trim()
      ? body.submissionId.trim().slice(0, 100)
      : undefined;

    const { duplicate } = await db.transact(
      tx.applications[id].update({
        id, // mirrored as an attr per @odla-ai/db porting notes
        ...parsed.attrs,
        groupId: DEFAULT_GROUP_ID,
        status: "submitted",
        createdAt: Date.now(),
        ...(body.disclaimerAck === true ? { disclaimerAckAt: Date.now() } : {}),
      }),
      submissionId ? { mutationId: `join:${submissionId}` } : undefined,
    );

    const accountCreated = await ensureClerkAccount(
      db,
      parsed.attrs.email as string,
      parsed.attrs.firstName as string,
      parsed.attrs.lastName as string,
      {
        phone: parsed.attrs.phone ?? "",
        state: parsed.attrs.state ?? "",
        whoYouAre: parsed.attrs.whoYouAre ?? "",
        focus: parsed.attrs.focus ?? [],
        linkedin: parsed.attrs.linkedin ?? "",
      },
    );

    return json({ ok: true, id, duplicate: duplicate ?? false, accountCreated }, 201);
  }

  // Gated: admins only (an internal stat per the owner's role model).
  // Public, capability-guarded: the application id is an unguessable uuid
  // known only to the browser that submitted it. Reports that the applicant
  // booked their introduction call (time optional). Never moves status
  // backwards: it only applies while the application sits in
  // submitted/call_scheduled, so admin progression wins.
  const bookingMatch = url.pathname.match(/^\/api\/applications\/([0-9a-f-]+)\/booking$/);
  if (req.method === "POST" && bookingMatch) {
    const id = bookingMatch[1];
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // an empty body is fine: "booked, time unknown"
    }

    let meetingAt: number | undefined;
    if (body.meetingAt !== undefined) {
      const ms = Number(body.meetingAt);
      const now = Date.now();
      if (!Number.isFinite(ms) || ms < now - 86_400_000 || ms > now + 2 * 365 * 86_400_000) {
        return json({ error: "meetingAt out of range" }, 400);
      }
      meetingAt = ms;
    }

    const { applications } = await db.query({
      applications: { $: { where: { id }, limit: 1 } },
    });
    const existing = applications?.[0];
    if (!existing) return json({ error: "not found" }, 404);

    // In the payment flow, booking follows payment (paid_pending_vetting).
    const bookable = ["submitted", "paid_pending_vetting", "call_scheduled"];
    if (!bookable.includes(existing.status as string)) {
      return json({ ok: true, applied: false });
    }

    await db.transact(
      tx.applications[id].update({
        status: "call_scheduled",
        ...(meetingAt !== undefined ? { meetingAt } : {}),
      }),
    );

    // Pre-meeting prep email, once per application (PAYMENT-SPEC.md 8.3).
    if (!existing.prepEmailSentAt) {
      const group = await getGroup(db, (existing.groupId as string) ?? DEFAULT_GROUP_ID);
      if (group) {
        await sendTemplated(db, env.ODLA_ENV, group, {
          template: "prepEmail",
          to: existing.email as string,
          vars: { firstName: existing.firstName as string },
          applicationId: id,
          dedupeKey: `prep:${id}`,
        });
        await db.transact(tx.applications[id].update({ prepEmailSentAt: Date.now() }));
      }
    }

    return json({ ok: true, applied: true });
  }

  if (req.method === "GET" && url.pathname === "/api/applications/count") {
    const user = await verifyUser(req, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (user.role !== "admin") return json({ error: "forbidden" }, 403);
    const { count } = await db.aggregate("applications", { count: true });
    return json({ count });
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true }, 200, { "x-odla-worker": "silver-and-salt-capital" });
    }

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(req, env, url);
      } catch (err) {
        if (err instanceof OdlaError) {
          // Branch on code, never message text; don't leak details to callers.
          console.error("odla error", err.code, err.requestId);
          return json({ error: "upstream error", code: err.code }, err.retryable ? 503 : 502);
        }
        console.error("api error", err);
        return json({ error: "internal error" }, 500);
      }
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
