---
name: odla
description: >
  Build a new app on odla — a realtime database (odla-db) plus AI, Clerk auth,
  read-only Google Calendar mirrors, and observability on Cloudflare, provisioned by @odla-ai/cli. Use when the user
  wants to create/scaffold an odla app, add odla-db/ai/auth/o11y to a repo, or
  "get started with odla". For moving an existing static or GitHub Pages site to
  odla, use the odla-migrate skill instead.
runbookOrder:
  - references/build.md
  - references/sdks.md
---

# odla

You drive setup and building on **odla** — an agent-operable app platform on
Cloudflare: a realtime graph database (**odla-db**), multi-provider **AI**,
**Clerk** auth, read-only **Google Calendar** mirrors, and OpenTelemetry **observability**, all provisioned by the
`@odla-ai/cli`. The human approves a couple of browser-only checkpoints; you do
everything else.

## First: orient (one line, then confirm)

Look at the repo before scaffolding:

- **An existing site to move** (a built static / GitHub Pages site with its own
  domain) → **stop and use the `odla-migrate` skill** — it keeps the old site
  live and cuts over safely. This skill is for new apps.
- **Greenfield, or adding a backend** (empty repo, or an app that just needs
  data / auth / AI) → continue here.

State which path you're taking and what you'll build in one line; get a nod.

## Non-negotiable rules

1. **Never print, paste, or commit a secret.** Never `cat` `.dev.vars`,
   `.odla/credentials.local.json`, or `.odla/dev-token.json` — use `ls -l` to
   confirm they exist (and are `0600`). The only value a human ever pastes is a
   Clerk **publishable** key (`pk_…`) — public by design.
   A fresh odla device request also needs the existing account email via
   `--email` or `ODLA_USER_EMAIL`; email is a non-secret identifier. Never ask
   for an odla password, Clerk token, or browser session.
2. **Dev before prod.** Keep `envs: ["dev"]` and verify the tenant
   (`<appId>--dev`) before any write or deploy. Add `prod` only at the explicit
   production checkpoint. The first prod
   `provision --dry-run` review, `provision --yes --push-secrets`, and deploy
   are human checkpoints.
3. **Rules are default-deny.** A namespace with no rule is invisible; a write
   with no rule is rejected. Never widen a rule just to clear a 403 — edit
   `src/odla/rules.mjs` deliberately, and flag rule changes to the human.
4. Never `git add -A` without reading `git status` first. Never run
   `provision --rotate-keys` or `provision --rotate-o11y-token` unless the human
   explicitly asks.
5. Google OAuth is a distinct human checkpoint. Never request, paste, print, or
   store a Google authorization code/refresh token. Open only the state-bound
   platform/Google consent URL returned by odla; calendar actions remain unavailable in the read-only slice.

## Tooling sources

- **odla**: this skill plus the installed `@odla-ai/*` packages are the
  complete, offline contract (README + exported declarations/JSDoc, rendered
  at `https://odla.ai/docs/packages/<pkg>`). Never reconstruct odla behavior
  from the web or training memory.
- **Third-party tools (wrangler, Clerk) — the reverse**: their CLIs and config
  formats evolve, so never work from memorized setup steps. When you reach a
  wrangler or Clerk step, fetch the vendor's current agent docs and follow
  those:
  - Cloudflare: docs index `https://developers.cloudflare.com/llms.txt`; every
    docs page has a markdown twin at `<page>/index.md` (wrangler config:
    `https://developers.cloudflare.com/workers/wrangler/configuration/index.md`).
    With the human's OK (it edits global agent config), you may also follow
    `https://developers.cloudflare.com/agent-setup/prompt.md` to add
    Cloudflare's own skills + MCP servers to your harness.
  - Clerk: agent-first CLI setup `https://clerk.com/docs/cli.md`; docs index
    `https://clerk.com/docs/llms.txt`.

  Offline? Say so, continue with the vendor steps written in these references,
  and flag that they may be stale.

