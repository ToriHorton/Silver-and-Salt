import { createChapterIntegration } from "@odla-ai/chapter";
import { chapter } from "./src/chapter.config.mjs";
import { schema as legacySourceSchema } from "./src/odla/schema.mjs";

const denyAll = {
  view: "false",
  create: "false",
  update: "false",
  delete: "false",
};

// The public newsletter route is retired, but the development tenant still
// contains rows in this strict namespace. Keep the data queryable only through
// operator tooling until a separately reviewed export/retention decision is
// made; this descriptor deliberately has no route, seed, or smoke probe.
const retainedNewsletterData = {
  id: "retained-newsletter-data",
  title: "Retained newsletter data",
  npm: "silver-and-salt-capital",
  schema: {
    entities: {
      newsletterSignups: legacySourceSchema.entities.newsletterSignups,
    },
    links: {},
  },
  rules: {
    newsletterSignups: denyAll,
  },
  seeds: [],
  probes: [],
};

const baseChapterIntegration = createChapterIntegration(chapter);

// These attributes predate managed Chapter tiers. They may contain historical
// development data, so strict provisioning must retain their exact definitions.
// They are schema-only compatibility fields: Chapter routes do not read them,
// the public field contract does not expose them, and all namespace rules stay
// deny-all. New membership decisions use tiers/tierId instead.
const activeChapterIntegration = {
  ...baseChapterIntegration,
  schema: {
    ...baseChapterIntegration.schema,
    entities: {
      ...baseChapterIntegration.schema.entities,
      applications: {
        ...baseChapterIntegration.schema.entities.applications,
        attrs: {
          ...baseChapterIntegration.schema.entities.applications.attrs,
          tier: legacySourceSchema.entities.applications.attrs.tier,
        },
      },
      groups: {
        ...baseChapterIntegration.schema.entities.groups,
        attrs: {
          ...baseChapterIntegration.schema.entities.groups.attrs,
          stewardPriceCents: legacySourceSchema.entities.groups.attrs.stewardPriceCents,
          stripeStewardPriceId: legacySourceSchema.entities.groups.attrs.stripeStewardPriceId,
          stewardTrustCopy: legacySourceSchema.entities.groups.attrs.stewardTrustCopy,
          stewardRefundPolicyText:
            legacySourceSchema.entities.groups.attrs.stewardRefundPolicyText,
        },
      },
    },
  },
};

export default {
  platformUrl: process.env.ODLA_PLATFORM_URL ?? "https://odla.ai",
  dbEndpoint: process.env.ODLA_ENDPOINT ?? process.env.ODLA_DB_ENDPOINT ?? "https://db.odla.ai",
  app: {
    id: "silver-and-salt-capital",
    name: "Silver & Salt Capital",
  },
  // Production is managed by this config only when the operator opts in for
  // that invocation: `ODLA_PROVISION_PROD=1 ODLA_ENV=prod npx @odla-ai/cli
  // provision --live --dry-run` (then `--yes --push-secrets`). Ordinary runs
  // touch the sandbox only. Note the odla registry already holds a prod
  // environment for this app (verified 2026-09-14); a plan from dev-only
  // intent proposes disabling its services (bug 9f161705) and must never be
  // applied.
  envs: process.env.ODLA_PROVISION_PROD === "1" ? ["dev", "prod"] : ["dev"],
  services: ["db", "calendar"],
  // Cory and Tori intentionally run separate authoritative development
  // Workers against the same Chapter data environment. Provider-facing
  // receipts and secrets remain runtime-scoped; neither sandbox is a replica
  // or a fallback for the other.
  runtimes: {
    cory: {
      dataEnvironment: "dev",
      wranglerEnvironment: "dev",
      origin: "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev",
    },
    tori: {
      dataEnvironment: "dev",
      wranglerEnvironment: "dev",
      origin: "https://silver-and-salt-capital-dev.silver-and-salt.workers.dev",
    },
  },
  stripe: {
    webhookPath: "/api/webhooks/stripe",
    // Preserve the complete deployed billing contract during reconciliation.
    // The CLI's legacy defaults omit paid-invoice and renewal-failure events.
    enabledEvents: [
      "charge.refunded",
      "customer.subscription.deleted",
      "customer.subscription.updated",
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.payment_succeeded",
      "payment_intent.canceled",
      "payment_intent.succeeded",
    ],
  },
  // Chapter composes the active membership and CRM namespaces, default-deny
  // rules, insert-only seeds, and managed founding tier. The second descriptor
  // retains a populated, retired namespace without restoring its public route.
  integrations: [activeChapterIntegration, retainedNewsletterData],
  calendar: {
    google: {
      // 0.2.0 live booking: FreeBusy availability over these calendars;
      // bookings land on the first one. (CLI 0.11.2 still validates the
      // legacy key name `calendars`; `availabilityCalendars` is the 0.2.0
      // name.) Our odla-db is the source of truth for meetings; Google is
      // the invite/Meet projection.
      calendars: process.env.ODLA_PROVISION_PROD === "1"
        ? { dev: ["primary"], prod: ["primary"] }
        : { dev: ["primary"] },
    },
  },
  // ai: enabled at Phase 4 if the owner opts in. Leaving the block out keeps
  // smoke's config-vs-platform comparison honest (platform has ai "none").
  auth: {
    clerk: {
      // Publishable key (public by design). Clerk app "Silver & Salt Capital"
      // in the Built Not Found workspace, app_3G6TCBtJKVZo6Aq5UGgz9URtDqV,
      // dev instance.
      dev: "pk_test_cmVsaWV2ZWQtZWZ0LTkzLmNsZXJrLmFjY291bnRzLmRldiQ",
      // The Production instance of the SAME Clerk app, activated with
      // `npx clerk deploy` against silverandsaltcapital.com (launch Phase
      // 4a). No fallback on purpose: provisioning production without the
      // live key must fail, never silently reuse the dev instance (which is
      // what the registry holds today).
      ...(process.env.CLERK_PUBLISHABLE_KEY_PROD ? { prod: process.env.CLERK_PUBLISHABLE_KEY_PROD } : {}),
    },
  },
  // Add "o11y" to services to enable observability; provision then mints the
  // ingest token and scaffolds the ODLA_O11Y_* vars into .dev.vars.
  // o11y: {
  //   service: "silver-and-salt-capital",   // defaults to the app id
  //   // endpoint: "https://o11y.odla.ai",
  // },
  links: {
    // Copied from the Phase 1 `wrangler deploy --env dev` output and
    // curl-verified 200 before pasting (per runbook: never predict this URL).
    dev: "https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev",
    // The public domain, served by the Worker on Tori's Cloudflare account.
    prod: "https://silverandsaltcapital.com",
  },
  local: {
    tokenFile: ".odla/dev-token.json",
    credentialsFile: ".odla/credentials.local.json",
    devVarsFile: ".dev.vars",
  },
};
