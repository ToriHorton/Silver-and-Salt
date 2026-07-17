import { createCrmIntegration } from "@odla-ai/crm";
import { crm } from "./src/crm.mjs";

export default {
  platformUrl: process.env.ODLA_PLATFORM_URL ?? "https://odla.ai",
  dbEndpoint: process.env.ODLA_ENDPOINT ?? process.env.ODLA_DB_ENDPOINT ?? "https://db.odla.ai",
  app: {
    id: "silver-and-salt-capital",
    name: "Silver & Salt Capital",
  },
  envs: ["dev"],
  services: ["db", "calendar"],
  // The CRM admin layer (@odla-ai/crm). `provision` collision-checks and
  // merges its eight crm_* namespaces + deny-all rules alongside the app
  // schema, and seeds the crm_config singleton once (preserving later owner
  // edits). Routes are mounted in src/worker.ts; see src/crm.mjs for the model.
  // Dev addresses match the group row so CRM dev mail lands in the same inbox.
  integrations: [
    createCrmIntegration(crm, {
      basePath: "/api/crm",
      notificationEmail: "cory.ondrejka+debug@gmail.com",
      replyTo: "cory.ondrejka+debug@gmail.com",
      debugEmail: "cory.ondrejka+debug@gmail.com",
    }),
  ],
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
  db: {
    schema: "./src/odla/schema.mjs",
    rules: "./src/odla/rules.mjs",
    // When rules is omitted, the CLI generates deny-all rules from schema.
    defaultRules: "deny",
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