## The flow

You reached this skill because the human ran `npx @odla-ai/cli setup`. Then:

First run `npx @odla-ai/cli capabilities --json`; use that contract instead of
guessing which platform/credential steps need manual work. Then:

1. **init** — `npx @odla-ai/cli init --app-id <id> --name "<Name>"` scaffolds
   `odla.config.mjs`, `src/odla/schema.mjs`, `src/odla/rules.mjs` (deny-all).
2. **build the Worker shell** — install the SDKs, write the app, and create its
   Wrangler config (`references/sdks.md`). With o11y, add `nodejs_compat` and
   `withObservability`. The CLI will refuse secret delivery until the Wrangler
   target exists.
3. **provision** ⏸ —
   `npx @odla-ai/cli provision --email <existing-odla-account>
   --write-dev-vars --push-secrets`. A device code prints; that same account
   signs in, reviews the exact code, and approves it at https://odla.ai/studio.
   Opening the link alone is inert. It creates the app,
   enables services, issues or reuses configured credentials (db key + o11y
   ingest token when enabled), pushes schema + rules, writes `.dev.vars`, and
   transfers Worker secrets through Wrangler stdin. With calendar enabled it
   then prints a second, server-issued Google URL; the human grants read-only consent
   and the CLI follows initial sync.
4. **run** — `npx wrangler dev` (auto-loads `.dev.vars`); verify locally.
5. **security** — run the passive `@odla-ai/security` odla profile; inspect
   every lead and keep critical candidate gating enabled. If the human approves
   redacted source disclosure, follow with
   `npx @odla-ai/cli security run . --env dev --ack-redacted-source` for
   app-attributed discovery + independent validation. Never request provider
   keys; the platform selects the routes and returns bounded role grants. For
   repeatable server-side review, run `security github connect --env dev`
   (human approves source-read-only GitHub access), `security plan --env dev`,
   `security sources --env dev`, then `security run --source <id> --ref <ref>
   --env dev --plan-digest <digest-from-security-plan>
   --ack-redacted-source`.
   The source job follows, reports, and gates by default. Never request a PAT or
   treat GitHub read approval as redacted-snippet disclosure consent.
6. **ship** ⏸ — after adding `prod`, run `npx @odla-ai/cli provision --dry-run`,
   show the human, then `npx @odla-ai/cli provision --yes --push-secrets` and
   `npx wrangler deploy`.

`npx @odla-ai/cli doctor` is an offline config check anytime;
`npx @odla-ai/cli smoke --env dev` verifies a live deployment.
Use `calendar status --json` for safe connection/sync state and `calendar
calendars --json` to discover ids after consent; update checked-in config and
re-provision. Resync production only with `--yes`; disconnect always requires
`--yes` and leaves retained rows potentially stale.

The CLI owns deterministic platform work from `odla.config.mjs`: service
enablement, credential issuance/storage, `.dev.vars`, and Wrangler secret
transfer. You own source changes — install `@odla-ai/o11y`, add
`withObservability`, create the Wrangler config, and choose application-specific
signals. The human owns device approval, production consent, and explicit
destructive rotation. If an
o11y token must be replaced, use
`provision --rotate-o11y-token --push-secrets` so the cached and deployed values
move together; Studio rotation is manual recovery only.

## Checkpoint protocol

At each ⏸ (provision approval, first prod deploy), give the human a 3-line
summary — what changed / what you verified / what they must do next (approve a
code, paste a publishable key, run a command) — and wait for a nod.

## References

- `references/build.md` — the greenfield build, step by step, with the exact
  commands and what to verify at each one.
- `references/sdks.md` — SDK cheat-sheet (what each does + minimal real usage).
  For the full, version-matched API, read the installed package's README and
  exported TypeScript declarations/JSDoc (resolve entry points through its
  `package.json` `exports`). Rendered references are also public at
  `https://odla.ai/docs/packages/<pkg>`.
