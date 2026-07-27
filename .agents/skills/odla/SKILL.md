---
name: odla
description: >
  Build a new app on odla — a realtime database (odla-db) plus AI, Clerk auth,
  live Google Calendar booking, and observability on Cloudflare, provisioned by @odla-ai/cli. Use when the user
  wants to create/scaffold an odla app, add odla-db/ai/auth/o11y to a repo, or
  "get started with odla". For moving an existing static or GitHub Pages site to
  odla, use the odla-migrate skill instead.
runbookOrder:
  - references/build.md
  - references/sdks.md
  - references/pm.md
  - references/co-owners.md
---

# odla

You drive setup and building on **odla** — an agent-operable app platform on
Cloudflare: a realtime graph database (**odla-db**), multi-provider **AI**,
**Clerk** auth, live **Google Calendar** booking, and OpenTelemetry **observability**, all provisioned by the
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
   **That is the human's odla ACCOUNT email — never infer it from `git config
   user.email`, `gh`, or a commit author.** A git identity is frequently a
   different address (a `+alias`, a `users.noreply.github.com`), and the
   registry matches the exact string. An address that is not a registered
   account does NOT error: it mints an indistinguishable decoy, so the CLI
   prints a normal approval URL that can never be approved by anyone. Ask the
   human, or reuse the address already in `.odla/handshake.local.json`.
2. **Sandbox before live.** Every app has two databases on production odla.ai:
   a sandbox (env `dev`, tenant `<appId>--dev`) and a live one (env `prod`,
   tenant `<appId>`). "prod" names the app's live DATABASE, never a different
   odla — there is only one odla.ai. Keep `envs: ["dev"]` and verify the tenant
   before any write or deploy. Add `prod` only at the explicit go-live
   checkpoint. That first live `provision --dry-run` review,
   `provision --yes --push-secrets`, and deploy are human checkpoints.
3. **Rules are default-deny.** A namespace with no rule is invisible; a write
   with no rule is rejected. Never widen a rule just to clear a 403 — edit
   `src/odla/rules.mjs` deliberately, and flag rule changes to the human.
4. Never `git add -A` without reading `git status` first. Never run
   `provision --rotate-keys` or `provision --rotate-o11y-token` unless the human
   explicitly asks.
5. Google OAuth is a distinct human checkpoint. Never request, paste, print, or
   store a Google authorization code/refresh token. Open only the state-bound
   platform/Google consent URL returned by odla; booking runs server-side
   through the SDK with the app's existing key, never from a browser.

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
   Opening the link alone is inert. Relay the printed approval URL to the
   human verbatim — the automatic browser launch is best-effort and may show
   no tab. Outside an interactive terminal the wait is capped (90s default,
   `--wait <seconds>`); exit code 75 means still pending: the handshake is
   persisted, so once the human approves, re-run the same command and it
   resumes the same code and collects the token. It creates the app,
   enables services, issues or reuses configured credentials (db key + o11y
   ingest token when enabled), composes declared integration schema/rules and
   guarded seeds, writes `.dev.vars`, and
   transfers Worker secrets through Wrangler stdin. With calendar enabled it
   then prints a second, server-issued Google URL; the human grants booking
   consent in a browser and the connection is immediately live — nothing
   syncs.
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

## Track the work in PM, as you go

odla has a project manager for agents — conformance goals, a kanban board, a
decision log, and bugs, shared with the human and with every other agent working
on the app. It is platform-side: there is nothing PM-specific to install or
provision. Start a session by reading it, and keep it current while you build:

```cmd
npx @odla-ai/cli pm task list --app <appId> --column doing
```

The app must already be registered for ownership-scoped PM access. On a new
project, use a focused commit/checkpoint only until the first provision, then
initialize PM and backfill the approved early evidence immediately. Across
several efforts, list without `--app` first, then scope every write to the exact
project id.

Record a **decision** the moment you make one (with what it rules out), file a
**bug** the moment you notice one, and move a **task** when the work moves. A
decision you don't record is one the next agent re-litigates. Full command set,
conventions, and the read-first session opener: `references/pm.md`.

## Operational runbooks live in the database, not in this bundle

This bundle covers **setup**, pinned to the CLI version you installed. Operational
procedures — releasing, backups, database and code-runtime operations — are stored
in odla and change without a CLI release. Read one at the moment you follow it:

```cmd
npx @odla-ai/cli runbook list
```

```cmd
npx @odla-ai/cli runbook get release
```

`runbook get` prints raw markdown, so pipe it or read it directly. Do not follow a
multi-step platform procedure from memory, and never scrape odla.ai for one — the
CLI reads the same content authenticated and current.

Answering a question rather than following a procedure? `ask` returns a written,
cited answer; `search` returns the **sections** behind it, each with its source
and the command to pull the rest:

```cmd
npx @odla-ai/cli runbook ask "how do I roll back a bad publish?"
```

```cmd
npx @odla-ai/cli runbook search "roll back a bad publish"
```

Cite what you quote — `release#rolling-back-a-bad-publish (v3)` — so the reader
can check it. An agent holding the PM skill has the same reach as tools:
`search_runbooks` (question in, cited sections out), `read_runbook` (whole
runbook, or one `section`), and `amend_runbook` for this project's own.

