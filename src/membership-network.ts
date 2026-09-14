import { createMembershipWorkerAdapter, createMembershipChapterEffectRoute, type ChapterEnv } from "@odla-ai/chapter/worker";
import type { ChapterDb } from "@odla-ai/chapter";

const appId = "silver-and-salt-capital";
const secretName = "membership_authority_silver_and_salt_capital_cory";
const origin = "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev";
const authorityOrigin = "https://built-not-found-dev.cory-ondrejka.workers.dev";

export function membershipNetwork(makeDb: (env: ChapterEnv) => ChapterDb) {
  const adapter = createMembershipWorkerAdapter({
    chapterId: appId, secretName, makeDb, namedSeats: true,
    targetUrl: () => authorityOrigin,
    fetch: env => {
      if (env.ODLA_APP_ID !== appId || env.ODLA_TENANT !== `${appId}--dev` || env.ODLA_ENV !== "dev" ||
          env.ODLA_RUNTIME !== "cory" || env.ODLA_ENDPOINT !== "https://db.odla.ai") throw new Error("membership deployment scope mismatch");
      const binding = env.BUILT_NOT_FOUND as { fetch?: typeof fetch } | undefined;
      if (typeof binding?.fetch !== "function") throw new Error("BNF membership service unavailable");
      return binding.fetch.bind(binding);
    },
  });
  return { ...adapter, route: createMembershipChapterEffectRoute({ sender: "built-not-found", secretName, origin,
    applicationPath: "/join", readEffect: adapter.readEffect }) };
}
