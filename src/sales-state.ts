// Server-enforced sales state. Chapter 0.48.0 has no document-level "sales
// on/off" or identity allowlist (only per-tier availability), so the switch
// lives on this host and runs BEFORE any Chapter route. Hiding a button is not
// a gate; every checkout entry point is refused here when sales are not open.
//
//   SALES_STATE   disabled | restricted | public   (absent or unknown = disabled)
//   SALES_STOP    any value other than "" / "0" / "false" forces disabled.
//                 A Worker secret an operator can set with `wrangler secret
//                 put SALES_STOP` using Cloudflare access alone, when neither
//                 Built Not Found nor odla is reachable.
//   SALES_CANARY_TOKEN   required in restricted mode; the named payer opens
//                 /join?canary=<token> once, which sets an HttpOnly cookie.
//                 Missing token in restricted mode fails closed (disabled).
//   SALES_ALLOWLIST      optional comma-separated emails; in restricted mode a
//                 new application must use one of them.
//
// Webhooks (/api/webhooks/stripe) are never gated: money already in flight
// keeps reconciling whatever the sales state is.

import type { Route } from "@odla-ai/chapter/worker";

export type SalesState = "disabled" | "restricted" | "public";

export const CANARY_COOKIE = "ssc_canary";
const CANARY_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Every route through which a new purchase or free signup can begin. */
export const GATED_POSTS: readonly string[] = [
  "/api/applications",
  "/api/payments/quote",
  "/api/payments/subscription",
  "/api/membership/restart",
  "/api/named-seat/checkout",
  "/api/gifts/checkout",
  "/api/gifts/redeem",
];

type SalesEnv = {
  SALES_STATE?: unknown;
  SALES_STOP?: unknown;
  SALES_CANARY_TOKEN?: unknown;
  SALES_ALLOWLIST?: unknown;
};

const truthy = (v: unknown) => typeof v === "string" && v !== "" && v !== "0" && v.toLowerCase() !== "false";

export function resolveSalesState(env: SalesEnv): { state: SalesState; reason: string } {
  if (truthy(env.SALES_STOP)) return { state: "disabled", reason: "SALES_STOP is set" };
  const raw = typeof env.SALES_STATE === "string" ? env.SALES_STATE.trim().toLowerCase() : "";
  if (raw === "public") return { state: "public", reason: "SALES_STATE=public" };
  if (raw === "restricted") {
    if (typeof env.SALES_CANARY_TOKEN !== "string" || env.SALES_CANARY_TOKEN.length < 16) {
      return { state: "disabled", reason: "restricted without a usable SALES_CANARY_TOKEN" };
    }
    return { state: "restricted", reason: "SALES_STATE=restricted" };
  }
  if (raw === "disabled") return { state: "disabled", reason: "SALES_STATE=disabled" };
  return { state: "disabled", reason: raw ? `unknown SALES_STATE ${raw}` : "SALES_STATE unset" };
}

export function allowlist(env: SalesEnv): string[] {
  if (typeof env.SALES_ALLOWLIST !== "string") return [];
  return env.SALES_ALLOWLIST.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAllowlisted(email: unknown, env: SalesEnv): boolean {
  const list = allowlist(env);
  if (list.length === 0) return true;
  return typeof email === "string" && list.includes(email.trim().toLowerCase());
}

/** Constant-time string equality; never short-circuits on the first mismatch. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function canaryPresented(req: Request, env: SalesEnv): boolean {
  const token = env.SALES_CANARY_TOKEN;
  if (typeof token !== "string" || token.length < 16) return false;
  const cookie = cookieValue(req, CANARY_COOKIE);
  return typeof cookie === "string" && timingSafeEqual(cookie, token);
}

/** True when this request may reach a purchase or free-signup entry point. */
export function purchasesOpenFor(req: Request, env: SalesEnv): boolean {
  const { state } = resolveSalesState(env);
  if (state === "public") return true;
  if (state === "restricted") return canaryPresented(req, env);
  return false;
}

export function canarySetCookie(token: string, secure: boolean): string {
  return `${CANARY_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${CANARY_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

const refuse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * Host route mounted ahead of every Chapter built-in. Returns null (falls
 * through) for anything that is not a gated entry point or when sales are
 * open to this request.
 */
export const salesGate: Route = async (req, url, env) => {
  if (req.method !== "POST" || !GATED_POSTS.includes(url.pathname)) return null;
  // A paid invitation is fulfillment. Chapter verifies the recipient and seat
  // before creating an application, and binds it so no paid checkout can follow.
  // Merely adding this field cannot reach the ordinary signup branch.
  if (url.pathname === "/api/applications") {
    try {
      const body = await req.clone().json() as { namedSeatId?: unknown };
      if (typeof body?.namedSeatId === "string" && /^seat_[A-Za-z0-9_-]{16,128}$/.test(body.namedSeatId)) return null;
    } catch { /* The normal body reader will return the bounded validation error. */ }
  }
  const { state, reason } = resolveSalesState(env);
  if (state === "disabled") return refuse({ error: "sales_disabled", reason }, 503);
  if (state === "public") return null;
  if (!canaryPresented(req, env)) return refuse({ error: "sales_restricted" }, 403);
  if (url.pathname === "/api/applications" && allowlist(env).length > 0) {
    let email: unknown;
    try {
      email = ((await req.clone().json()) as { email?: unknown })?.email;
    } catch {
      return refuse({ error: "invalid JSON body" }, 400);
    }
    if (!isAllowlisted(email, env)) return refuse({ error: "sales_restricted", detail: "email not in canary allowlist" }, 403);
  }
  return null;
};

/** Public, cache-free readout for operators and CI probes. Never lists identities. */
export const salesStateRoute: Route = async (req, url, env) => {
  if (req.method !== "GET" || url.pathname !== "/api/sales-state") return null;
  const { state, reason } = resolveSalesState(env);
  return new Response(JSON.stringify({ state, reason, allowlisted: allowlist(env).length }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
