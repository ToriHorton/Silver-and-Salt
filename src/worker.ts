// Worker for the Silver & Salt Capital site.
// Phase 1: health endpoint + static assets pass-through.
// Phase 2: /api/applications routes backed by odla-db (dev tenant).
//
// The Worker is the only thing that talks to odla-db; it uses the app key
// (ODLA_API_KEY, a Wrangler secret), which bypasses the deny-all rules.
// Browsers never receive a db credential.

import { initAdmin, tx, uuidv7, OdlaError } from "@odla-ai/db";
import { initCalendar, computeBookableSlots } from "@odla-ai/calendar";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  sendTemplated,
  resolveTransport,
  EMAIL_TEMPLATE_NAMES,
  type EmailTemplateName,
  type EmailTransport,
  type SendEmailBinding,
  type GroupRow,
} from "./email";
// CRM admin relationship layer (@odla-ai/crm), mounted at /api/crm/*. The
// operational flows below stay authoritative; src/crm-sync.mjs projects each
// person one-way into a crm_record. See src/crm.mjs for the model.
import { createCrmRoutes } from "@odla-ai/crm";
import { crm } from "./crm.mjs";
import { syncPersonToCrm, backfillCrm } from "./crm-sync.mjs";

interface Env {
  ASSETS: Fetcher;
  ODLA_ENDPOINT: string;
  ODLA_TENANT: string;
  ODLA_PLATFORM: string;
  ODLA_APP_ID: string;
  ODLA_ENV: string;
  ODLA_API_KEY: string;
  // Cloudflare Email Service (send_email in wrangler.jsonc). Optional: a
  // deploy without the binding or the verified from address falls back to
  // log-only sends (audited in emailLog, nothing delivered).
  SEND_EMAIL?: SendEmailBinding;
  EMAIL_FROM?: string;
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

// The CRM admin surface reuses the same Clerk verification as /api/admin/*:
// only an admin actor may act, and the CRM routes receive their userId/email.
async function crmAuthorize(
  req: Request,
  env: Env,
): Promise<{ userId: string; email?: string } | null> {
  const u = await verifyUser(req, env);
  if (!u || u.role !== "admin") return null;
  return u.email ? { userId: u.userId, email: u.email } : { userId: u.userId };
}

// The CRM's injected transport is the RAW Cloudflare sender: @odla-ai/crm does
// its own consent gating, dev-redirect, and audit, so wrapping it in the
// worker's sendTemplated redirect would double-redirect. Log-only -> omit the
// sender (CRM audits without delivering), matching the worker's own behavior.
function crmSender(mailer: EmailTransport) {
  if (mailer.name !== "cloudflare") return undefined;
  return {
    async send(payload: {
      from: string;
      to: string[];
      subject: string;
      text?: string;
      html?: string;
      replyTo?: string;
      headers?: Record<string, string>;
    }): Promise<{ messageId: string }> {
      return mailer.sender.send(payload);
    },
  };
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

// Super-admin: the tier that may create/modify admins. Stored in the
// `superAdmins` odla-db table, which the worker only ever READS (never writes);
// it is set exclusively in the odla Studio data browser. Keyed by lowercased
// email, matched against the caller's verified Clerk email.
async function isSuperAdmin(db: Db, email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const { superAdmins } = await db.query({
    superAdmins: { $: { where: { email: email.toLowerCase() }, limit: 1 } },
  });
  return Boolean(superAdmins?.[0]);
}

// A target user's current Clerk role + primary email (for role-change gating
// and the access lookup). Best-effort; null when the vault key is absent or the
// lookup fails.
async function clerkUserRoleEmail(
  db: Db,
  userId: string,
): Promise<{ role: Role; email?: string } | null> {
  const sk = await getVaultSecret(db, "clerk_secret_key");
  if (!sk) return null;
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { authorization: `Bearer ${sk}` },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as {
      public_metadata?: Record<string, unknown>;
      email_addresses?: Array<{ email_address?: string }>;
    };
    const r = u.public_metadata?.role;
    const role: Role = r === "admin" || r === "member" ? r : "provisional";
    return { role, email: u.email_addresses?.[0]?.email_address };
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

// ── Scheduling: odla-db is the source of truth (owner-directed) ────
// The meetings entity is canonical. Google Calendar is a projection: the
// export carries the invitation email and the Meet link. Drift (someone
// moving or cancelling the event in Google) is DETECTED and FLAGGED for
// the admin, never silently adopted.
type CalClient = ReturnType<typeof initCalendar>;

const BOOKABLE_STATUSES = ["submitted", "paid_pending_vetting", "call_scheduled"];

type SchedulingConfig = {
  slotMinutes: number;
  days: number[];
  startHour: number;
  endHour: number;
  timezone: string;
  minNoticeHours: number;
  windowDays: number;
  summaryTemplate: string;
};

const SCHEDULING_DEFAULTS: SchedulingConfig = {
  slotMinutes: 45,
  days: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 17,
  timezone: "America/Los_Angeles",
  minNoticeHours: 24,
  windowDays: 14,
  summaryTemplate: "Silver & Salt Capital: introduction call with {{firstName}} {{lastName}}",
};

function schedulingConfig(group: GroupRow & { schedulingJson?: unknown }): SchedulingConfig {
  const raw = (group.schedulingJson ?? {}) as Partial<SchedulingConfig>;
  return { ...SCHEDULING_DEFAULTS, ...raw };
}

async function bookableSlots(cal: CalClient, cfg: SchedulingConfig) {
  const from = Date.now();
  const to = from + cfg.windowDays * 86_400_000;
  const fb = await cal.availability.freeBusy({ timeMin: from, timeMax: to });
  return computeBookableSlots(fb.busy, {
    from: fb.timeMin,
    to: fb.timeMax,
    timezone: cfg.timezone,
    slotMinutes: cfg.slotMinutes,
    businessHours: { days: cfg.days, startHour: cfg.startHour, endHour: cfg.endHour },
    minNoticeMs: cfg.minNoticeHours * 3_600_000,
  });
}

async function scheduledMeetingFor(db: Db, applicationId: string) {
  const { meetings } = await db.query({
    meetings: {
      $: { where: { applicationId, status: "scheduled" }, order: { createdAt: "desc" }, limit: 1 },
    },
  });
  return meetings?.[0] ?? null;
}

// Reconcile canonical meetings with live Google events. Owner policy
// (2026-07-14): edits made in Google Calendar are legitimate edits and are
// ADOPTED into our database, with an adoption stamp so the admin can see
// that Google was the editor. A vanished event adopts as a cancellation.
async function reconcileWithGoogle(db: Db, cal: CalClient, meetings: Array<Record<string, unknown>>): Promise<void> {
  const active = meetings.filter(
    (m) => m.status === "scheduled" && (m.startAt as number) > Date.now() - 3_600_000 && m.googleEventId,
  );
  if (!active.length) return;

  let live: Array<{ eventId: string; startAt: number; endAt?: number; status?: string }>;
  try {
    const res = (await cal.availability.upcoming()) as Record<string, unknown> | Array<unknown>;
    const list = Array.isArray(res)
      ? res
      : ((res?.events ?? res?.bookings ?? []) as Array<unknown>);
    live = (list as Array<Record<string, unknown>>).map((b) => ({
      eventId: b.eventId as string,
      startAt: b.startAt as number,
      endAt: b.endAt as number | undefined,
      status: b.status as string | undefined,
    }));
  } catch (err) {
    console.error("google reconcile unavailable", err);
    return; // calendar unavailable: nothing changes
  }
  const byEventId = new Map(live.map((b) => [b.eventId, b]));

  for (const m of active) {
    const g = byEventId.get(m.googleEventId as string);
    if (!g || g.status === "cancelled") {
      // Removed in Google: adopt as a cancellation.
      const attrs = { status: "cancelled", drift: "none", adoptedFromGoogleAt: Date.now() };
      await db.transact(tx.meetings[m.id as string].update(attrs));
      await db.transact(
        tx.applications[m.applicationId as string].update({ meetingAt: 0, meetingLink: "" }),
      );
      Object.assign(m, attrs);
    } else if (g.startAt !== m.startAt) {
      // Moved in Google: adopt the new time (duration from Google when
      // known, else preserved).
      const duration = (m.endAt as number) - (m.startAt as number);
      const attrs = {
        startAt: g.startAt,
        endAt: g.endAt ?? g.startAt + duration,
        drift: "none",
        adoptedFromGoogleAt: Date.now(),
      };
      await db.transact(tx.meetings[m.id as string].update(attrs));
      await db.transact(tx.applications[m.applicationId as string].update({ meetingAt: g.startAt }));
      Object.assign(m, attrs);
    }
  }
}

// Time series for @odla-ai/ui MetricWidget: `wow` = 7 daily buckets, `mom` = 4
// weekly buckets, each with the previous period's aligned values (for the delta
// % and the ghost line). Built from event timestamps (ms). Day boundaries are
// UTC — fine for a rough trend.
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function bucketSeries(events: Array<{ t: number; v: number }>, now: number) {
  const day = 86_400_000;
  const sum = (start: number, end: number) =>
    events.reduce((acc, e) => (e.t >= start && e.t < end ? acc + e.v : acc), 0);
  const wow = { labels: [] as string[], current: [] as number[], previous: [] as number[] };
  for (let i = 6; i >= 0; i--) {
    const end = now - i * day;
    wow.labels.push(DOW[new Date(end - day / 2).getUTCDay()]);
    wow.current.push(sum(end - day, end));
    wow.previous.push(sum(end - 8 * day, end - 7 * day));
  }
  const mom = { labels: [] as string[], current: [] as number[], previous: [] as number[] };
  for (let i = 3; i >= 0; i--) {
    const end = now - i * 7 * day;
    mom.labels.push(`wk ${4 - i}`);
    mom.current.push(sum(end - 7 * day, end));
    mom.previous.push(sum(end - 35 * day, end - 28 * day));
  }
  return { wow, mom };
}

// A Stripe subscription's annualized amount in cents (monthly plans ×12).
function subAnnualCents(s: Record<string, unknown>): number {
  const items = ((s.items as { data?: Array<{ price?: { unit_amount?: number; recurring?: { interval?: string } }; quantity?: number }> })?.data ?? []);
  let cents = 0, interval = "year";
  for (const it of items) { cents += (it.price?.unit_amount ?? 0) * (it.quantity ?? 1); interval = it.price?.recurring?.interval ?? interval; }
  return cents * (interval === "month" ? 12 : 1);
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
    appId: env.ODLA_APP_ID,
    env: env.ODLA_ENV,
    adminToken: env.ODLA_API_KEY,
    endpoint: env.ODLA_PLATFORM,
  });
  // Cloudflare Email Service when wired, log-only otherwise; the seam means
  // every send call reads the same either way.
  const mailer: EmailTransport = resolveTransport(env.SEND_EMAIL, env.EMAIL_FROM);

  // ── CRM admin routes (@odla-ai/crm) ─────────────────────────────────
  // Mounted at /api/crm/*; the factory returns null outside its basePath, but
  // gating on the prefix keeps it off the public hot paths (join/slots/webhook)
  // entirely. authorize reuses verifyUser (admin-only); the sender is the raw
  // Cloudflare transport (CRM owns consent gating, dev-redirect, and audit).
  if (url.pathname.startsWith("/api/crm/")) {
    const crmRoutes = createCrmRoutes({
      crm,
      db,
      authorize: (r) => crmAuthorize(r, env),
      sender: crmSender(mailer),
      from: env.EMAIL_FROM,
      envName: env.ODLA_ENV,
      basePath: "/api/crm",
      baseUrl: url.origin,
    });
    const crmResp = await crmRoutes(req);
    if (crmResp) return crmResp;
  }

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

  // Public: bookable slots computed live (Google FreeBusy + the group's
  // business-hours rules). schedulingReady false while the calendar
  // connection is absent, and the page degrades gracefully.
  if (req.method === "GET" && url.pathname === "/api/schedule/slots") {
    const group = await getGroup(db, DEFAULT_GROUP_ID);
    if (!group) return json({ error: "not found" }, 404);
    const cfg = schedulingConfig(group as GroupRow & { schedulingJson?: unknown });
    try {
      const slots = await bookableSlots(cal, cfg);
      return json({
        schedulingReady: true,
        timezone: cfg.timezone,
        slotMinutes: cfg.slotMinutes,
        slots,
      });
    } catch (err) {
      const code = err instanceof OdlaError ? err.code : (err as { code?: string })?.code;
      console.error("slots unavailable", code);
      return json({ schedulingReady: false, code: code ?? "calendar_unavailable" });
    }
  }

  // Public, capability-guarded: book (or rebook) the introduction call.
  // The meeting row in odla-db is canonical; the Google event is the
  // projection that sends the invitation email and carries the Meet link.
  if (req.method === "POST" && url.pathname === "/api/schedule/book") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
    const startAt = Number(body.startAt);
    if (!applicationId || !Number.isFinite(startAt)) {
      return json({ error: "applicationId and startAt required" }, 400);
    }

    const { applications } = await db.query({
      applications: { $: { where: { id: applicationId }, limit: 1 } },
    });
    const app = applications?.[0];
    if (!app) return json({ error: "not found" }, 404);
    if (!BOOKABLE_STATUSES.includes(app.status as string)) {
      return json({ error: `cannot book from status "${app.status}"` }, 409);
    }

    const group = await getGroup(db, (app.groupId as string) ?? DEFAULT_GROUP_ID);
    if (!group) return json({ error: "group missing" }, 500);
    const cfg = schedulingConfig(group as GroupRow & { schedulingJson?: unknown });
    const endAt = startAt + cfg.slotMinutes * 60_000;

    // The chosen time must still be an offered slot; the platform re-checks
    // availability under a booking lease at insert as the final word.
    try {
      const slots = await bookableSlots(cal, cfg);
      if (!slots.some((s: { startAt: number }) => s.startAt === startAt)) {
        return json({ error: "slot no longer available", code: "calendar_slot_unavailable" }, 409);
      }
    } catch (err) {
      const code = err instanceof OdlaError ? err.code : (err as { code?: string })?.code;
      return json({ error: "scheduling unavailable", code: code ?? "calendar_unavailable" }, 503);
    }

    const summary = (cfg.summaryTemplate || SCHEDULING_DEFAULTS.summaryTemplate)
      .replace("{{firstName}}", app.firstName as string)
      .replace("{{lastName}}", app.lastName as string);

    const existing = await scheduledMeetingFor(db, applicationId);
    try {
      let eventId: string;
      let meetUrl: string | undefined;
      let htmlLink: string | undefined;
      let meetingId: string;

      if (existing?.googleEventId) {
        // Rebooking: move the existing event so the invite thread and Meet
        // link survive; Google notifies the attendee of the change.
        await cal.actions.reschedule(existing.googleEventId as string, { startAt, endAt });
        eventId = existing.googleEventId as string;
        meetUrl = (existing.meetUrl as string) || undefined;
        htmlLink = (existing.htmlLink as string) || undefined;
        meetingId = existing.id as string;
        await db.transact(
          tx.meetings[meetingId].update({
            startAt,
            endAt,
            drift: "none",
          }),
        );
      } else {
        const { booking } = await cal.actions.create(
          {
            summary,
            startAt,
            endAt,
            attendees: [app.email as string],
            timezone: cfg.timezone,
            meet: true,
          },
          { idempotencyKey: `application:${applicationId}:intro` },
        );
        eventId = booking.eventId;
        meetUrl = booking.meetUrl;
        htmlLink = booking.htmlLink;
        meetingId = uuidv7();
        await db.transact(
          tx.meetings[meetingId].update({
            id: meetingId,
            applicationId,
            groupId: group.id,
            startAt,
            endAt,
            timezone: cfg.timezone,
            status: "scheduled",
            googleEventId: eventId,
            ...(meetUrl ? { meetUrl } : {}),
            ...(htmlLink ? { htmlLink } : {}),
            drift: "none",
            createdAt: Date.now(),
          }),
        );
      }

      await db.transact(
        tx.applications[applicationId].update({
          meetingAt: startAt,
          ...(htmlLink ? { meetingLink: htmlLink } : {}),
          ...(app.status !== "call_scheduled" ? { status: "call_scheduled" } : {}),
        }),
      );

      await syncPersonToCrm(db, {
        app: { ...app, status: "call_scheduled" },
        stage: "call_scheduled",
      }).catch((e) => console.error("crm sync failed (book)", e));

      if (!app.prepEmailSentAt) {
        const prep = await sendTemplated(db, env.ODLA_ENV, mailer, group, {
          template: "prepEmail",
          to: app.email as string,
          vars: { firstName: app.firstName as string },
          applicationId,
          dedupeKey: `prep:${applicationId}`,
        });
        // Stamp only real sends: if the admin disabled the prep email (or
        // the transport failed), a later rebooking may still send one.
        if (prep.sent) {
          await db.transact(tx.applications[applicationId].update({ prepEmailSentAt: Date.now() }));
        }
      }

      return json({ ok: true, startAt, endAt, meetUrl: meetUrl ?? null, rescheduled: Boolean(existing) });
    } catch (err) {
      const code = err instanceof OdlaError ? err.code : (err as { code?: string })?.code;
      if (code === "calendar_slot_unavailable") {
        return json({ error: "slot no longer available", code }, 409);
      }
      console.error("booking failed", code, err);
      return json({ error: "booking failed", code: code ?? "unknown" }, 502);
    }
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
        const paidStatus = app.status === "submitted" ? "paid_pending_vetting" : (app.status as string);
        await syncPersonToCrm(db, {
          app: { ...app, status: paidStatus, ...(renewalAt ? { renewalAt } : {}) },
          stage: paidStatus,
        }).catch((e) => console.error("crm sync failed (invoice.paid)", e));
        const group = await getGroup(db, (app.groupId as string) ?? DEFAULT_GROUP_ID);
        if (group) {
          const vars = {
            firstName: app.firstName as string,
            lastName: app.lastName as string,
            email: app.email as string,
            phone: (app.phone as string) ?? "",
            state: (app.state as string) ?? "",
            // ?tab= survives mail-client link rewriting better than a #hash
            // and lands the admin on the vetting view.
            adminUrl: `${url.origin}/admin/?tab=people`,
            membersUrl: `${url.origin}/members/`,
          };
          await sendTemplated(db, env.ODLA_ENV, mailer, group, {
            template: "adminNotification",
            to: group.notificationEmail,
            vars,
            applicationId: app.id as string,
            dedupeKey: `${event.id}:admin`,
          });
          await sendTemplated(db, env.ODLA_ENV, mailer, group, {
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
        await syncPersonToCrm(db, {
          app: { ...app, renewalAt },
          stage: app.status as string,
        }).catch((e) => console.error("crm sync failed (renewal)", e));
      }
      return json({ ok: true });
    }

    if (event.type === "charge.refunded") {
      const app = await findApplication();
      if (!app) return json({ ok: true, matched: false });
      await db.transact(tx.applications[app.id as string].update({ status: "refunded" }), {
        mutationId: `stripe:${event.id}`,
      });
      await syncPersonToCrm(db, {
        app: { ...app, status: "refunded" },
        stage: "refunded",
      }).catch((e) => console.error("crm sync failed (refunded)", e));
      // Phase R hook: reverse any pending referral credit here.
      return json({ ok: true });
    }

    if (event.type === "customer.subscription.deleted") {
      const app = await findApplication();
      if (!app) return json({ ok: true, matched: false });
      await db.transact(tx.applications[app.id as string].update({ canceled: true }), {
        mutationId: `stripe:${event.id}`,
      });
      await syncPersonToCrm(db, {
        app: { ...app, canceled: true },
        stage: app.status as string,
      }).catch((e) => console.error("crm sync failed (canceled)", e));
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
        const meeting = await scheduledMeetingFor(db, a.id as string);
        application = {
          ...applicationSummary(a),
          meetUrl: (meeting?.meetUrl as string) ?? null,
          timezone: (meeting?.timezone as string) ?? SCHEDULING_DEFAULTS.timezone,
        };
        if (a.clerkUserId !== user.userId) {
          // Lazy link; mutationId makes retries exactly-once.
          await db.transact(
            tx.applications[a.id as string].update({ clerkUserId: user.userId }),
            { mutationId: `link:${a.id}:${user.userId}` },
          );
        }
      }
    }
    // Super-admin status gates the "promote to admin" UI. Resolved only for
    // admins (members never need it), from the read-only superAdmins table.
    const superAdmin = user.role === "admin" ? await isSuperAdmin(db, user.email) : false;
    return json({ ...user, superAdmin, application });
  }

