import { retryChapterApprovalEffects, type ChapterEnv, type WorkerContext } from "@odla-ai/chapter/worker";

const DEV_ORIGINS: Record<string, string> = {
  cory: "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev",
  tori: "https://silver-and-salt-capital-dev.silver-and-salt.workers.dev",
};

// An account's installed ODLA_RUNTIME selects only that account's durable
// pending work. Never infer a runtime from a shared data environment.
export function approvalRecoveryOrigin(env: ChapterEnv): string {
  if (env.ODLA_APP_ID !== "silver-and-salt-capital" || env.ODLA_ENV !== "dev" ||
      env.ODLA_TENANT !== "silver-and-salt-capital--dev" ||
      !env.ODLA_RUNTIME || !Object.hasOwn(DEV_ORIGINS, env.ODLA_RUNTIME)) {
    throw new Error("Approval recovery requires an exact configured Silver dev runtime");
  }
  return DEV_ORIGINS[env.ODLA_RUNTIME];
}

export async function recoverPendingApprovals(context: WorkerContext, env: ChapterEnv) {
  const origin = approvalRecoveryOrigin(env);
  const result = await retryChapterApprovalEffects(context, env, { origin, limit: 100 });
  // Counts only; no applicant identity or provider payload is logged.
  console.log("chapter.approval-recovery", result);
  return result;
}
