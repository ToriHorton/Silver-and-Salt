import { describe, it, expect, vi, afterEach } from "vitest";
import { membershipNetwork } from "../src/membership-network";

const appId = "silver-and-salt-capital";
const env = { ODLA_APP_ID: appId, ODLA_TENANT: `${appId}--dev`, ODLA_ENV: "dev", ODLA_RUNTIME: "cory", ODLA_ENDPOINT: "https://db.odla.ai" };
afterEach(() => vi.restoreAllMocks());
describe("BNF dev membership integration", () => {
  it("rejects missing transport, wrong tenant, provider endpoint and sibling runtime with no public fallback", async () => {
    const publicFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("must not use public fetch"));
    const network = membershipNetwork(() => ({ secrets: { get: async () => "synthetic-authority-edge-secret" } } as any));
    for (const delta of [{}, { ODLA_TENANT: "wrong--dev" }, { ODLA_RUNTIME: "tori" }, { ODLA_ENV: "prod" }, { ODLA_ENDPOINT: "https://wrong.invalid" }]) {
      const actualEnv = { ...env, ...delta };
      const input = { appId, chapterId: appId, environment: actualEnv.ODLA_ENV, runtime: actualEnv.ODLA_RUNTIME, applicationId: "application_test", skuId: "standard", requestId: "request_test" };
      await expect(network.authority.issueOffer(input, actualEnv as any)).rejects.toThrow();
    }
    expect(publicFetch).not.toHaveBeenCalled();
  });
  it("exposes named-seat authority and a signed effect receiver", () => {
    const network = membershipNetwork(() => ({ secrets: { get: async () => "synthetic-authority-edge-secret" } } as any));
    expect(network.authority.namedSeats).toBeDefined();
    expect(typeof network.route).toBe("function");
  });
});