  // ── Admin routes ────────────────────────────────────────────────
  if (url.pathname.startsWith("/api/admin/")) {
    const user = await verifyUser(req, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    if (user.role !== "admin") return json({ error: "forbidden" }, 403);

    // Backfill / re-sync every person into the CRM (applications + $users ->
    // crm_record). Idempotent, so it doubles as the one-time migration and a
    // repair button. The ongoing sync happens inline at each lifecycle write.
    if (req.method === "POST" && url.pathname === "/api/admin/crm/sync") {
      const result = await backfillCrm(db);
      return json({ ok: true, ...result });
    }

    // One row per person, joined by lowercased email: the $users mirror
    // (accounts), applications (pipeline), and Clerk roles. Replaces the
    // former separate applications/members listings.
    if (req.method === "GET" && url.pathname === "/api/admin/people") {
      const [appsRes, usersRes, roles] = await Promise.all([
        db.query({ applications: { $: { order: { createdAt: "desc" }, limit: 200 } } }),
        db.query({ $users: { $: { limit: 200 } } }),
        fetchClerkRoles(db),
      ]);


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

    // Dashboard overview: application flow (total / last 7 / last 30), pipeline
    // stage counts, live revenue (Stripe), and the upcoming intro-call agenda
    // with drift. One call powers the Dashboard tab's stat cards + agenda.
    if (req.method === "GET" && url.pathname === "/api/admin/dashboard") {
      const nowMs = Date.now();
      const d7 = nowMs - 7 * 86_400_000;
      const d30 = nowMs - 30 * 86_400_000;

      const [appsRes, meetingsRes, recsRes, dashGroup] = await Promise.all([
        db.query({ applications: { $: { order: { createdAt: "desc" }, limit: 1000 } } }),
        db.query({ meetings: { $: { where: { status: "scheduled" }, order: { startAt: "asc" }, limit: 500 } } }),
        db.query({ crm_record: { $: { where: { type: "person" }, limit: 1000 } } }),
        getGroup(db, DEFAULT_GROUP_ID),
      ]);
      const apps = (appsRes.applications ?? []) as Array<Record<string, unknown>>;
      const applications = {
        total: apps.length,
        last7: apps.filter((a) => (a.createdAt as number) >= d7).length,
        last30: apps.filter((a) => (a.createdAt as number) >= d30).length,
      };
      // Pipeline counts + weekly delta from crm_record (it carries stageChangedAt,
      // so we know how many entered each stage in the last 7 days).
      const recs = (recsRes.crm_record ?? []) as Array<Record<string, unknown>>;
      const pipeline: Record<string, number> = {};
      const pipelineDelta: Record<string, number> = {};
      for (const s of STATUSES) { pipeline[s] = 0; pipelineDelta[s] = 0; }
      for (const r of recs) {
        const s = r.stage as string;
        if (s in pipeline) {
          pipeline[s] += 1;
          if ((r.stageChangedAt as number) >= d7) pipelineDelta[s] += 1;
        }
      }

      const meetings = (meetingsRes.meetings ?? []) as Array<Record<string, unknown>>;
      const appById = new Map(apps.map((a) => [a.id, a]));
      const upcomingMeetings = meetings.filter((m) => (m.startAt as number) >= nowMs - 3_600_000);
      const calls = {
        upcoming: upcomingMeetings.length,
        needsAttention: meetings.filter((m) => m.drift && m.drift !== "none").length,
      };
      const agenda = upcomingMeetings.slice(0, 8).map((m) => {
        const a = appById.get(m.applicationId) as Record<string, unknown> | undefined;
        return {
          id: m.id,
          startAt: m.startAt,
          meetUrl: m.meetUrl ?? null,
          htmlLink: m.htmlLink ?? null,
          drift: m.drift ?? "none",
          name: a ? `${a.firstName} ${a.lastName}` : "(unknown)",
          email: (a?.email as string) ?? null,
        };
      });
      const tz = dashGroup
        ? schedulingConfig(dashGroup as GroupRow & { schedulingJson?: unknown }).timezone
        : SCHEDULING_DEFAULTS.timezone;

      let revenue: Record<string, unknown> = { billingReady: false };
      let membersSeries: unknown = null;
      let revenueSeries: unknown = null;
      const dashSk = dashGroup ? await getVaultSecret(db, "stripe_secret_key") : null;
      if (dashGroup && dashSk) {
        const subsRes = await stripeCall(dashSk, "GET", "/v1/subscriptions", { limit: 100, status: "all" });
        if (subsRes.ok) {
          const subs = ((subsRes.body.data as Array<Record<string, unknown>>) ?? []);
          const subMs = (s: Record<string, unknown>) => ((s.created as number) ?? 0) * 1000;
          membersSeries = bucketSeries(subs.map((s) => ({ t: subMs(s), v: 1 })), nowMs);
          // Revenue = annualized run-rate added per bucket (money, not counts).
          revenueSeries = bucketSeries(subs.map((s) => ({ t: subMs(s), v: subAnnualCents(s) })), nowMs);
          const active = subs.filter((s) => s.status === "active");
          const runRate = active.reduce((sum, s) => sum + subAnnualCents(s), 0);
          revenue = {
            billingReady: true,
            testMode: (dashGroup.stripePublishableKey ?? "").startsWith("pk_test"),
            activeCount: active.length,
            annualRunRateCents: runRate,
            newPaid7: subs.filter((s) => subMs(s) >= d7).length,
            newPaid30: subs.filter((s) => subMs(s) >= d30).length,
          };
        }
      }

      const applicationsSeries = bucketSeries(apps.map((a) => ({ t: (a.createdAt as number) || 0, v: 1 })), nowMs);
      return json({ applications, applicationsSeries, pipeline, pipelineDelta, calls, agenda, timezone: tz, revenue, revenueSeries, membersSeries });
    }

    // Owner-editable email configuration (PAYMENT-SPEC: copy lives in the
    // group row, never code). Scoped to the launch group for now.
    if (req.method === "GET" && url.pathname === "/api/admin/group/email") {
      const group = await getGroup(db, DEFAULT_GROUP_ID);
      if (!group) return json({ error: "not found" }, 404);
      // Absent `enabled` means enabled: rows predating the flag keep sending.
      const emailTemplates: Record<string, { subject: string; text: string; enabled: boolean }> = {};
      for (const key of EMAIL_TEMPLATE_NAMES) {
        const t = group.emailTemplates?.[key];
        if (t) emailTemplates[key] = { subject: t.subject, text: t.text, enabled: t.enabled !== false };
      }
      return json({
        groupId: group.id,
        name: group.name,
        replyTo: group.replyTo,
        notificationEmail: group.notificationEmail,
        debugEmail: group.debugEmail ?? "",
        emailTemplates,
        commitmentText: group.commitmentText ?? "",
        normsText: group.normsText ?? "",
        // Read-only here (edited with the payment copy); included so the
        // payment confirmation preview can render its embedded policy.
        refundPolicyText: group.refundPolicyText ?? "",
        // Delivery wiring (read-only: set per environment in wrangler.jsonc;
        // the sender address must be on the onboarded Email Service domain).
        envName: env.ODLA_ENV,
        transport: mailer.name,
        fromEmail: mailer.fromEmail ?? null,
      });
    }

    // The send audit: every attempted send, delivered or logged or failed.
    if (req.method === "GET" && url.pathname === "/api/admin/email/log") {
      const { emailLog } = await db.query({
        emailLog: { $: { order: { sentAt: "desc" }, limit: 50 } },
      });
      const rows = ((emailLog ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        template: r.template,
        to: r.to,
        subject: r.subject,
        transport: r.transport,
        redirected: r.redirected === true,
        error: (r.error as string) ?? null,
        sentAt: r.sentAt,
      }));
      return json({ sends: rows });
    }

    // The billing dashboard: applications joined with live Stripe
    // subscription state. Stripe is the source of truth for money; the db
    // rows contribute the person and pipeline status.
    if (req.method === "GET" && url.pathname === "/api/admin/billing") {
      const group = await getGroup(db, DEFAULT_GROUP_ID);
      const sk = await getVaultSecret(db, "stripe_secret_key");
      if (!group || !sk) return json({ billingReady: false, rows: [], summary: null });

      const [appsRes, subsRes] = await Promise.all([
        db.query({ applications: { $: { order: { createdAt: "desc" }, limit: 200 } } }),
        stripeCall(sk, "GET", "/v1/subscriptions", { limit: 100, status: "all" }),
      ]);
      if (!subsRes.ok) {
        console.error("billing: subscription list failed", subsRes.status);
        return json({ error: "billing lookup failed upstream" }, 502);
      }
      const subById = new Map(
        (((subsRes.body.data as Array<Record<string, unknown>>) ?? [])).map((s) => [s.id as string, s]),
      );

      const testMode = (group.stripePublishableKey ?? "").startsWith("pk_test");
      const dash = testMode ? "https://dashboard.stripe.com/test" : "https://dashboard.stripe.com";

      type SubItem = {
        price?: { unit_amount?: number; recurring?: { interval?: string } };
        quantity?: number;
        current_period_end?: number;
      };
      const rows = [];
      for (const a of (appsRes.applications ?? []) as Array<Record<string, unknown>>) {
        if (!a.stripeCustomerId && !a.stripeSubscriptionId) continue;
        const sub = a.stripeSubscriptionId
          ? (subById.get(a.stripeSubscriptionId as string) as Record<string, unknown> | undefined)
          : undefined;
        const items = ((sub?.items as { data?: SubItem[] } | undefined)?.data ?? []);
        let amountCents = 0;
        let interval = "year";
        for (const it of items) {
          amountCents += (it.price?.unit_amount ?? 0) * (it.quantity ?? 1);
          interval = it.price?.recurring?.interval ?? interval;
        }
        // 2025+ Stripe API keeps the period on the items; older shapes had
        // it on the subscription. Our own renewalAt is the last fallback.
        const periodEnd =
          (sub?.current_period_end as number | undefined) ?? items[0]?.current_period_end;
        rows.push({
          // Application id: the stable row identity for the admin table.
          id: a.id as string,
          name: `${a.firstName} ${a.lastName}`,
          email: a.email as string,
          applicationStatus: a.status as string,
          subscriptionStatus: (sub?.status as string) ?? null,
          cancelAtPeriodEnd: sub?.cancel_at_period_end === true,
          amountCents,
          interval,
          renewalAt: periodEnd ? periodEnd * 1000 : ((a.renewalAt as number) ?? null),
          customerUrl: a.stripeCustomerId ? `${dash}/customers/${a.stripeCustomerId}` : null,
          subscriptionUrl: a.stripeSubscriptionId
            ? `${dash}/subscriptions/${a.stripeSubscriptionId}`
            : null,
        });
      }

      // Run rate counts only what will actually renew.
      const renewing = rows.filter((r) => r.subscriptionStatus === "active" && !r.cancelAtPeriodEnd);
      const soonCutoff = Date.now() + 60 * 24 * 3600 * 1000;
      const summary = {
        activeCount: rows.filter((r) => r.subscriptionStatus === "active").length,
        annualRunRateCents: renewing.reduce(
          (s, r) => s + r.amountCents * (r.interval === "month" ? 12 : 1),
          0,
        ),
        renewingSoonCount: renewing.filter((r) => r.renewalAt && r.renewalAt < soonCutoff).length,
        pastDueCount: rows.filter((r) => r.subscriptionStatus === "past_due").length,
        canceledCount: rows.filter(
          (r) => r.subscriptionStatus === "canceled" || r.cancelAtPeriodEnd,
        ).length,
        refundedCount: rows.filter((r) => r.applicationStatus === "refunded").length,
      };
      return json({
        billingReady: true,
        testMode,
        // One page of 100 subscriptions covers the community for now; flag
        // instead of silently truncating when it no longer does.
        truncated: subsRes.body.has_more === true,
        rows,
        summary,
      });
    }

    // Owner-triggered test send: exercises the real transport end to end
    // with sample data. Goes to the notification address (dev redirects to
    // the debug inbox as always) and ignores the template's enabled flag,
    // since the admin asked for it explicitly.
    if (req.method === "POST" && url.pathname === "/api/admin/email/test") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }
      const template = body.template as EmailTemplateName;
      if (!EMAIL_TEMPLATE_NAMES.includes(template)) {
        return json({ error: `template must be one of: ${EMAIL_TEMPLATE_NAMES.join(", ")}` }, 400);
      }
      const group = await getGroup(db, DEFAULT_GROUP_ID);
      if (!group) return json({ error: "not found" }, 404);
      const result = await sendTemplated(db, env.ODLA_ENV, mailer, group, {
        template,
        to: group.notificationEmail,
        vars: {
          firstName: "Martha",
          lastName: "Cannon",
          email: "martha@example.com",
          phone: "(801) 555-0100",
          state: "Utah",
          adminUrl: `${url.origin}/admin/?tab=people`,
          membersUrl: `${url.origin}/members/`,
        },
        force: true,
      });
      return json({
        ok: result.sent,
        reason: result.reason ?? null,
        transport: mailer.name,
        to: group.notificationEmail,
        redirected: env.ODLA_ENV !== "prod" && !!group.debugEmail,
        debugEmail: group.debugEmail ?? null,
      });
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/group/email") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }

      const templates = body.emailTemplates as Record<
        string,
        { subject?: unknown; text?: unknown; enabled?: unknown }
      >;
      if (!templates || typeof templates !== "object") {
        return json({ error: "emailTemplates object required" }, 400);
      }
      const clean: Record<string, { subject: string; text: string; enabled: boolean }> = {};
      for (const key of EMAIL_TEMPLATE_NAMES) {
        const t = templates[key];
        const subject = typeof t?.subject === "string" ? t.subject.trim() : "";
        const text = typeof t?.text === "string" ? t.text : "";
        if (!subject || !text.trim()) {
          return json({ error: `template "${key}" needs a subject and a body` }, 400);
        }
        if (/[\r\n]/.test(subject) || subject.length > 200) {
          return json({ error: `template "${key}" subject must be a single line under 200 characters` }, 400);
        }
        if (text.length > 10_000) {
          return json({ error: `template "${key}" body is too long` }, 400);
        }
        // The action toggle: absent means enabled, matching pre-flag rows.
        clean[key] = { subject, text, enabled: t?.enabled !== false };
      }
      const commitmentText = typeof body.commitmentText === "string" ? body.commitmentText : "";
      const normsText = typeof body.normsText === "string" ? body.normsText : "";
      if (commitmentText.length > 5000 || normsText.length > 5000) {
        return json({ error: "commitment/norms text is too long" }, 400);
      }

      // Delivery addresses: where the admin alert goes, the sender/reply-to
      // identity, and the dev-tenant redirect inbox.
      const emailish = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const notificationEmail = typeof body.notificationEmail === "string" ? body.notificationEmail.trim() : "";
      const replyTo = typeof body.replyTo === "string" ? body.replyTo.trim() : "";
      const debugEmail = typeof body.debugEmail === "string" ? body.debugEmail.trim() : "";
      if (!emailish.test(notificationEmail)) return json({ error: "notification address must be a valid email" }, 400);
      if (!emailish.test(replyTo)) return json({ error: "reply-to address must be a valid email" }, 400);
      if (debugEmail && !emailish.test(debugEmail)) return json({ error: "debug address must be a valid email" }, 400);

      await db.transact(
        tx.groups[DEFAULT_GROUP_ID].update({
          emailTemplates: clean,
          commitmentText,
          normsText,
          notificationEmail,
          replyTo,
          debugEmail,
        }),
      );
      groupCache = null; // this isolate serves fresh copy immediately
      return json({ ok: true });
    }

