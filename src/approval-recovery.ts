import { retryChapterApprovalEffects, type ChapterEnv, type WorkerContext } from "@odla-ai/chapter/worker";
import { resolveDeployment } from "./deployment";

// An account's installed ODLA_RUNTIME selects only that account's durable
// pending work. Never infer a runtime from a shared data environment.
export function approvalRecoveryOrigin(env: ChapterEnv): string {
  return resolveDeployment(env).origin;
}

export async function recoverPendingApprovals(context: WorkerContext, env: ChapterEnv) {
  let origin: string;
  try {
    origin = approvalRecoveryOrigin(env);
  } catch (err) {
    // A misconfigured deployment must not surface as an unhandled rejection on
    // every cron tick; log the scope failure and do nothing.
    console.error("chapter.approval-recovery skipped", (err as Error).message);
    return null;
  }
  const result = await retryChapterApprovalEffects(context, env, { origin, limit: 100 });
  // Counts only; no applicant identity or provider payload is logged.
  console.log("chapter.approval-recovery", result);
  return result;
}
