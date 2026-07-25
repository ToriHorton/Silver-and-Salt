// Worker for the Silver & Salt Capital site.
//
// Everything this file used to do by hand (Clerk JWT verification, the odla-db
// admin client, the join/pay/book member surface, the /api/admin/* operations
// API, the Stripe webhook, the CRM mount, the email pipeline, the static-asset
// fallback) is now @odla-ai/chapter, configured by src/chapter.config.mjs.
//
// Two pre-conversion paths are gone rather than aliased:
//   /api/auth/config                 -> /api/config
//   /api/groups/:groupId/join-config -> /api/join-config
// Both changed response SHAPE, not just path (the old join-config returned a
// computed `lineItems`; the old auth config returned `publishableKey`/`issuer`).
// A path-only alias would answer 200 with a body the caller cannot read, which
// fails deeper and reads as a bug. Every caller moved in the same change, so a
// stale bundle gets a clean 404 instead.

import { chapterWorker } from "@odla-ai/chapter/worker";
import { chapter } from "./chapter.config.mjs";

const handler = chapterWorker({ chapter });

/**
 * UPSTREAM WORKAROUND (@odla-ai/chapter 0.23.0): multi-select fields arrive as
 * a JSON string, not an array.
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
 * Delete this together with the hidden input in join.jsx once JoinIsland
 * uses `getAll`.
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

export default {
  async fetch(req: Request, env: Parameters<typeof handler.fetch>[1]): Promise<Response> {
    if (req.method === "POST" && new URL(req.url).pathname === "/api/applications") {
      return handler.fetch(await normalizeApplication(req), env);
    }
    return handler.fetch(req, env);
  },
};
