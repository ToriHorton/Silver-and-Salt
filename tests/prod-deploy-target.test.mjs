// The production deploy pre-flight (_scripts/assert-prod-deploy-target.mjs).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PROD_ACCOUNT_ID, assertProdDeployAccount, assertProdDeployBindings, assertProdWranglerConfig,
} from "../_scripts/assert-prod-deploy-target.mjs";

const identity = (accounts, loggedIn = true) => JSON.stringify({ loggedIn, accounts });

describe("assertProdDeployAccount", () => {
  it("accepts exactly one account, the one that serves the domain", () => {
    expect(assertProdDeployAccount(identity([{ id: PROD_ACCOUNT_ID, name: "Tori" }]))).toEqual({ account: PROD_ACCOUNT_ID });
  });
  it("refuses signed-out, ambiguous, and foreign accounts", () => {
    expect(() => assertProdDeployAccount(identity([], false))).toThrow(/not signed in/);
    expect(() => assertProdDeployAccount(identity([{ id: PROD_ACCOUNT_ID }, { id: "c4f7c2b79a8ec203b50e1e36790ef038" }]))).toThrow(/exactly one/);
    expect(() => assertProdDeployAccount(identity([{ id: "c4f7c2b79a8ec203b50e1e36790ef038" }]))).toThrow(/does not serve/);
    expect(() => assertProdDeployAccount("nope")).toThrow(/JSON/);
  });
});

describe("assertProdDeployBindings", () => {
  it("requires the tenant key by name and reads no values", () => {
    expect(assertProdDeployBindings(JSON.stringify([{ name: "ODLA_API_KEY", type: "secret_text" }, { name: "SALES_STOP", type: "secret_text" }])))
      .toEqual({ names: ["ODLA_API_KEY", "SALES_STOP"] });
    expect(() => assertProdDeployBindings("[]")).toThrow(/missing secret/);
    expect(() => assertProdDeployBindings("{}")).toThrow(/list/);
  });
});

describe("assertProdWranglerConfig", () => {
  const real = readFileSync("wrangler.jsonc", "utf8");
  it("accepts the checked-in production configuration", () => {
    expect(assertProdWranglerConfig(real)).toEqual({ name: "silver-and-salt-capital" });
  });
  it("refuses sales open by default, a dev tenant, or a routed environment", () => {
    expect(() => assertProdWranglerConfig(real.replace('"MEMBERSHIP_AUTHORITY_OWNER": "built-not-found",\n    // SALES_STATE', '"MEMBERSHIP_AUTHORITY_OWNER": "built-not-found",\n    "SALES_STATE": "public",\n    // SALES_STATE'))).toThrow(/SALES_STATE/);
    expect(() => assertProdWranglerConfig(real.replace('"ODLA_TENANT": "silver-and-salt-capital",', '"ODLA_TENANT": "silver-and-salt-capital--dev",'))).toThrow(/ODLA_TENANT/);
    expect(() => assertProdWranglerConfig(real.replace('"routes": [],\n      // No triggers', '"routes": ["silverandsaltcapital.com/*"],\n      // No triggers'))).toThrow(/routes/);
    expect(() => assertProdWranglerConfig(real.replace('"crons": []', '"crons": ["*/5 * * * *"]'))).toThrow(/staging/);
  });
});
