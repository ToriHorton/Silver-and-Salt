export default {
  platformUrl: process.env.ODLA_PLATFORM_URL ?? "https://odla.ai",
  dbEndpoint: process.env.ODLA_ENDPOINT ?? process.env.ODLA_DB_ENDPOINT ?? "https://db.odla.ai",
  app: {
    id: "silver-and-salt-capital",
    name: "Silver & Salt Capital",
  },
  envs: ["dev"],
  services: ["db", "calendar"],
  calendar: {
    google: {
      // The owner's calendar hosting the appointment schedule. Read-only
      // mirror into $bookings; refine ids after `calendar calendars`.
      calendars: { dev: ["primary"] },
      // Primary is a general calendar: mirror only self-organized events
      // with attendees (appointment bookings), not unrelated meetings.
      match: { organizerSelf: true, requireAttendees: true },
      // Attendee emails are required to correlate bookings to applications
      // (owner reviews retention at the checkpoint).
      attendeePolicy: "full",
      // The existing public Appointment Schedule embed, preserved as the
      // booking UI (public configuration, not a secret).
      bookingPageUrl: {
        dev: "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1_9O59IJaGAZWnM6duwcPuqluoIu3ui_NMCu5iRHiJT_CRC9xjcoKWwMSG_9Zaxz1kQAMRU4A0?gv=true",
      },
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