**A runbook is half the answer.** It carries the procedure — the order, the
gates, the commands. What an export takes, returns, and guarantees is the JSDoc
on that symbol: shipped in the installed package's `dist/*.d.ts` and rendered at
`https://odla.ai/docs/packages/<pkg>`. When a step calls an odla API, take the
step from the runbook and the arguments from the JSDoc. Never fill in a
signature, a default, or a return shape from memory — you do not have the
installed version in front of you, and the runbook is not claiming to describe it.

### After you change something, ask what you invalidated

```cmd
npx @odla-ai/cli runbook impact
```

It diffs your working tree against `origin/main` (`--base <ref>` for anything
else, uncommitted work included), works out which surfaces moved — the package,
the exports whose declaration or **JSDoc** changed, the console area — and names
the runbooks whose steps describe them, with the command to read each one.

Run it after touching an exported API, a doc comment, a package version, or a
Studio surface. Editing a JSDoc block is exactly the moment a procedure that
quotes that API can go stale, and nothing else will catch it: a runbook lives in
the database, so no build, test, or CI gate in the repository can see it drift
from your code. Reread what it names and fix any step your change made wrong,
in the same piece of work.

The other direction — are the runbooks themselves still true?

```cmd
npx @odla-ai/cli runbook lint
```

Every `odla-ai …` command the runbooks name is held against this CLI's real
command surface, and against the minimum versions each runbook declares. Because
a runbook is edited without a release, its text can name a command only a newer
package has; a runbook records that as `requires` (`@odla-ai/cli@0.18.0`), and
`runbook get` warns on stderr when yours is older. If you add a command and then
tell a runbook to use it, set `requires` in the same edit — otherwise the first
reader on an older CLI gets an "unknown action" error instead of an explanation.

Found a wrong step? Fix an app runbook directly. For a platform runbook,
`runbook edit` requests an admin-approved capability — a plain handshake token is
never admin, and `npx @odla-ai/cli whoami` tells you what you hold.

⏸ That request prints an approval block with a URL on its own line. **Relay that
URL to the human verbatim, immediately, before you wait on anything.** You cannot
approve it yourself — the grant is issued to you, not by you — and the command
blocks until a signed-in admin approves it. The browser launch is best-effort and
often shows no tab, so the printed URL is the only thing the human can rely on.
If approval is not available, comment on the runbook instead so an admin can fix
it later.

`npx @odla-ai/cli doctor` is an offline config check anytime;
`npx @odla-ai/cli smoke --env dev` verifies a live deployment.
Use `calendar status --json` for safe connection state (`bookable`, booking
and availability calendars) and `calendar calendars --json` to discover ids
after consent; update checked-in config and re-provision. Disconnect always
requires `--yes` and removes only this connection's sealed grant — Google
keeps every booked event.

The CLI owns deterministic platform work from `odla.config.mjs`: service
enablement, integration schema/rules/seeds, credential issuance/storage,
`.dev.vars`, and Wrangler secret transfer. You own source changes — install
runtime capability packages, mount their routes, supply authorization, add
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
- `references/pm.md` — the project manager for agents: goals, board, decisions,
  bugs. What to file where, the `pm` command set, and how to open and close a
  session against it.
- `references/co-owners.md` — sharing one app's db and tooling across a team:
  `app owners add/list/remove`, and how each co-owner self-provisions their own
  credentials (dev and the shared prod database) without any secret handoff.