    // Introduction calls from OUR canonical meetings entity, with drift
    // flags refreshed against live Google state. Data stays ours; Google
    // disagreement is flagged for the admin to resolve, never adopted.
    // The console's Calendar tab always passes ?all=1 (full history, cap
    // 500); ?from=&to= (epoch ms) selects a window. The bare default
    // (upcoming, cap 50) is kept for compatibility and curl checks.
    if (req.method === "GET" && url.pathname === "/api/admin/meetings") {
      const [meetingsRes, appsRes] = await Promise.all([
        db.query({ meetings: { $: { order: { startAt: "desc" }, limit: 500 } } }),
        db.query({ applications: { $: { order: { createdAt: "desc" }, limit: 200 } } }),
      ]);
      const meetings = (meetingsRes.meetings ?? []) as Array<Record<string, unknown>>;
      await reconcileWithGoogle(db, cal, meetings);

      const appById = new Map(
        ((appsRes.applications ?? []) as Array<Record<string, unknown>>).map((a) => [a.id, a]),
      );
      const all = url.searchParams.get("all") === "1";
      const from = Number(url.searchParams.get("from"));
      const to = Number(url.searchParams.get("to"));
      const ranged = Number.isFinite(from) && Number.isFinite(to) && from < to && url.searchParams.has("from");
      const cutoff = Date.now() - 3_600_000;
      const inWindow = (m: Record<string, unknown>) => {
        const startAt = m.startAt as number;
        if (ranged) return startAt >= from && startAt < to;
        if (all) return true;
        return startAt >= cutoff || m.drift === "gone_from_google";
      };
      const rows = meetings
        .filter(inWindow)
        .sort((x, y) => (x.startAt as number) - (y.startAt as number))
        .slice(0, all || ranged ? 500 : 50)
        .map((m) => {
          const a = appById.get(m.applicationId);
          return {
            id: m.id,
            startAt: m.startAt,
            endAt: m.endAt,
            status: m.status,
            drift: m.drift ?? "none",
            driftGoogleStartAt: m.driftGoogleStartAt ?? null,
            adoptedFromGoogleAt: m.adoptedFromGoogleAt ?? null,
            meetUrl: m.meetUrl ?? null,
            htmlLink: m.htmlLink ?? null,
            applicant: a
              ? { id: a.id, name: `${a.firstName} ${a.lastName}`, email: a.email, status: a.status }
              : null,
          };
        });
      const meetingsGroup = await getGroup(db, DEFAULT_GROUP_ID);
      const meetingsTz = meetingsGroup
        ? schedulingConfig(meetingsGroup as GroupRow & { schedulingJson?: unknown }).timezone
        : SCHEDULING_DEFAULTS.timezone;
      return json({ meetings: rows, timezone: meetingsTz });
    }

