# Phase 2 — Database (dev tenant only)

Goal: the app registered on the platform, a dev odla-db tenant with
schema + deny-all rules, the db key in the dev worker, and first
`/api/*` routes live in dev.

Human obligation: provide the existing odla account email (not a password or
session credential), sign in at https://odla.ai/studio, explicitly review the
exact handshake code, and approve it. The provision run prints the code and
opens the review page in interactive terminals; loading it alone is inert.

## Steps

1. Require `npm view @odla-ai/cli version` to succeed, then run
   `npm i -D @odla-ai/cli` and `npm i @odla-ai/db`. Use normal dependency
   declarations while ODLA is under active development, commit the lockfile,
   and record the resolved graph from
   `npm ls @odla-ai/cli @odla-ai/db` in PM.
2. `npx @odla-ai/cli init --app-id <id> --name "<Name>" --env dev --services db`
   Review `odla.config.mjs`. Keep `envs: ["dev"]` — prod is Phase 5. Set
   `links.dev` to the URL the Phase 1 `wrangler deploy` **actually printed** —
   copy it from that output and `curl` it (200) before pasting. NEVER predict or
   remember a workers.dev URL; the worker name and account subdomain must match
   exactly or Studio links to a dead URL. Provision records it so Studio and
   public-config show where the app runs. (`links.prod` is set the same way at
   Phase 5, from the prod deploy's printed URL.)
3. STOP before touching schema: read "Porting relational code" in
   `node_modules/@odla-ai/db/README.md`. The traps are silent: entity ids
   are not attrs (mirror an id attr), there is no NULL (omit on write,
   re-project on read), lists need explicit `order`, uniques are
   single-attr (derive composite keys), ON CONFLICT maps to `mutationId`
   dedupe.
4. **Membership site? Go to `phase-2-chapter.md` before writing any
   schema.** If the app has applications/join, paid membership, booked
   intro calls, a member area, an admin console or a people CRM, then
   `defineChapter()` from `@odla-ai/chapter` GENERATES the schema, the
   deny-all rules, the seed row and the provisioning integration. Hand-
   authoring them here is exactly the work that package exists to delete
   (a real conversion cut ~2,500 lines). Use chapter for what it models;
   hand-author only the namespaces it does not.

   Otherwise, write `src/odla/schema.mjs` for the app's entities. KEEP the
   generated deny-all `src/odla/rules.mjs`: the worker mediates all
   access with its app key (which bypasses rules); browsers get nothing
   directly. Loosening a rule is a human checkpoint.
5. `npx @odla-ai/cli doctor` until clean.
6. `npx @odla-ai/cli provision --dry-run` — show the plan to the human.
7. `npx @odla-ai/cli provision --email <existing-odla-account>
   --write-dev-vars --push-secrets` — handshake,
   app registration, dev db key, schema + rules push; writes
   `.odla/credentials.local.json` (0600) and `.dev.vars`, then pipes configured
   Worker secrets to Wrangler over stdin. Both local files are gitignored by
   init — confirm with `git status`. Use
   `npx @odla-ai/cli secrets push --env dev` only to retry the secret-transfer
   portion (details and manual fallback: references/secrets-map.md).
8. The app now exists. Before further implementation, follow
   `project-state.md`: create the migration goals/tasks/decisions in PM,
   backfill the approved Phase 0/1 evidence, and read the resulting active
   task/goal before continuing.
9. Add to `wrangler.jsonc` `env.dev.vars`: `ODLA_ENDPOINT`
   ("https://db.odla.ai"), `ODLA_TENANT` ("<appId>--dev"),
   `ODLA_PLATFORM` ("https://odla.ai"), `ODLA_APP_ID`, `ODLA_ENV`
   ("dev"). Mirror at top level with tenant "<appId>" / env "prod" for
   Phase 5. These are vars, not secrets.
10. Add `/api/*` routes before the assets fall-through, using
    `init({ appId: env.ODLA_TENANT, adminToken: env.ODLA_API_KEY,
    endpoint: env.ODLA_ENDPOINT })` from `@odla-ai/db`. Read the installed
    package's README and exported TypeScript declarations/JSDoc for query,
    transaction, and error contracts. The rendered reference is at
    `https://odla.ai/docs/packages/db` when online.
11. `wrangler dev` + curl each route; then `npm run deploy:app:dev` and
    curl the workers.dev URL.

## Verification checklist

- [ ] `npx @odla-ai/cli smoke --env dev` passes (public-config, schema, aggregate)
- [ ] Routes work locally and on the deployed dev worker
- [ ] `links.dev` set — public-config carries the URL and Studio shows it
- [ ] `git status` shows no credential files staged
- [ ] PM initialized and Phase 0/1 evidence backfilled; Phase 2 route/tenant
      evidence attached to the active task without credentials

Rollback: the dev tenant is disposable; the live site never depended on
it. Pages untouched.

Done when: smoke passes, routes live in dev, human approves Phase 3
(their next obligation: a Clerk account + pasting a publishable key).
