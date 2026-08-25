// THE Worker entry for this site — `wrangler deploy --env dev` deploys this to
// silver-and-salt-capital-dev, and a future prod deploy runs the same file.
//
// This is `chapterWorker({ chapter, routes })`. It began as an off-route canary
// on its own worker name, mounting EVERY legacy endpoint as a host route so the
// Chapter build could be measured without changing who served what. Phase 4
// retired those routes one at a time, each only after its behavior was compared
// against the built-in, and Chapter is now primary for applications, payments,
// scheduling, the Stripe webhook, /api/me, CRM and all of /api/admin/*.
//
// Three legacy routes remain below, each for a stated reason rather than
// inertia. src/worker.ts is no longer an entry point but is still imported here
// to serve them.
//
// Route ownership is an explicit ALLOWLIST rather than "legacy handles anything
// it doesn't 404 on". An allowlist is auditable (you can read what legacy owns),
// and retiring a route is a one-line deletion rather than a behavioral guess.

import { chapterWorker, type Route } from "@odla-ai/chapter/worker";
import { chapter } from "./chapter.config.mjs";
import { handleApi, json, type Env as LegacyEnv } from "./worker";

// Phase 4 state. Only routes Chapter does NOT own remain here. Each retirement
// below was verified against Chapter's built-in before removal, not assumed.
//
// RETIRED to Chapter (verified drop-ins):
//   /api/webhooks/stripe        same status transitions (submitted ->
//                               paid_pending_vetting on first payment, refunded
//                               on charge.refunded) AND the literal same
//                               mutationId `stripe:<eventId>`, so replay dedupe
//                               carries across the swap. Honors our
//                               sends.adminNotification: "payment".
//   /api/applications           response {id,duplicate,status,disclaimerAckAt}
//                               at 200 vs legacy {ok,id,duplicate,
//                               accountCreated} at 201. join.html reads only
//                               res.ok and data.id, both satisfied. Uses our
//                               resolved field/caps config.
//   /api/payments/subscription  same path and body contract.
//   /api/schedule/{slots,book}  same paths; booking gated by our bookableFrom.
//   /api/me                     returns {...base, application}; 401
//                               {authorized:false} unauth, same as legacy.
//   /api/crm/*                  mounted at the same basePath from the same
//                               @odla-ai/crm config object (src/crm.mjs).
//   /api/admin/*                path-for-path superset, including the regex
//                               routes applications/:id{,/approve,/refund},
//                               meetings/:id/{reschedule,cancel}, and
//                               people/:id/comms. approve returns the identical
//                               {ok,status,rolePromoted,emailLogged} and the
//                               identical 409 text; refund selects the same
//                               charge (last element of the succeeded,
//                               unrefunded list = earliest) and enforces our
//                               operations.refund.allowedFrom; canChangeRole
//                               reproduces the legacy escalation guards
//                               including the super-admin-only admin rule.
//                               EXCEPT the two paths listed below.
const LEGACY_OWNED: Array<RegExp> = [
  // Chapter's equivalent is /api/config with shape {clerkPublishableKey, env}.
  // The site's own pages read {publishableKey, issuer} from this path. Kept as
  // a host route so no client breaks; retire it in Phase 5 when the pages move
  // onto the packaged components.
  /^\/api\/auth\/config$/,

  // RETIRED (PM bug 019f9c67, task 019fa013-cafa). The group-scoped
  // /api/groups/:id/join-config existed only because join.html needed
  // lineItems and publishableKey up front. JoinIsland gets both from
  // /api/payments/subscription instead, so the page no longer calls it and
  // nothing else in the tree references it. The built bundle now calls only
  // Chapter routes: /api/applications, /api/join-config, /api/join/resume,
  // /api/payments/subscription, /api/schedule/{slots,book}.

  // No Chapter equivalent exists. Admin-gated internal stat.
  /^\/api\/applications\/count$/,

  // Chapter serves scheduling settings at /api/admin/scheduling; the legacy
  // path is /api/admin/group/scheduling. Kept as an inbound compatibility URL
  // so the existing admin console keeps working. NOTE: this pattern must stay
  // AHEAD of the general admin fallthrough, which is why nothing else in
  // /api/admin/ is listed here any more.
  /^\/api\/admin\/group\/scheduling$/,
];

const ownedByLegacy = (pathname: string) => LEGACY_OWNED.some((re) => re.test(pathname));

/**
 * The legacy API, mounted as a host route. Returns null (falls through to the
 * Chapter built-ins) for anything outside the allowlist, so this cannot silently
 * swallow a Chapter route.
 *
 * Deliberately does NOT reproduce the legacy `env.ASSETS.fetch(req)` tail: asset
 * fallback is Chapter's, and duplicating it here would let legacy answer static
 * requests before Chapter's unknown-/api/ JSON 404 rule could apply.
 */