    // Owner-editable availability rules for first-party booking.
    if (req.method === "GET" && url.pathname === "/api/admin/group/scheduling") {
      const group = await getGroup(db, DEFAULT_GROUP_ID);
      if (!group) return json({ error: "not found" }, 404);
      return json({ scheduling: schedulingConfig(group as GroupRow & { schedulingJson?: unknown }) });
    }

    if (req.method === "PUT" && url.pathname === "/api/admin/group/scheduling") {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }
      const s = (body.scheduling ?? {}) as Partial<SchedulingConfig>;
      const days = Array.isArray(s.days) ? s.days.map(Number).filter((d) => d >= 0 && d <= 6) : [];
      const startHour = Number(s.startHour);
      const endHour = Number(s.endHour);
      const slotMinutes = Number(s.slotMinutes);
      const minNoticeHours = Number(s.minNoticeHours);
      const windowDays = Number(s.windowDays);
      const timezone = typeof s.timezone === "string" ? s.timezone : "";
      if (!days.length) return json({ error: "pick at least one day" }, 400);
      if (!(startHour >= 0 && endHour <= 24 && startHour < endHour)) {
        return json({ error: "hours must satisfy 0 <= start < end <= 24" }, 400);
      }
      if (!(slotMinutes >= 15 && slotMinutes <= 240)) return json({ error: "slot length must be 15 to 240 minutes" }, 400);
      if (!(minNoticeHours >= 0 && minNoticeHours <= 336)) return json({ error: "notice must be 0 to 336 hours" }, 400);
      // FreeBusy windows are capped at 62 days by the provider.
      if (!(windowDays >= 1 && windowDays <= 62)) return json({ error: "window must be 1 to 62 days" }, 400);
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return json({ error: "unknown timezone" }, 400);
      }
      const summaryTemplate =
        typeof s.summaryTemplate === "string" && s.summaryTemplate.trim()
          ? s.summaryTemplate.trim().slice(0, 200)
          : SCHEDULING_DEFAULTS.summaryTemplate;

      await db.transact(
        tx.groups[DEFAULT_GROUP_ID].update({
          schedulingJson: { slotMinutes, days, startHour, endHour, timezone, minNoticeHours, windowDays, summaryTemplate },
        }),
      );
      groupCache = null;
      return json({ ok: true });
    }

    // Reschedule an introduction call to one of the open slots: our record
    // updates and the Google event moves (Google notifies the attendee;
    // the invite thread and Meet link survive).
    const reschedMatch = url.pathname.match(/^\/api\/admin\/meetings\/([0-9a-f-]+)\/reschedule$/);
    if (req.method === "POST" && reschedMatch) {
      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "invalid JSON body" }, 400);
      }
      const startAt = Number(body.startAt);
      if (!Number.isFinite(startAt)) return json({ error: "startAt required" }, 400);

      const { meetings } = await db.query({
        meetings: { $: { where: { id: reschedMatch[1] }, limit: 1 } },
      });
      const meeting = meetings?.[0];
      if (!meeting) return json({ error: "not found" }, 404);
      if (meeting.status !== "scheduled") return json({ error: "meeting is cancelled" }, 409);
      if (!meeting.googleEventId) return json({ error: "no calendar event on file" }, 409);

      const group = await getGroup(db, (meeting.groupId as string) ?? DEFAULT_GROUP_ID);
      if (!group) return json({ error: "group missing" }, 500);
      const cfg = schedulingConfig(group as GroupRow & { schedulingJson?: unknown });
      const endAt = startAt + cfg.slotMinutes * 60_000;

      try {
        const slots = await bookableSlots(cal, cfg);
        if (!slots.some((s: { startAt: number }) => s.startAt === startAt)) {
          return json({ error: "slot no longer available", code: "calendar_slot_unavailable" }, 409);
        }
        await cal.actions.reschedule(meeting.googleEventId as string, { startAt, endAt });
      } catch (err) {
        const code = err instanceof OdlaError ? err.code : (err as { code?: string })?.code;
        if (code === "calendar_slot_unavailable") {
          return json({ error: "slot no longer available", code }, 409);
        }
        console.error("admin reschedule failed", code, err);
        return json({ error: "reschedule failed", code: code ?? "unknown" }, 502);
      }

      await db.transact(
        tx.meetings[meeting.id as string].update({ startAt, endAt, drift: "none" }),
      );
      await db.transact(
        tx.applications[meeting.applicationId as string].update({ meetingAt: startAt }),
      );
      return json({ ok: true, startAt, endAt });
    }

    // Cancel an introduction call: our record turns cancelled and the
    // Google projection is removed (Google notifies the attendee).
    const cancelMatch = url.pathname.match(/^\/api\/admin\/meetings\/([0-9a-f-]+)\/cancel$/);
    if (req.method === "POST" && cancelMatch) {
      const { meetings } = await db.query({
        meetings: { $: { where: { id: cancelMatch[1] }, limit: 1 } },
      });
      const meeting = meetings?.[0];
      if (!meeting) return json({ error: "not found" }, 404);
      if (meeting.status !== "scheduled") return json({ error: "already cancelled" }, 409);

      if (meeting.googleEventId) {
        try {
          await cal.actions.cancel(meeting.googleEventId as string);
        } catch (err) {
          const code = err instanceof OdlaError ? err.code : (err as { code?: string })?.code;
          if (code !== "booking_not_found") {
            console.error("google cancel failed", code);
            return json({ error: "cancel failed upstream", code }, 502);
          }
        }
      }
      await db.transact(tx.meetings[meeting.id as string].update({ status: "cancelled", drift: "none" }));
      await db.transact(
        tx.applications[meeting.applicationId as string].update({ meetingAt: 0, meetingLink: "" }),
      );
      return json({ ok: true });
    }

    // A person's current access (Clerk role + whether they are a super-admin),
    // for the record panel's Access card. Admin-gated read.
    if (req.method === "GET" && url.pathname === "/api/admin/people/access") {
      const targetId = url.searchParams.get("userId") ?? "";
      if (!targetId.startsWith("user_")) return json({ error: "invalid userId" }, 400);
      const info = await clerkUserRoleEmail(db, targetId);
      if (!info) return json({ error: "user lookup unavailable" }, 502);
      return json({
        userId: targetId,
        role: info.role,
        email: info.email ?? null,
        superAdmin: await isSuperAdmin(db, info.email),
      });
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

      // Admin creation/modification is super-admin-only. A regular admin can set
      // provisional/member on a non-admin, but cannot mint admins, touch an
      // existing admin's role, or alter a super-admin. Super-admin itself is
      // never writable here (it lives in the read-only superAdmins table).
      const callerSuper = await isSuperAdmin(db, user.email);
      const target = await clerkUserRoleEmail(db, targetId);
      const targetCurrentRole = target?.role ?? "provisional";
      if ((await isSuperAdmin(db, target?.email)) && !callerSuper) {
        return json({ error: "this person is a super-admin; their access is managed in odla Studio" }, 403);
      }
      if ((role === "admin" || targetCurrentRole === "admin") && !callerSuper) {
        return json({ error: "only super-admins can create or change an admin" }, 403);
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

      await syncPersonToCrm(db, {
        app: { ...app, status: "approved" },
        stage: "approved",
      }).catch((e) => console.error("crm sync failed (approve)", e));

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
        const invite = await sendTemplated(db, env.ODLA_ENV, mailer, group, {
          template: "onboardingInvite",
          to: app.email as string,
          vars: {
            firstName: app.firstName as string,
            membersUrl: `${url.origin}/members/`,
          },
          applicationId: id,
          dedupeKey: `approve:${id}`,
        });
        emailLogged = invite.sent;
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
      // Mirror only when the status moved (meetingAt is not a CRM person
      // field). patched merges the pre-update row with the change.
      if (attrs.status !== undefined) {
        const patched = { ...applications[0], ...attrs };
        await syncPersonToCrm(db, {
          app: patched,
          stage: patched.status as string,
        }).catch((e) => console.error("crm sync failed (patch)", e));
      }
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

    // Project the new applicant into the CRM (non-fatal: a CRM hiccup must
    // never fail the join).
    await syncPersonToCrm(db, {
      app: { id, ...parsed.attrs, status: "submitted" },
      stage: "submitted",
    }).catch((e) => console.error("crm sync failed (join)", e));

    return json({ ok: true, id, duplicate: duplicate ?? false, accountCreated }, 201);
  }

  // Gated: admins only (an internal stat per the owner's role model).
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
