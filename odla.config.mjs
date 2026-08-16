import { createChapterIntegration } from "@odla-ai/chapter";
import { chapter } from "./src/chapter.config.mjs";

export default {
  platformUrl: process.env.ODLA_PLATFORM_URL ?? "https://odla.ai",
  dbEndpoint: process.env.ODLA_ENDPOINT ?? process.env.ODLA_DB_ENDPOINT ?? "https://db.odla.ai",
  app: {
    id: "silver-and-salt-capital",
    name: "Silver & Salt Capital",
  },
  // Phase 5 live infrastructure is explicit, but DNS remains on GitHub Pages
  // until the remaining provider and browser cutover gates pass.
  envs: ["dev", "prod"],
  // Sourced from the resolved chapter so the descriptor and the Worker cannot
  // disagree about which services exist.
  services: chapter.services,
  // The single Chapter integration composes BOTH the chapter operational
  // namespaces (applications, groups, meetings, emailLog, superAdmins) and the
  // eight crm_* namespaces, with deny-all rules and insert-only seeds for the
  // groups row and the crm_config singleton.
  //
  // The legacy inline `db.schema`/`db.rules` pair and the separate
  // createCrmIntegration() call were REMOVED here rather than kept alongside:
  // provisioning both would declare the same namespaces twice. The legacy
  // schema and rules survive as frozen parity fixtures under tests/fixtures/,
  // and tests/chapter-parity.test.mjs asserts this integration against them
  // (59 assertions, exact attribute-level parity on all 13 namespaces).
  integrations: [createChapterIntegration(chapter, { basePath: "/api/crm" })],
  calendar: {
    google: {
      // Live booking checks FreeBusy across these calendars and writes to the
      // explicit booking calendar. Our odla-db remains the source of truth for
      // meetings; Google is the invite and Meet projection.
      availabilityCalendars: { dev: ["primary"], prod: ["primary"] },
      bookingCalendar: { dev: "primary", prod: "primary" },
    },
  },
  // No inline `db.schema`/`db.rules`: the Chapter integration above declares
  // every namespace. Declaring them here as well would provision the same
  // namespaces twice. src/odla/schema.mjs and src/odla/rules.mjs are retained
  // in the tree as the legacy parity reference only; nothing provisions them.
  db: {
    defaultRules: "deny",
  },
  // ai: enabled at Phase 4 if the owner opts in. Leaving the block out keeps
  // smoke's config-vs-platform comparison honest (platform has ai "none").
  auth: {
    clerk: {
      // Publishable key (public by design). Clerk app "Silver & Salt Capital"
      // in the Built Not Found workspace, app_3G6TCBtJKVZo6Aq5UGgz9URtDqV,
      // with one dev and one production instance. The live odla tenant uses
      // the dev Clerk instance while it is hosted on Cloudflare's workers.dev
      // preview domain. Cutover replaces prod with the pk_live key coupled to
      // silverandsaltcapital.com.
      dev: "pk_test_cmVsaWV2ZWQtZWZ0LTkzLmNsZXJrLmFjY291bnRzLmRldiQ",
      prod: "pk_test_cmVsaWV2ZWQtZWZ0LTkzLmNsZXJrLmFjY291bnRzLmRldiQ",
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
    // Captured from the first top-level Wrangler deploy and curl-verified.
    // DNS remains on GitHub Pages until the explicit cutover checkpoint.
    prod: "https://silver-and-salt-capital.cory-ondrejka.workers.dev",
  },
  local: {
    tokenFile: ".odla/dev-token.json",
    credentialsFile: ".odla/credentials.local.json",
    devVarsFile: ".dev.vars",
  },
};
