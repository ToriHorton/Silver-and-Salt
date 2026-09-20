// The site's resume loader: Chapter's canonical state, plus the verified tier.
//
// chapter-follower: a journey resumes through GET /api/join/resume, so the
// SERVER decides which step the applicant belongs on. That response carries no
// tier, and the site's step rail needs one (a free membership has no payment
// step), so the rail used to fall back to the URL's ?tier=, which a reload
// without one loses (PM bug 854d3a8b, E2E-01). The tier is asked of the site's
// own route (src/join-resume.ts), which reads it from the stored application:
// never from the URL, sessionStorage, or anything else the browser supplies.
//
// The canonical state is returned unchanged when the tier cannot be verified:
// the journey must resume even when the rail has to keep the state it had.

import { loadJoinResume } from "@odla-ai/chapter/ui/member";

export const JOIN_RESUME_TIER_PATH = "/api/join/resume/tier";

/**
 * Resolve a saved application id against the server. The result is Chapter's
 * JoinFlowState, with `tier: { id, free }` attached when the server verified
 * the application's membership.
 */
export async function loadSiteJoinResume(applicationId, fetcher = fetch) {
  const state = await loadJoinResume(applicationId, fetcher);
  if (!("applicationId" in state) || state.step === "closed") return state;
  try {
    const res = await fetcher(`${JOIN_RESUME_TIER_PATH}?application=${encodeURIComponent(applicationId)}`);
    if (!res.ok) return state;
    const data = await res.json();
    if (!data || data.applicationId !== applicationId) return state;
    const tier = data.tier;
    if (!tier || typeof tier.id !== "string" || typeof tier.free !== "boolean") return state;
    return { ...state, tier: { id: tier.id, free: tier.free } };
  } catch {
    return state;
  }
}
