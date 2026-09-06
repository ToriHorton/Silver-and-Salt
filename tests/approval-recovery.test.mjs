import { describe, expect, it, vi } from "vitest";
const { retry } = vi.hoisted(() => ({ retry: vi.fn(async () => ({ repaired: 1, pending: 0, more: false })) }));
vi.mock("@odla-ai/chapter/worker", () => ({ retryChapterApprovalEffects: retry }));
import { approvalRecoveryOrigin, recoverPendingApprovals } from "../src/approval-recovery.ts";

const env = { ODLA_APP_ID: "silver-and-salt-capital", ODLA_TENANT: "silver-and-salt-capital--dev", ODLA_ENV: "dev", ODLA_RUNTIME: "cory" };
describe("host approval recovery wiring", () => {
  it("passes the exact installed runtime and trusted origin to the bounded foundational drainer", async () => {
    const context = {};
    await recoverPendingApprovals(context, env);
    expect(retry).toHaveBeenCalledWith(context, env, { origin: "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev", limit: 100 });
  });
  it("respects the peer runtime without treating it as a replica", () => {
    expect(approvalRecoveryOrigin({ ...env, ODLA_RUNTIME: "tori" })).toBe("https://silver-and-salt-capital-dev.silver-and-salt.workers.dev");
  });
  it.each([{ ODLA_RUNTIME: undefined }, { ODLA_RUNTIME: "default" }, { ODLA_APP_ID: "sibling" }, { ODLA_ENV: "prod" }, { ODLA_TENANT: "silver-and-salt-capital" }])("fails closed for an unbound scope %j", (override) => {
    expect(() => approvalRecoveryOrigin({ ...env, ...override })).toThrow(/exact configured/);
  });
});
