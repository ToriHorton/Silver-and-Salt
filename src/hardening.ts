// Edge hardening for the public Worker (security audit S04 and S05).
//
//   S04  Browser security headers on every response. Static assets get them
//        from the _headers file (Cloudflare applies it at the edge); the
//        Worker adds the same set to its own responses (API, /join). The two
//        must agree, and a test holds _headers to renderHeadersFile().
//   S05  Request bodies are bounded BEFORE they are read. A declared
//        Content-Length over the cap is refused without touching the body;
//        an undeclared body is read at most cap+1 bytes and then refused.
//        Public write routes are also rate limited per client IP through the
//        Workers rate-limit binding when the deployment declares one. That
//        binding counts per Cloudflare location on a best-effort basis (a
//        2026-09-15 probe of 55 posts in ten seconds from one IP tripped
//        nothing), so it is a backstop only. The accurate control is a zone
//        WAF rate-limiting rule on POST /api/*, set in the dashboard.
//
// The Content-Security-Policy is report-only for now: the pages carry inline
// scripts and styles, and Clerk and Stripe load from their own origins, so an
// enforced policy is a separate, reviewed step. frame-ancestors is enforced
// on its own because nothing on these sites is meant to be framed.

export interface HardeningConfig {
  /** Clerk frontend API origin for this site, e.g. https://clerk.example.com */
  clerkOrigin: string;
  /** Extra origins per CSP directive; each site names what its pages load. */
  script?: string[];
  style?: string[];
  font?: string[];
  connect?: string[];
  frame?: string[];
}

export const DEFAULT_BODY_CAP = 64 * 1024;
export const ADMIN_BODY_CAP = 2 * 1024 * 1024;
export const SIGNED_BODY_CAP = 1024 * 1024;
/** Signed inbound edges and provider webhooks: larger payloads, own auth. */
export const SIGNED_PREFIXES = [
  "/api/webhooks/", "/api/network-commercial/stripe-webhook", "/api/membership-authority", "/api/membership-effects",
  "/api/signup-control", "/api/network/", "/api/member-content-control", "/api/builder-library-control", "/api/admission-grants",
];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isSignedPath(pathname: string): boolean {
  return SIGNED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function bodyCapFor(pathname: string): number {
  if (isSignedPath(pathname)) return SIGNED_BODY_CAP;
  if (pathname.startsWith("/api/admin/")) return ADMIN_BODY_CAP;
  return DEFAULT_BODY_CAP;
}

const refuse = (body: Record<string, unknown>, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

/** Bound the request body without buffering past the cap. Returns the request to pass on, or a 413. */
export async function limitBody(req: Request): Promise<Request | Response> {
  if (!MUTATING.has(req.method) || !req.body) return req;
  const cap = bodyCapFor(new URL(req.url).pathname);
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) return refuse({ error: "invalid content-length" }, 400);
    if (n > cap) return refuse({ error: "request body too large", cap }, 413);
  }
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return refuse({ error: "request body too large", cap }, 413);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { body.set(c, offset); offset += c.byteLength; }
  return new Request(req, { body });
}

/** Per-IP limit on public write routes. Signed edges and the admin API have their own auth and are exempt. */
export async function rateLimit(req: Request, env: { PUBLIC_WRITE_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> } }): Promise<Response | null> {
  const limiter = env.PUBLIC_WRITE_LIMIT;
  if (!limiter || !MUTATING.has(req.method)) return null;
  const { pathname } = new URL(req.url);
  if (!pathname.startsWith("/api/") || pathname.startsWith("/api/admin/") || isSignedPath(pathname)) return null;
  const key = req.headers.get("cf-connecting-ip") ?? "unknown";
  try {
    const { success } = await limiter.limit({ key });
    if (!success) return refuse({ error: "too many requests" }, 429, { "retry-after": "60" });
  } catch (err) {
    console.error("rate-limit binding failed open", (err as Error).message);
  }
  return null;
}

function csp(c: HardeningConfig): string {
  const u = (list: string[] = []) => [...new Set(list)].join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${u([c.clerkOrigin, ...(c.script ?? [])])}`,
    `style-src 'self' 'unsafe-inline' ${u(c.style)}`,
    `font-src 'self' data: ${u(c.font)}`,
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${u([c.clerkOrigin, ...(c.connect ?? [])])}`,
    `frame-src ${u([c.clerkOrigin, ...(c.frame ?? [])])}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(c: HardeningConfig): Record<string, string> {
  return {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "Content-Security-Policy-Report-Only": csp(c),
  };
}

/** The static-assets _headers file, applied by Cloudflare to every asset path. */
export function renderHeadersFile(c: HardeningConfig): string {
  return "/*\n" + Object.entries(securityHeaders(c)).map(([k, v]) => `  ${k}: ${v}`).join("\n") + "\n";
}

export function withSecurityHeaders(res: Response, headers: Record<string, string>): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}

type Handler<E> = (req: Request, env: E, ctx: ExecutionContext) => Response | Promise<Response>;

/** Wrap a Worker fetch handler: body cap, rate limit, then security headers on whatever comes back. */
export function hardenFetch<E extends object>(handler: Handler<E>, c: HardeningConfig): Handler<E> {
  const headers = securityHeaders(c);
  return async (req, env, ctx) => {
    const bounded = await limitBody(req);
    if (bounded instanceof Response) return withSecurityHeaders(bounded, headers);
    const limited = await rateLimit(bounded, env as { PUBLIC_WRITE_LIMIT?: never });
    if (limited) return withSecurityHeaders(limited, headers);
    return withSecurityHeaders(await handler(bounded, env, ctx), headers);
  };
}
