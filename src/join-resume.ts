// The one fact a resumed application needs that the canonical resume does not
// carry: which membership it is for.
//
// Chapter's GET /api/join/resume says which step the applicant belongs on and
// nothing else, so a free Associate who reloads the page resumed at booking
// with the site's step rail showing a payment step she never had (PM bug
// 854d3a8b, E2E-01). This route answers the tier the server holds for the
// application, verified the same way Chapter verifies a resume: the id is a
// capability, the row must belong to this chapter and this Stripe runtime, and
// a closed application is refused. It asserts a tier only when it can prove
// one from the stored rows; otherwise `tier` is null and the island keeps the
// state it already had. Nothing else about the application is returned.

import type { Route } from "@odla-ai/chapter/worker";

export const JOIN_RESUME_TIER_PATH = "/api/join/resume/tier";

// The statuses Chapter's resume treats as closed (worker-join-resume).
const CLOSED_STATUSES = ["refunded", "declined", "canceled"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

type Row = Record<string, unknown>;

/** Chapter's own rule (src/tiers.ts tierIsFree): a tier is free when it has no
 *  positive price and no Stripe price behind it. */
export function tierRowIsFree(row: Row): boolean {
  const priceCents = typeof row.priceCents === "number" ? row.priceCents : 0;
  const stripePriceId = typeof row.stripePriceId === "string" ? row.stripePriceId : "";
  return !(priceCents > 0) && !stripePriceId;
}

export const joinResumeTierRoute: Route = async (req, url, env, ctx) => {
  if (req.method !== "GET" || url.pathname !== JOIN_RESUME_TIER_PATH) return null;
  const applicationId = url.searchParams.get("application") ?? "";
  if (!applicationId || applicationId.length > 160) return json({ error: "application is required" }, 400);

  const db = ctx.makeDb(env);
  const apps = (await db.query({ applications: { $: { where: { id: applicationId }, limit: 1 } } })).applications;
  const app = (Array.isArray(apps) ? apps[0] : undefined) as Row | undefined;
  if (!app || String(app.groupId ?? "") !== ctx.chapter.id) return json({ error: "not found" }, 404);
  const e = env as unknown as Record<string, unknown>;
  const runtime = typeof e.ODLA_RUNTIME === "string" ? e.ODLA_RUNTIME : "default";
  if (typeof app.stripeRuntime === "string" && app.stripeRuntime !== runtime) return json({ error: "not found" }, 404);
  if (app.canceled === true || CLOSED_STATUSES.includes(String(app.status))) {
    return json({ error: "application is not resumable", code: "application_closed", applicationId }, 409);
  }

  const tierId = typeof app.tierId === "string" ? app.tierId : "";
  if (!tierId) return json({ applicationId, tier: null });
  const tiers = (await db.query({ tiers: { $: { where: { groupId: ctx.chapter.id, id: tierId }, limit: 1 } } })).tiers;
  const tier = (Array.isArray(tiers) ? tiers[0] : undefined) as Row | undefined;
  if (!tier) return json({ applicationId, tier: null });
  return json({ applicationId, tier: { id: tierId, free: tierRowIsFree(tier) } });
};
