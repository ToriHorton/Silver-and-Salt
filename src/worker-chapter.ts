// THE Worker entry for this site. The same file serves the development
// Workers (silver-and-salt-capital-dev, one per developer account), the
// staging candidate, and production; which chapter configuration and which
// membership edge it runs with is decided per request from the ODLA_* vars
// through src/deployment.ts and src/chapter.config.mjs, never by a fork.
//
// This is `withObservability(chapterWorker({ chapter, routes, recordError }))`,
// the chapter-follower runbook's mount (Chapter 0.52.0) around a
// per-deployment factory. Chapter is primary for every real route:
// applications, payments, scheduling, the Stripe webhook, /api/me, CRM, and
// all of /api/admin/*. The three legacy host routes that used to sit
// in front of it were retired on 2026-09-14 (nothing in the tree called
// /api/auth/config or /api/applications/count, and the admin availability tab
// now calls Chapter's /api/admin/scheduling directly), so src/worker.ts is no
// longer imported here at all.
//
// Host routes, in order, all ahead of the built-ins:
//   salesGate            refuses every purchase/signup entry point unless
//                        sales are open to this request (src/sales-state.ts)
//   salesStateRoute      GET /api/sales-state readout for operators and CI
//   joinPage             mounts the join island only when sales are open
//   joinResumeTierRoute  the verified tier of a resumed application, which the
//                        canonical GET /api/join/resume does not carry
//                        (src/join-resume.ts; PM bug 854d3a8b E2E-01)
//   migrationReadiness   fail-closed readiness gate for the cutover runbook
//   signupPathsRoute     admin readout of each application's signup path
//                        (src/signup-paths.ts, which also owns the 24-hour
//                        booking reminder on the cron below)
//   network.route        inbound membership effects from Built Not Found
//                        (only when MEMBERSHIP_AUTHORITY_OWNER is set)
//
// One request normalizer sits in the mount itself, ahead of Chapter:
//   withQuoteSelectionBody  gives POST /api/payments/quote the empty JSON body
//                           Chapter 0.55.0 requires (see its comment below)

import { chapterWorker, createWorkerContext, type ChapterEnv, type Route } from "@odla-ai/chapter/worker";
import chapterPackage from "@odla-ai/chapter/package.json";
import { withObservability } from "@odla-ai/o11y";
import { recordChapterAlert } from "./chapter-alerts";
import { chapterFor } from "./chapter.config.mjs";
import { envNameOf, resolveDeployment, type EnvName } from "./deployment";
import { joinPage } from "./join-page";
import { joinResumeTierRoute } from "./join-resume";
import { recoverPendingApprovals } from "./approval-recovery";
import { membershipNetwork } from "./membership-network";
import { notifyAdminOfMilestones, remindUnbooked, signupPathsRoute } from "./signup-paths";
import { resolveSalesState, salesGate, salesStateRoute } from "./sales-state";
import { hardenFetch } from "./hardening";
import { SILVER_HARDENING } from "./hardening.config";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * Hotfix (2026-09-23) for Chapter 0.55.0: restore the payment step's opening
 * quote request.
 *
 * Chapter's POST /api/payments/quote parses a request body whenever the
 * request carries one, and answers 400 "invalid seat selection" when that
 * parse throws. The payment step's first call (the package's own
 * MembershipPaymentStep) sends `{ method: "POST", cache: "no-store" }` with no
 * body, and a bodyless POST still arrives with Content-Length: 0, so the route
 * parsed "" and threw. Every paid tier's checkout answered 400 from the 0.55.0
 * deploy (2026-09-22 05:44Z) onward: no quote, so no Stripe subscription, so
 * no charge and no receipt. Both tiers were affected, not just Community
 * Steward.
 *
 * `{}` is the body that route already accepts as "no seat selection": it has
 * no keys, so the key guard passes and the route's own `selection` stays
 * undefined, which is exactly the behaviour before 0.55.0. A request carrying
 * a real seat selection is handed on untouched and is never read here.
 *
 * Remove this once the package sends the empty object or tolerates a missing
 * body; tests/worker-mount.test.mjs pins both halves.
 */
export const PAYMENT_QUOTE_PATH = "/api/payments/quote";

