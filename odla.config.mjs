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

export default {
  platformUrl: process.env.ODLA_PLATFORM_URL ?? "https://odla.ai",
  dbEndpoint: process.env.ODLA_ENDPOINT ?? process.env.ODLA_DB_ENDPOINT ?? "https://db.odla.ai",
  app: {
    id: "silver-and-salt-capital",
    name: "Silver & Salt Capital",
  },
  envs: ["dev"],
  services: ["db", "calendar"],
  // Chapter composes the active membership and CRM namespaces, default-deny
  // rules, insert-only seeds, and managed founding tier. The second descriptor
  // retains a populated, retired namespace without restoring its public route.
  integrations: [createChapterIntegration(chapter), retainedNewsletterData],
  calendar: {
    google: {
      // 0.2.0 live booking: FreeBusy availability over these calendars;
      // bookings land on the first one. (CLI 0.11.2 still validates the
      // legacy key name `calendars`; `availabilityCalendars` is the 0.2.0
      // name.) Our odla-db is the source of truth for meetings; Google is
      // the invite/Meet projection.
      calendars: { dev: ["primary"] },
    },
  },
  // ai: enabled at Phase 4 if the owner opts in. Leaving the block out keeps
  // smoke's config-vs-platform comparison honest (platform has ai "none").
  auth: {
    clerk: {
      // Publishable key (public by design). Clerk app "Silver & Salt Capital"
      // in the Built Not Found workspace, app_3G6TCBtJKVZo6Aq5UGgz9URtDqV,
      // dev instance. prod pk is set at Phase 5.
      dev: "pk_test_cmVsaWV2ZWQtZWZ0LTkzLmNsZXJrLmFjY291bnRzLmRldiQ",
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
    // prod is set at Phase 5 from the prod deploy's printed URL.
  },
  local: {
    tokenFile: ".odla/dev-token.json",
    credentialsFile: ".odla/credentials.local.json",
    devVarsFile: ".dev.vars",
  },
};
