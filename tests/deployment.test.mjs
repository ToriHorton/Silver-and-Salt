// The deployment table (src/deployment.ts) and the per-environment chapter
// configuration (src/chapter.config.mjs). Production is a row, not a fork.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  APP_ID, envNameOf, membershipSecretName, resolveDeployment, runtimesFor, signupSecretName,
} from "../src/deployment.ts";
import { ENVIRONMENTS, chapterFor } from "../src/chapter.config.mjs";
import { approvalRecoveryOrigin } from "../src/approval-recovery.ts";

const base = { ODLA_APP_ID: APP_ID, ODLA_ENDPOINT: "https://db.odla.ai" };
const prod = { ...base, ODLA_TENANT: "silver-and-salt-capital", ODLA_ENV: "prod", ODLA_RUNTIME: "live" };
const cory = { ...base, ODLA_TENANT: "silver-and-salt-capital--dev", ODLA_ENV: "dev", ODLA_RUNTIME: "cory" };
const tori = { ...cory, ODLA_RUNTIME: "tori" };

describe("resolveDeployment", () => {
  it("resolves production to the public domain and the live authority", () => {
    const d = resolveDeployment(prod);
    expect(d).toMatchObject({
      envName: "prod", tenant: "silver-and-salt-capital", runtime: "live", stripeMode: "live",
      origin: "https://silverandsaltcapital.com", authorityOrigin: "https://builtnotfoundcapital.com",
      membershipSecretName: "membership_authority_silver_and_salt_capital_live",
      signupSecretName: "signup_control_silver_and_salt_capital__live",
    });
  });
  it("keeps both developer runtimes on the shared dev tenant with their own origins", () => {
    expect(resolveDeployment(cory).origin).toBe("https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev");
    expect(resolveDeployment(tori).origin).toBe("https://silver-and-salt-capital-dev.silver-and-salt.workers.dev");
    expect(resolveDeployment(cory).stripeMode).toBe("test");
    expect(runtimesFor("dev")).toEqual(["cory", "tori"]);
    expect(runtimesFor("prod")).toEqual(["live"]);
  });
  it("fails closed on any mismatch instead of guessing", () => {
    expect(() => resolveDeployment({ ...prod, ODLA_TENANT: "silver-and-salt-capital--dev" })).toThrow(/scope mismatch/);
    expect(() => resolveDeployment({ ...prod, ODLA_RUNTIME: "cory" })).toThrow(/scope mismatch/);
    expect(() => resolveDeployment({ ...prod, ODLA_RUNTIME: undefined })).toThrow(/scope mismatch/);
    expect(() => resolveDeployment({ ...cory, ODLA_RUNTIME: "live" })).toThrow(/scope mismatch/);
    expect(() => resolveDeployment({ ...prod, ODLA_ENV: "production" })).toThrow(/dev or prod/);
    expect(() => resolveDeployment({ ...prod, ODLA_ENDPOINT: "https://elsewhere" })).toThrow(/scope mismatch/);
    expect(() => resolveDeployment({ ...prod, ODLA_APP_ID: "the-tidal-collective" })).toThrow(/scope mismatch/);
  });
  it("names secrets per runtime", () => {
    expect(membershipSecretName("cory")).toBe("membership_authority_silver_and_salt_capital_cory");
    expect(signupSecretName("tori")).toBe("signup_control_silver_and_salt_capital__tori");
  });
  it("treats only the literal prod as production", () => {
    expect(envNameOf({ ODLA_ENV: "prod" })).toBe("prod");
    expect(envNameOf({ ODLA_ENV: "production" })).toBe("dev");
    expect(envNameOf({})).toBe("dev");
  });
  it("approval recovery signs for the deployment's own origin", () => {
    expect(approvalRecoveryOrigin(prod)).toBe("https://silverandsaltcapital.com");
    expect(approvalRecoveryOrigin(tori)).toBe("https://silver-and-salt-capital-dev.silver-and-salt.workers.dev");
    expect(() => approvalRecoveryOrigin({ ...prod, ODLA_RUNTIME: "cory" })).toThrow();
  });
});

describe("chapterFor", () => {
  // defineChapter keeps the reviewed input under `config` and materializes
  // the seeded group row as `groupSeed`; both are what provisioning writes.
  it("production carries live Stripe mode, real addressing, the domain, and no seeded tier", () => {
    const c = chapterFor("prod");
    expect(c.url).toBe("https://silverandsaltcapital.com");
    expect(c.signupControl).toMatchObject({ sourceId: "built-not-found", stripeMode: "live" });
    expect(Object.keys(c.signupControl.runtimeSecrets)).toEqual(["live"]);
    expect(c.config.emails).toEqual({
      notificationEmail: "tori@silverandsaltcapital.com",
      replyTo: "tori@silverandsaltcapital.com",
    });
    expect(JSON.stringify(c)).not.toContain("+debug");
    expect(c.config.tiers).toEqual([]);
    expect(JSON.stringify(c)).not.toContain("price_1Ts7rW3sLwQtiao1DTAj0iS0");
  });
  it("development is unchanged from the reviewed dev configuration", () => {
    const c = chapterFor("dev");
    expect(c.url).toBe("https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev");
    expect(c.signupControl.stripeMode).toBe("test");
    expect(Object.keys(c.signupControl.runtimeSecrets)).toEqual(["cory", "tori"]);
    expect(c.config.emails.debugEmail).toBe("cory.ondrejka+debug@gmail.com");
    expect(c.config.tiers).toHaveLength(1);
  });
  it("shares everything else between environments", () => {
    const strip = (c) => {
      const { url, signupControl, groupSeed, config, ...rest } = c;
      const { url: u, emails, tiers, signupControl: sc, ...sharedConfig } = config;
      return { rest, sharedConfig };
    };
    expect(strip(chapterFor("prod"))).toEqual(strip(chapterFor("dev")));
    expect(Object.keys(ENVIRONMENTS).sort()).toEqual(["dev", "prod"]);
  });
  it("refuses an unknown environment", () => {
    expect(() => chapterFor("production")).toThrow(/no chapter configuration/);
  });
});

describe("wrangler deployments", () => {
  const text = readFileSync("wrangler.jsonc", "utf8");
  it("production carries no committed sales state; staging is disabled; only the dev rehearsal is public", () => {
    const states = [...text.matchAll(/"SALES_STATE":\s*"(\w+)"/g)].map((m) => m[1]);
    expect(states).toEqual(["disabled", "public"]);
    const top = text.slice(0, text.indexOf('"env": {'));
    expect(top).not.toMatch(/"SALES_STATE":/);
  });
  it("staging is the production identity with no domain and no triggers", () => {
    const staging = text.slice(text.indexOf('"staging"'), text.indexOf('"dev": {'));
    expect(staging).toContain('"name": "silver-and-salt-capital-staging"');
    expect(staging).toContain('"routes": []');
    expect(staging).toContain('"crons": []');
    expect(staging).toContain('"ODLA_ENV": "prod"');
    expect(staging).toContain('"ODLA_RUNTIME": "live"');
  });
});
