// Worker for the Silver & Salt Capital site.
// Phase 1: health endpoint + static assets pass-through.
// Phase 2: /api/applications routes backed by odla-db (dev tenant).
//
// The Worker is the only thing that talks to odla-db; it uses the app key
// (ODLA_API_KEY, a Wrangler secret), which bypasses the deny-all rules.
// Browsers never receive a db credential.

import { initAdmin, tx, uuidv7, OdlaError } from "@odla-ai/db";
import { createRemoteJWKSet, jwtVerify } from "jose";

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
const OPTIONAL = ["referralName", "linkedin"] as const;
const MAX_LEN: Record<string, number> = {
  firstName: 200, lastName: 200, email: 320, referral: 100,
  referralName: 200, whoYouAre: 100, linkedin: 500, message: 5000,
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

const STATUSES = ["submitted", "call_scheduled", "interviewed", "approved", "declined"] as const;

type Db = ReturnType<typeof initAdmin>;

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
      }),
    });
    if (res.ok) return true;
    // 422 means the email already has an account, which is the goal state.
    if (res.status === 422) return true;
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
  meetingAt: a.meetingAt ?? null,
  createdAt: a.createdAt,
});

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

  // Gated: any verified session. Returns the user plus their application
  // (matched by email) so the member area can show status and meeting time.
  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = await verifyUser(req, env);
    if (!user) return json({ error: "unauthorized" }, 401);

    let application = null;
    if (user.email) {
      const a = await findApplicationByEmail(db, user.email);
      if (a) {
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
        status: "submitted",
        createdAt: Date.now(),
      }),
      submissionId ? { mutationId: `join:${submissionId}` } : undefined,
    );

    const accountCreated = await ensureClerkAccount(
      db,
      parsed.attrs.email as string,
      parsed.attrs.firstName as string,
      parsed.attrs.lastName as string,
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

    if (existing.status !== "submitted" && existing.status !== "call_scheduled") {
      return json({ ok: true, applied: false });
    }

    await db.transact(
      tx.applications[id].update({
        status: "call_scheduled",
        ...(meetingAt !== undefined ? { meetingAt } : {}),
      }),
    );
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