const withJsonBody = (req: Request, body: string): Request => {
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  // The runtime recomputes the length for the body handed to the constructor.
  headers.delete("content-length");
  return new Request(req.url, { method: req.method, headers, body });
};

export async function withQuoteSelectionBody(req: Request): Promise<Request> {
  if (req.method !== "POST") return req;
  let pathname: string;
  try {
    pathname = new URL(req.url).pathname;
  } catch {
    return req;
  }
  if (pathname !== PAYMENT_QUOTE_PATH) return req;

  // A declared, non-zero length is a seat selection on its way to Chapter.
  // Return the request unread so the body reaches the route as it was sent.
  const declared = req.headers.get("content-length");
  if (declared !== null && declared !== "0") return req;

  // Length declared as zero: the opening call. Nothing to read.
  if (declared === "0") return withJsonBody(req, "{}");

  // No declared length at all: read once to tell empty from a real selection.
  const body = await req.text();
  return withJsonBody(req, body.trim() === "" ? "{}" : body);
}

/**
 * Fail-closed readiness gate (adopt-existing runbook, Phase 8 checkpoints).
 *
 * The built-in /api/health is only `{ok:true}` and never touches the database,
 * so it cannot gate a cutover. This route returns 503 until every input matches
 * the deployment it is running as. It asserts nothing about historical row
 * counts: production starts clean, and an empty namespace is a valid state.
 *
 * Admin-only, and it returns only redacted status: never a row body.
 */
const migrationReadiness: Route = async (req, url, env, ctx) => {
  if (req.method !== "GET" || url.pathname !== "/api/admin/migration-readiness") return null;

  const user = await ctx.verifyUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = ctx.makeDb(env);
  if (!(await ctx.isAdmin(db, user))) return json({ error: "forbidden" }, 403);

  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // 1. The ODLA_* vars name exactly one configured deployment.
  let deployment: ReturnType<typeof resolveDeployment> | null = null;
  try {
    deployment = resolveDeployment(env);
    checks.identity = {
      ok: true,
      detail: `env=${deployment.envName} tenant=${deployment.tenant} runtime=${deployment.runtime}`,
    };
  } catch (e) {
    checks.identity = { ok: false, detail: (e as Error).message };
  }

  // 2. The chapter configuration in force matches the deployment's Stripe mode.
  const chapter = chapterFor(envNameOf(env));
  checks.stripeMode = {
    ok: deployment !== null && chapter.signupControl?.stripeMode === deployment.stripeMode,
    detail: `config=${chapter.signupControl?.stripeMode ?? "unset"} deployment=${deployment?.stripeMode ?? "unresolved"}`,
  };

  // 3. Required group row present under the chapter id with real addressing.
  let groupOk = false;
  let groupDetail = "not queried";
  try {
    const { groups } = await db.query({
      groups: { $: { where: { id: chapter.id }, limit: 1 } },
    });
    const row = groups?.[0] as Record<string, unknown> | undefined;
    const notify = typeof row?.notificationEmail === "string" ? row.notificationEmail : "";
    groupOk = Boolean(row && notify && !notify.includes("+debug"));
    groupDetail = row ? (groupOk ? "present" : "present but addressed to a debug inbox") : "missing";
  } catch (e) {
    groupDetail = `query failed: ${(e as Error).name}`;
  }
  checks.groupRow = { ok: groupOk, detail: groupDetail };

  // 4. The namespaces the signup-control receiver and tier authority need are
  //    provisioned and readable. Empty is fine; unreadable is not.
  let schemaOk = false;
  let schemaDetail = "not queried";
  try {
    const res = await db.query({ tiers: {}, signupControlHeads: {} });
    schemaOk = Array.isArray(res.tiers) && Array.isArray(res.signupControlHeads);
    schemaDetail = `tiers=${res.tiers?.length ?? 0} signupControlHeads=${res.signupControlHeads?.length ?? 0}`;
  } catch (e) {
    schemaDetail = `query failed: ${(e as Error).name}`;
  }
  checks.schema = { ok: schemaOk, detail: schemaDetail };

  // 5. Sales state is reported, never asserted: a ready production Worker with
  //    sales disabled is exactly the dark-deploy state the runbook wants.
  const sales = resolveSalesState(env);
  checks.salesState = { ok: true, detail: `${sales.state} (${sales.reason})` };

  const ready = Object.values(checks).every((c) => c.ok);
  return json(
    {
      ready,
      chapter: { id: chapter.id, mode: chapter.mode, release: chapterPackage.version },
      checks,
    },
    ready ? 200 : 503,
  );
};

