---
name: odla-migrate
description: >
  Migrate a static site (e.g. GitHub Pages) to odla on Cloudflare in safe
  phases, then add a database, optional read-only calendar mirror, Clerk login, and AI. Use when the user wants to
  move a static or GitHub Pages site to Cloudflare/odla, or to add a backend,
  database, login/auth, or AI features to a static site via odla.
runbookOrder:
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
2. Dev only until Phase 5: `envs: ["dev"]` in odla.config.mjs; the dev
   tenant is `<appId>--dev`. Verify the tenant before any write or deploy.
3. Never print, paste, or commit a secret. Never `cat` .dev.vars,
   .odla/credentials.local.json, or .odla/dev-token.json. Read
   references/secrets-map.md BEFORE any command that touches a credential.
4. Never `git add -A` without reading `git status` first.
5. Never widen a db rule to silence a 403 — default-deny is the design.
   Any rules change is a human checkpoint.
6. Never run `provision --rotate-keys` or
   `provision --rotate-o11y-token` unless the human explicitly asks. Pair any
   approved o11y rotation with `--push-secrets` so the Worker is updated in the
   same run. If the final Wrangler transfer fails, use the CLI's printed
   non-rotating `secrets push` retry; never rotate again just to retry delivery.
7. Existing calendar embeds are public links, not proof of a booking. Preserve
   them via `bookingPageUrl`; never claim reconciliation until the read-only
   mirror is connected and the app correlates `$bookings` deliberately. Google
   OAuth tokens never enter the repo, CLI, or chat.

## Phase state machine

Phases run strictly in order; each has a verification gate:

  P0 preflight -> P1 static-on-cloudflare -> P2 database -> P2b calendar (optional) -> P3 login
  -> P4 ai (optional) -> P5 prod + DNS cutover

`MIGRATION.md` at the user's repo root is the durable state: create it in
Phase 0, update it at every gate (phase, what changed, what was verified).
In a fresh session, read MIGRATION.md first and resume from the recorded
phase; `npx @odla-ai/cli doctor` confirms the current config state.

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
- Parity curls — compare the old and new site on representative paths
  (Phase 1, again from the public domain in Phase 5).

## Phase files

Read the current phase's file when you enter it — not before:

- references/phase-0-preflight.md
- references/phase-1-static.md
- references/phase-2-db.md
- references/phase-2b-calendar.md (optional: preserve an embed and add authoritative read-only reconciliation)
- references/phase-3-auth.md
- references/phase-3b-user-sync.md (optional: mirror Clerk users into $users)
- references/phase-4-ai.md
- references/phase-5-cutover.md

On any failure, read references/troubleshooting.md before improvising.

## Context bootstrap

This installed skill and its `references/` directory are the complete migration
runbook; do not fetch a website or private source repository to reconstruct it.
Read only the current phase file as directed above. After `npm install`, prefer
`node_modules/@odla-ai/*/llms.txt` over training memory for package APIs — the
installed artifact is the version this project actually uses.
