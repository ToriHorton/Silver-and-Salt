---
name: odla-migrate
description: >
  Migrate a static site (e.g. GitHub Pages) to odla on Cloudflare in safe
  phases, then add a database, optional Google Calendar booking, Clerk login, and AI. Use when the user wants to
  move a static or GitHub Pages site to Cloudflare/odla, or to add a backend,
  database, login/auth, or AI features to a static site via odla.
runbookOrder:
  - references/project-state.md
  - references/phase-0-preflight.md
  - references/phase-1-static.md
  - references/phase-2-db.md
  - references/phase-2b-calendar.md
  - references/phase-3-auth.md
  - references/phase-3b-user-sync.md
  - references/phase-4-ai.md
  - references/phase-5-cutover.md
  - references/troubleshooting.md
  - references/secrets-map.md
---

# odla-migrate

You are driving a phased migration of a static site to odla + Cloudflare.
The human approves checkpoints and performs browser-only steps (accounts,
handshake approval, DNS). You do everything else.

## When NOT to use this skill

Greenfield odla apps (no existing site to migrate): read and follow the sibling
installed skill at `../odla/SKILL.md` instead.

## Non-negotiable rules

1. The old site (GitHub Pages) stays live and untouched until Phase 5
   sign-off. Before that, rollback is always "do nothing."
2. Sandbox database only until Phase 5: `envs: ["dev"]` in odla.config.mjs; the
   sandbox tenant is `<appId>--dev`, and the app's live database (env `prod`)
   is the bare `<appId>`. Both sit on production odla.ai. Verify the tenant
   before any write or deploy.
3. Never print, paste, or commit a secret. Never `cat` .dev.vars,
   .odla/credentials.local.json, or .odla/dev-token.json. Read
   references/secrets-map.md BEFORE any command that touches a credential.
   A fresh device request requires the existing odla account email via
   `--email` or `ODLA_USER_EMAIL`; email is a non-secret identifier. Never ask
   for an odla password, Clerk token, or browser session. That is the human's
   odla ACCOUNT email — never infer it from `git config user.email`, `gh`, or a
   commit author; a wrong address silently mints an unapprovable request. See
   references/troubleshooting.md.
4. Never `git add -A` without reading `git status` first.
5. Never widen a db rule to silence a 403 — default-deny is the design.
   Any rules change is a human checkpoint.
6. Never run `provision --rotate-keys` or
   `provision --rotate-o11y-token` unless the human explicitly asks. Pair any
   approved o11y rotation with `--push-secrets` so the Worker is updated in the
   same run. If the final Wrangler transfer fails, use the CLI's printed
   non-rotating `secrets push` retry; never rotate again just to retry delivery.
7. Calendar booking is server-side only. `initCalendar` and the platform's
   calendar routes authenticate with the app's full `ODLA_API_KEY` — never
   call them from a browser; the browser talks to the app's own Worker
   endpoints. An old public embed link is not a booking flow; preserve it via
   `bookingPageUrl` only until the native flow is verified. Google OAuth
   tokens never enter the repo, CLI, or chat.
8. Project state belongs in odla PM, not a migration diary in the source tree.
   Read `references/project-state.md` before recording or resuming work. Never
   put credentials or secret values in PM.

## Phase state machine

Phases run strictly in order; each has a verification gate:

  P0 preflight -> P1 static-on-cloudflare -> P2 database -> P2b calendar (optional) -> P3 login
  -> P4 ai (optional) -> P5 prod + DNS cutover

PM is the durable state: goals define the migration gates, board tasks show the
active phase, decisions preserve product and architecture choices, bugs capture
defects, and comments carry evidence. In a fresh session, query PM first as
specified in `references/project-state.md`; `npx @odla-ai/cli doctor` then
confirms the checked-in config state.

## Auth model (one line)

Clerk is the **source of truth** for users; odla-db keeps a mirror in the
app's reserved `$users` namespace (Phase 3 ships login; Phase 3b enables the
mirror). That per-app `$users` is distinct from odla.ai's own operator
access list — don't conflate them.

## Checkpoint protocol (every phase boundary)

1. Run the phase's verification checklist (in its reference file).
2. Give the human a 3-line summary: what changed / what was verified /
   what the NEXT phase will ask of them (account to create, code to
   approve, value to paste, command to run themselves).
3. Wait for explicit approval before entering the next phase.

At the very first checkpoint, have the human sign in at https://odla.ai/studio and
open Docs → "Moving your site to odla" — it explains their side of the whole
journey in plain language. They need an odla account for the migration anyway,
so this is a natural first step.

## Verification tools

- `npx @odla-ai/cli capabilities --json` — authoritative automation boundary;
  run once when orienting so source edits and human checkpoints are not confused
  with CLI-owned platform/credential work.
- `npx @odla-ai/cli doctor` — offline config/schema/rules validation; run
  after any config edit.
- `npx @odla-ai/cli provision --dry-run` — the plan, zero network/file I/O;
  show it to the human before the first real provision.
- `npx @odla-ai/cli smoke --env dev` — live, read-only: public-config, live
  schema diff, a count aggregate. Run after every provision.
- `wrangler dev` + curl — exercise routes locally before deploying.
- Contract probes — compare old and new method/auth/request/response schemas,
  status and relevant headers, not just paths or equal values (Phase 1, again
  from the public domain in Phase 5). Record source commit and immutable
  deployment version separately; an unversioned live response does not prove
  what the current branch implements.

## Phase files

Read the current phase's file when you enter it — not before:

- references/phase-0-preflight.md
- references/project-state.md (read before Phase 0 and at every session start)
- references/phase-1-static.md
- references/phase-2-db.md
- references/phase-2b-calendar.md (optional: live Google Calendar booking — slots, create/reschedule/cancel through the app's own Worker)
- references/phase-3-auth.md
- references/phase-3b-user-sync.md (optional: mirror Clerk users into $users)
- references/phase-4-ai.md
- references/phase-5-cutover.md

On any failure, read references/troubleshooting.md before improvising.

## Context bootstrap

This installed skill and its `references/` directory are the complete migration
runbook; do not fetch a website or private source repository to reconstruct it.
Read only the current phase file as directed above. After `npm install`, prefer
each installed package's README and exported TypeScript declarations/JSDoc over
training memory; resolve entry points through its `package.json` `exports`.
Those artifacts describe the version this project actually uses.

Third-party tools (wrangler, Clerk) are the reverse: their CLIs and config
formats evolve, so never work from memorized setup steps. When a phase reaches
a wrangler or Clerk step, fetch the vendor's current agent docs and prefer
their syntax over any literal command written in a phase file:

- Cloudflare: docs index `https://developers.cloudflare.com/llms.txt`; every
  docs page has a markdown twin at `<page>/index.md` (wrangler config:
  `https://developers.cloudflare.com/workers/wrangler/configuration/index.md`).
  With the human's OK (it edits global agent config), you may also follow
  `https://developers.cloudflare.com/agent-setup/prompt.md` to add Cloudflare's
  own skills + MCP servers to your harness.
- Clerk: agent-first CLI setup `https://clerk.com/docs/cli.md`; docs index
  `https://clerk.com/docs/llms.txt`.

Offline? Say so, continue with the vendor steps written in the phase files,
and flag that they may be stale.