/**
 * The options every Worker for one environment is built from: the resolved
 * chapter, the host routes, and where Chapter's operator alerts go
 * (src/chapter-alerts.ts). Exported so tests/worker-mount.test.mjs can hold
 * the mount to the chapter-follower runbook without a database.
 */
export function chapterWorkerOptions(envName: EnvName) {
  return {
    chapter: chapterFor(envName),
    requirePaymentQuote: true,
    crmBasePath: "/api/crm",
    recordError: recordChapterAlert,
    routes: [salesGate, salesStateRoute, joinPage, joinResumeTierRoute, migrationReadiness, signupPathsRoute] as Route[],
  };
}

interface Built {
  worker: ReturnType<typeof chapterWorker>;
  background: ReturnType<typeof createWorkerContext>;
}

const built = new Map<string, Built>();

/**
 * Workers are built once per (environment, runtime, authority-owner) and
 * cached. A request from a differently configured deployment never reuses
 * another deployment's chapter or membership edge.
 */
function workerFor(env: ChapterEnv): Built {
  const envName: EnvName = envNameOf(env);
  const authority = env.MEMBERSHIP_AUTHORITY_OWNER === "built-not-found";
  const runtime = typeof env.ODLA_RUNTIME === "string" ? env.ODLA_RUNTIME : "";
  const key = `${envName}|${runtime}|${authority ? "authority" : "legacy"}`;
  const cached = built.get(key);
  if (cached) return cached;

  const base = chapterWorkerOptions(envName);
  let options: typeof base & { membershipAuthority?: unknown } = base;
  if (authority) {
    // Resolving the deployment here (not at module load) keeps a misconfigured
    // Worker serving static pages while every membership route fails closed.
    const deployment = resolveDeployment(env);
    const context = createWorkerContext(base);
    const network = membershipNetwork(context.makeDb, deployment);
    options = { ...base, membershipAuthority: network.authority, routes: [network.route, ...base.routes] };
  }
  const result: Built = { worker: chapterWorker(options), background: createWorkerContext(options) };
  built.set(key, result);
  return result;
}

// Body cap, public-write rate limit, and browser security headers wrap every
// response the Worker produces (src/hardening.ts); static assets get the same
// headers from _headers.
const fetchHandler = hardenFetch(async (req: Request, env: ChapterEnv, ctx: ExecutionContext) => {
    let target: Built;
    try {
      target = workerFor(env);
    } catch (err) {
      // Static pages must keep serving; only the application fails closed.
      console.error("chapter.worker scope", (err as Error).message);
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) return json({ error: "deployment_misconfigured" }, 503);
      return env.ASSETS.fetch(req);
    }
    return target.worker.fetch(await withQuoteSelectionBody(req), env, ctx);
}, SILVER_HARDENING);

// withObservability (from @odla-ai/o11y, "o11y" in services) traces both
// entrypoints and gives recordChapterAlert its sink. With no ingest token on
// the Worker it is a network no-op and the alert is still the Workers Logs line.
export default withObservability<ChapterEnv>({
  fetch: fetchHandler,
  scheduled(_controller: ScheduledController, env: ChapterEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        try {
          await recoverPendingApprovals(workerFor(env).background, env);
        } catch (err) {
          console.error("chapter.scheduled", (err as Error).message);
        }
        // Path 3 of the signup flow (Tori, 2026-09-19): paid, no call booked,
        // 24 hours on. Counts only are logged.
        try {
          const run = await remindUnbooked(workerFor(env).background, env);
          if (run.due) console.log("chapter.booking-reminder", run);
        } catch (err) {
          console.error("chapter.booking-reminder", (err as Error).message);
        }
        // Tori's inbox (2026-09-19): a note when a call is booked, and when a
        // waived member is paid and approved. Chapter's submit-time notice is off.
        try {
          const run = await notifyAdminOfMilestones(workerFor(env).background, env);
          if (run.booked || run.approved) console.log("chapter.admin-milestones", run);
        } catch (err) {
          console.error("chapter.admin-milestones", (err as Error).message);
        }
      })(),
    );
  },
});
