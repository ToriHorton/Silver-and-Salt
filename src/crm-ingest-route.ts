// POST /api/crm-ingest, the automated meeting/call pull (CRM-INGEST.md).
//
// A deliberately narrow write-only surface for the scheduled morning job,
// kept OFF the admin CRM routes. It maps meetings onto person records as
// call/meeting activities and follow-up tasks (src/crm-ingest.mjs) and can do
// nothing else: it cannot read the CRM, cannot send email, and cannot write
// stage_change or system activities. So a leaked ingest secret exposes no
// member data and cannot mail the membership, which a full admin service
// token would.
//
// Mounted as a host route in src/worker-chapter.ts. It first shipped inside
// src/worker.ts, which production no longer runs, so it answered 404 live
// until it moved here (2026-09-24).

import type { Route } from "@odla-ai/chapter/worker";
import { ingestBatch } from "./crm-ingest.mjs";

export const CRM_INGEST_PATH = "/api/crm-ingest";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Constant-time string comparison for bearer secrets. Compares every byte of
// the longer input regardless of where the first mismatch is, so response
// timing does not reveal a correct prefix.
export function timingSafeEqualStr(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export const crmIngestRoute: Route = async (req, url, env, ctx) => {
  if (url.pathname !== CRM_INGEST_PATH) return null;
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const expected = (env as unknown as Record<string, unknown>).CRM_INGEST_SECRET;
  const presented = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  // Fail closed when the secret is unset.
  if (typeof expected !== "string" || !expected || !timingSafeEqualStr(presented, expected)) {
    return json({ error: "unauthorized" }, 401);
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  try {
    const report = await ingestBatch(ctx.makeDb(env) as never, payload);
    return json(report, report.errors.length ? 207 : 200);
  } catch (err) {
    console.error("crm-ingest failed", (err as Error).message);
    return json({ error: "ingest failed" }, 500);
  }
};
