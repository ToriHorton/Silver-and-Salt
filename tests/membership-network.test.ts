import { describe, it, expect, vi, afterEach } from "vitest";
import { membershipNetwork } from "../src/membership-network";
import { resolveDeployment } from "../src/deployment";

const appId = "silver-and-salt-capital";
const dev = { ODLA_APP_ID: appId, ODLA_TENANT: `${appId}--dev`, ODLA_ENV: "dev", ODLA_RUNTIME: "cory", ODLA_ENDPOINT: "https://db.odla.ai" };
const prod = { ODLA_APP_ID: appId, ODLA_TENANT: appId, ODLA_ENV: "prod", ODLA_RUNTIME: "live", ODLA_ENDPOINT: "https://db.odla.ai" };
const makeDb = () => ({ secrets: { get: async () => "synthetic-authority-edge-secret" } } as any);
afterEach(() => vi.restoreAllMocks());

describe("BNF membership integration", () => {
  it("rejects missing transport, wrong tenant, provider endpoint and sibling runtime with no public fallback", async () => {
    const publicFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("must not use public fetch"));
    const network = membershipNetwork(makeDb, resolveDeployment(dev));
    for (const delta of [{}, { ODLA_TENANT: "wrong--dev" }, { ODLA_RUNTIME: "tori" }, { ODLA_ENV: "prod" }, { ODLA_ENDPOINT: "https://wrong.invalid" }]) {
      const actualEnv = { ...dev, ...delta };
      const input = { appId, chapterId: appId, environment: actualEnv.ODLA_ENV, runtime: actualEnv.ODLA_RUNTIME, applicationId: "application_test", skuId: "standard", requestId: "request_test" };
      await expect(network.authority.issueOffer(input, actualEnv as any)).rejects.toThrow();
    }
    expect(publicFetch).not.toHaveBeenCalled();
  });
  it("a production adapter never serves a development env, and the reverse", async () => {
    const publicFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(Error("must not use public fetch"));
    const live = membershipNetwork(makeDb, resolveDeployment(prod));
    const input = { appId, chapterId: appId, environment: "dev", runtime: "cory", applicationId: "application_test", skuId: "standard", requestId: "request_test" };
    await expect(live.authority.issueOffer(input, dev as any)).rejects.toThrow();
    // Production with no BUILT_NOT_FOUND binding fails closed too.
    const prodInput = { ...input, environment: "prod", runtime: "live" };
    await expect(live.authority.issueOffer(prodInput, prod as any)).rejects.toThrow(/unavailable|mismatch/);
    expect(publicFetch).not.toHaveBeenCalled();
  });
  it("exposes named-seat authority and a signed effect receiver for every deployment", () => {
    for (const env of [dev, { ...dev, ODLA_RUNTIME: "tori" }, prod]) {
      const network = membershipNetwork(makeDb, resolveDeployment(env));
      expect(network.authority.namedSeats).toBeDefined();
      expect(typeof network.route).toBe("function");
    }
  });
});
