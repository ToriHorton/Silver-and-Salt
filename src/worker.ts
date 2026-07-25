// Worker for the Silver & Salt Capital site.
//
// Everything this file used to do by hand (Clerk JWT verification, the odla-db
// admin client, the join/pay/book member surface, the /api/admin/* operations
// API, the Stripe webhook, the CRM mount, the email pipeline, the static-asset
// fallback) is now @odla-ai/chapter, configured by src/chapter.config.mjs.
//
// What remains here are two workarounds for @odla-ai/chapter 0.23.0, each
// scoped as tightly as possible and each covered by tests. Both are marked
// UPSTREAM and should be deleted when the package fixes them.
//
// Two pre-conversion paths are gone rather than aliased:
//   /api/auth/config                 -> /api/config
//   /api/groups/:groupId/join-config -> /api/join-config
// Both changed response SHAPE, not just path, so a path-only alias would answer
// 200 with a body the caller cannot read. Every caller moved in the same change.

import { chapterWorker } from "@odla-ai/chapter/worker";
import { syncApplicationToCrm } from "@odla-ai/chapter";
import { initAdmin } from "@odla-ai/db";
import { chapter } from "./chapter.config.mjs";

const handler = chapterWorker({ chapter });

type Env = Parameters<typeof handler.fetch>[1];

/**
 * UPSTREAM WORKAROUND 1 (@odla-ai/chapter 0.23.0): multi-select fields arrive
 * as a JSON string, not an array.
 *
 * JoinIsland collects the form with
 *   `for (const [k, v] of new FormData(form).entries()) fields[k] = v`
 * so repeated input names overwrite and only the last value survives; `getAll`
 * appears nowhere in the shipped bundle. Our seven "Interests" checkboxes share
 * name="focus", so the applicant's selection would post as one string.
 *
 * src/app/join.jsx therefore posts `focus` as a JSON array string, and this
 * parses it back before chapter validates. Verified against the dev tenant: an
 * array stores as an array, a JSON string stores verbatim as a string, so the
 * parse has to happen here rather than being absorbed downstream.
 *
 * `focus` is the only json-typed application attr, so this is scoped to it
 * rather than being a general "parse anything that looks like JSON" rule, which
 * would corrupt a free-text answer that happens to start with a bracket.
 */
export async function normalizeApplication(req: Request): Promise<Request> {
  let body: Record<string, unknown>;
  try {
    body = await req.clone().json();
  } catch {
    return req; // Not JSON. Let chapter return its own validation error.
  }
  if (typeof body?.focus !== "string") return req;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.focus);
  } catch {
    return req; // A plain string is a legitimate single value.
  }
  if (!Array.isArray(parsed)) return req;

  return new Request(req, { body: JSON.stringify({ ...body, focus: parsed }) });
}

/**
 * UPSTREAM WORKAROUND 2 (@odla-ai/chapter 0.23.0): the CRM stage is not
 * mirrored when payment or booking moves an application.
 *
 * chapter calls `syncApplicationToCrm` from exactly two of the four places that
 * write `applications.status`: the admin approve route and the admin PATCH.
 * The Stripe webhook (submitted -> paid_pending_vetting, -> refunded) and
 * POST /api/schedule/book (-> call_scheduled) write the status without it.
 *
 * That matters because chapter's OWN admin dashboard builds its pipeline funnel
 * from `crm_record.stage`, not from `applications.status`. Left alone, every
 * applicant who pays or books still reads as "Submitted" in the console, which
 * is the admin's main at-a-glance view. Verified live on the dev tenant: a paid
 * application flipped to paid_pending_vetting while its crm_record stayed at
 * stage "submitted" with no billing snapshot.
 *
 * So after chapter handles one of those two requests successfully, re-project
 * the affected application. This runs after the response is produced and is
 * fully swallowed on error: a CRM hiccup must never fail a payment webhook
 * (Stripe would retry it) or a booking the member already saw confirmed.
 */
async function resyncCrmStage(req: Request, url: URL, env: Env): Promise<void> {
  const db = initAdmin({
    appId: env.ODLA_TENANT,
    adminToken: env.ODLA_API_KEY,
    endpoint: env.ODLA_ENDPOINT,
  });

  const load = async (where: Record<string, unknown>) => {
    const { applications } = await db.query({ applications: { $: { where, limit: 1 } } });
    return applications?.[0] ?? null;
  };

  let app = null;
  if (url.pathname === "/api/schedule/book") {
    const body = await req.clone().json().catch(() => null);
    const id = body?.applicationId;
    if (typeof id === "string") app = await load({ id });
  } else {
    // Stripe sends the subscription or customer, never our application id.
    const event = await req.clone().json().catch(() => null);
    const obj = event?.data?.object ?? {};
    const subscription = typeof obj.subscription === "string" ? obj.subscription : obj.id;
    const customer = typeof obj.customer === "string" ? obj.customer : null;
    if (typeof subscription === "string") app = await load({ stripeSubscriptionId: subscription });
    if (!app && customer) app = await load({ stripeCustomerId: customer });
  }

  if (!app?.email || typeof app.status !== "string") return;

  await syncApplicationToCrm(
    { crm: chapter.crm, db, chapter, now: () => Date.now(), newId: () => crypto.randomUUID() },
    { app, stage: app.status },
  );
}

/** The two paths whose status writes chapter does not mirror into the CRM. */
const RESYNC_PATHS = new Set(["/api/schedule/book", "/api/webhooks/stripe"]);

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/api/applications") {
      return handler.fetch(await normalizeApplication(req), env);
    }

    if (req.method === "POST" && RESYNC_PATHS.has(url.pathname)) {
      const clone = req.clone();
      const res = await handler.fetch(req, env);
      if (res.ok) {
        const work = resyncCrmStage(clone, url, env).catch((err) => {
          console.error("crm stage resync failed", err);
        });
        // Keep the isolate alive for the projection without delaying the
        // response; Stripe in particular treats a slow webhook as a failure.
        if (ctx?.waitUntil) ctx.waitUntil(work);
        else await work;
      }
      return res;
    }

    return handler.fetch(req, env);
  },
};
