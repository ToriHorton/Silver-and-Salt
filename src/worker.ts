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

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  // Public: the sign-in page bootstraps ClerkJS from this (same-origin, so
  // the page needs no hardcoded key and prod picks up its own config).
  if (req.method === "GET" && url.pathname === "/api/auth/config") {
    const { clerkPublishableKey, issuer } = await getPublicConfig(env);
    return json({ publishableKey: clerkPublishableKey ?? null, issuer: issuer ?? null });
  }

  // Gated: any verified session.
  if (req.method === "GET" && url.pathname === "/api/me") {
    const user = await verifyUser(req, env);
    if (!user) return json({ error: "unauthorized" }, 401);
    return json(user);
  }

  const db = initAdmin({
    appId: env.ODLA_TENANT,
    adminToken: env.ODLA_API_KEY,
    endpoint: env.ODLA_ENDPOINT,
  });

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
    return json({ ok: true, id, duplicate: duplicate ?? false }, 201);
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
