// THE Worker entry for this site. The same file serves the development
// Workers (silver-and-salt-capital-dev, one per developer account), the
// staging candidate, and production; which chapter configuration and which
// membership edge it runs with is decided per request from the ODLA_* vars
// through src/deployment.ts and src/chapter.config.mjs, never by a fork.
//
// This is `chapterWorker({ chapter, routes })`. Chapter is primary for every
// real route: applications, payments, scheduling, the Stripe webhook, /api/me,
// CRM, and all of /api/admin/*. The three legacy host routes that used to sit
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
//   migrationReadiness   fail-closed readiness gate for the cutover runbook
//   network.route        inbound membership effects from Built Not Found
//                        (only when MEMBERSHIP_AUTHORITY_OWNER is set)

import { chapterWorker, createWorkerContext, type ChapterEnv, type Route } from "@odla-ai/chapter/worker";
import chapterPackage from "@odla-ai/chapter/package.json";
import { chapterFor } from "./chapter.config.mjs";
import { envNameOf, resolveDeployment, type EnvName } from "./deployment";
import { joinPage } from "./join-page";
import { recoverPendingApprovals } from "./approval-recovery";
import { membershipNetwork } from "./membership-network";
import { resolveSalesState, salesGate, salesStateRoute } from "./sales-state";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

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

// Observability stays a host concern; wrap here with withObservability from
// @odla-ai/o11y once "o11y" is added to services.

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

  const chapter = chapterFor(envName);
  const base = {
    chapter,
    requirePaymentQuote: true,
    crmBasePath: "/api/crm",
    routes: [salesGate, salesStateRoute, joinPage, migrationReadiness] as Route[],
  };
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

export default {
  fetch(req: Request, env: ChapterEnv, ctx: ExecutionContext) {
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
    return target.worker.fetch(req, env, ctx);
  },
  scheduled(_controller: ScheduledController, env: ChapterEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        try {
          await recoverPendingApprovals(workerFor(env).background, env);
        } catch (err) {
          console.error("chapter.scheduled", (err as Error).message);
        }
      })(),
    );
  },
};
