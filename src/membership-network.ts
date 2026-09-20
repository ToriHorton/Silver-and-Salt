import { createMembershipWorkerAdapter, createMembershipChapterEffectRoute, type ChapterEnv } from "@odla-ai/chapter/worker";
import type { ChapterDb } from "@odla-ai/chapter";
import { APP_ID, membershipSecretName, resolveDeployment, type Deployment } from "./deployment";

// The membership authority edge to Built Not Found for ONE deployment. Each
// deployment (dev/cory, dev/tori, prod/live) signs with its own vault secret
// and talks to its own authority origin; the table in src/deployment.ts is the
// only place those are named.
export function membershipNetwork(makeDb: (env: ChapterEnv) => ChapterDb, deployment: Deployment) {
  const secretName = membershipSecretName(deployment.runtime);
  const adapter = createMembershipWorkerAdapter({
    chapterId: APP_ID, secretName, makeDb, namedSeats: true,
    targetUrl: () => deployment.authorityOrigin,
    fetch: env => {
      // Re-check the live env against the deployment this adapter was built
      // for: a Worker never talks to an authority on behalf of another scope.
      const live = resolveDeployment(env);
      if (live.envName !== deployment.envName || live.runtime !== deployment.runtime) {
        throw new Error("membership deployment scope mismatch");
      }
      const binding = env.BUILT_NOT_FOUND as { fetch?: typeof fetch } | undefined;
      if (typeof binding?.fetch !== "function") throw new Error("BNF membership service unavailable");
      // Call through the binding as a method: an instrumented binding (o11y
      // proxies) rejects a detached or pre-bound fetch with "Illegal invocation".
      return (input: RequestInfo | URL, init?: RequestInit) => binding.fetch!(input, init);
    },
  });
  return { ...adapter, route: createMembershipChapterEffectRoute({ sender: "built-not-found", secretName,
    origin: deployment.origin, applicationPath: "/join", readEffect: adapter.readEffect }) };
}