const legacyApi: Route = async (req, url, env) => {
  if (!ownedByLegacy(url.pathname)) return null;
  try {
    return await handleApi(req, env as unknown as LegacyEnv, url);
  } catch (err) {
    // Mirrors the legacy entry's error mapping so the canary cannot look
    // healthier than the product it is standing in for.
    const code = (err as { code?: string })?.code;
    const retryable = (err as { retryable?: boolean })?.retryable;
    if (code) {
      console.error("odla error", code, (err as { requestId?: string })?.requestId);
      return json({ error: "upstream error", code }, retryable ? 503 : 502);
    }
    console.error("api error", err);
    return json({ error: "internal error" }, 500);
  }
};

/**
 * Fail-closed migration readiness gate (adopt-existing runbook, Phase 1).
 *
 * The built-in /api/health is only `{ok:true}` and never touches the database,
 * so it cannot gate a cutover. This route returns 503 until every input matches
 * the acceptance manifest, and it is expected to stay 503 through the canary
 * phase — that is the gate working, not a defect.
 *
 * Admin-only, and it returns only redacted counts and digests: never a row body.
 */
const migrationReadiness: Route = async (req, url, env, ctx) => {
  if (req.method !== "GET" || url.pathname !== "/api/admin/migration-readiness") return null;

  const user = await ctx.verifyUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = ctx.makeDb(env);
  if (!(await ctx.isAdmin(db, user))) return json({ error: "forbidden" }, 403);

  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // 1. Literal tenant/app/env identity.
  const tenant = (env as unknown as LegacyEnv).ODLA_TENANT;
  const appEnv = (env as unknown as LegacyEnv).ODLA_ENV;
  checks.identity = {
    ok: tenant === "silver-and-salt-capital--dev" && appEnv === "dev",
    detail: `tenant=${tenant} env=${appEnv}`,
  };

  // 2. Chapter is the primary implementation for the real routes. Still false
  //    by construction while LEGACY_OWNED is non-empty (Phase 4 empties it).
  checks.chapterPrimary = {
    ok: LEGACY_OWNED.length === 0,
    detail: `${LEGACY_OWNED.length} route patterns still owned by the legacy worker`,
  };

  // 3. Required group row present under the live group id.
  let groupOk = false;
  let groupDetail = "not queried";
  try {
    const { groups } = await db.query({
      groups: { $: { where: { id: chapter.id }, limit: 1 } },
    });
    const row = groups?.[0] as Record<string, unknown> | undefined;
    groupOk = Boolean(row && row.stripePriceId && row.notificationEmail);
    groupDetail = row ? "present" : "missing";
  } catch (e) {
    groupDetail = `query failed: ${(e as Error).name}`;
  }
  checks.groupRow = { ok: groupOk, detail: groupDetail };

  // 4. Reconciled row counts against the Phase 0 freeze. Counts may only grow;
  //    a shrink means data loss and must fail the gate.
  const FROZEN = { applications: 36, meetings: 7, emailLog: 49 };
  let countsOk = false;
  let countsDetail = "not queried";
  try {
    const res = await db.query({
      applications: {},
      meetings: {},
      emailLog: {},
    });
    const now = {
      applications: res.applications?.length ?? 0,
      meetings: res.meetings?.length ?? 0,
      emailLog: res.emailLog?.length ?? 0,
    };
    const shrunk = Object.entries(FROZEN).filter(
      ([k, v]) => now[k as keyof typeof now] < v,
    );
    countsOk = shrunk.length === 0;
    countsDetail = shrunk.length
      ? `shrank vs freeze: ${shrunk.map(([k]) => k).join(",")}`
      : `applications=${now.applications} meetings=${now.meetings} emailLog=${now.emailLog}`;
  } catch (e) {
    countsDetail = `query failed: ${(e as Error).name}`;
  }
  checks.rowCounts = { ok: countsOk, detail: countsDetail };

  const ready = Object.values(checks).every((c) => c.ok);
  return json(
    {
      ready,
      chapter: { id: chapter.id, mode: chapter.mode, release: "0.26.0" },
      checks,
    },
    ready ? 200 : 503,
  );
};

// Observability stays a host concern; wrap here with withObservability from
// @odla-ai/o11y once "o11y" is added to services (it is not, per the current
// odla.config.mjs).
export default chapterWorker({
  chapter,
  crmBasePath: "/api/crm",
  routes: [migrationReadiness, legacyApi],
});
