// One table of every deployment this Worker may run as, keyed by the data
// environment and the account-bound runtime. Every module that used to pin a
// dev origin or tenant literal resolves through here instead, so production
// is a row in a table rather than a fork of the code.
//
// Fail closed: an env whose ODLA_* vars do not match a row exactly throws.
// Nothing infers a runtime from a shared data environment.

export type EnvName = "dev" | "prod";

export interface Deployment {
  envName: EnvName;
  tenant: string;
  runtime: string;
  /** This Worker's own public origin (signing target for inbound effects). */
  origin: string;
  /** The Built Not Found authority this chapter talks to. */
  authorityOrigin: string;
  /** Vault secret carrying the per-runtime membership authority edge. */
  membershipSecretName: string;
  /** Vault secret carrying the per-runtime signup-control edge. */
  signupSecretName: string;
  stripeMode: "test" | "live";
}

export const APP_ID = "silver-and-salt-capital";
const SECRET_STEM = APP_ID.replaceAll("-", "_");

const RUNTIMES: Record<EnvName, Record<string, { origin: string; authorityOrigin: string }>> = {
  dev: {
    cory: {
      origin: "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev",
      authorityOrigin: "https://built-not-found-dev.cory-ondrejka.workers.dev",
    },
    tori: {
      origin: "https://silver-and-salt-capital-dev.silver-and-salt.workers.dev",
      authorityOrigin: "https://built-not-found-dev.cory-ondrejka.workers.dev",
    },
  },
  prod: {
    // The public domain is the origin even when a candidate runs on a
    // staging Worker: staging shares the prod identity and is never given
    // triggers, so it only ever reads.
    live: {
      origin: "https://silverandsaltcapital.com",
      authorityOrigin: "https://builtnotfoundcapital.com",
    },
  },
};

const TENANTS: Record<EnvName, string> = {
  dev: `${APP_ID}--dev`,
  prod: APP_ID,
};

export const STRIPE_MODES: Record<EnvName, "test" | "live"> = { dev: "test", prod: "live" };

export function membershipSecretName(runtime: string): string {
  return `membership_authority_${SECRET_STEM}_${runtime}`;
}

export function signupSecretName(runtime: string): string {
  return `signup_control_${SECRET_STEM}__${runtime}`;
}

export function runtimesFor(envName: EnvName): string[] {
  return Object.keys(RUNTIMES[envName]);
}

/** "prod" only for the literal production data environment; everything else is dev. */
export function envNameOf(env: { ODLA_ENV?: unknown }): EnvName {
  return env.ODLA_ENV === "prod" ? "prod" : "dev";
}

type DeployEnv = {
  ODLA_APP_ID?: unknown;
  ODLA_TENANT?: unknown;
  ODLA_ENV?: unknown;
  ODLA_RUNTIME?: unknown;
  ODLA_ENDPOINT?: unknown;
};

export function resolveDeployment(env: DeployEnv): Deployment {
  const envName = env.ODLA_ENV;
  if (envName !== "dev" && envName !== "prod") {
    throw new Error(`deployment scope mismatch: ODLA_ENV must be dev or prod, got ${String(envName)}`);
  }
  const runtime = typeof env.ODLA_RUNTIME === "string" ? env.ODLA_RUNTIME : "";
  const row = RUNTIMES[envName][runtime];
  if (
    env.ODLA_APP_ID !== APP_ID ||
    env.ODLA_TENANT !== TENANTS[envName] ||
    env.ODLA_ENDPOINT !== "https://db.odla.ai" ||
    !row
  ) {
    throw new Error("deployment scope mismatch: app, tenant, endpoint and runtime must name one configured deployment");
  }
  return {
    envName,
    tenant: TENANTS[envName],
    runtime,
    origin: row.origin,
    authorityOrigin: row.authorityOrigin,
    membershipSecretName: membershipSecretName(runtime),
    signupSecretName: signupSecretName(runtime),
    stripeMode: STRIPE_MODES[envName],
  };
}
