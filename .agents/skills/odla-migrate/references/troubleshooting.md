# Troubleshooting — symptom → cause → fix

## `spawn EBADF` when running `wrangler dev`

Cause: the assets `directory` points at the repo root or any directory
containing `node_modules`; wrangler's file watcher exhausts file
descriptors and workerd dies with this unhelpful error.
Fix: point `assets.directory` at the dedicated build dir from Phase 0.
Never "fix" it by raising ulimits.

## 403 / permission denied from odla-db (usually from the browser)

Cause: default-deny rules doing their job. The deny-all rules are
correct for a worker-mediated app.
Fix: route the access through the worker's `/api/*` (the app key
bypasses rules). Do NOT widen a rule to make the error disappear —
any rules change is a human checkpoint.

## Data appearing in the wrong place / writes not visible

Cause: tenant confusion — the code ran against `<appId>` (prod) instead
of `<appId>--dev`, or vice versa. Typical trigger: `wrangler deploy`
without `--env dev`, or `wrangler dev` picking up top-level vars.
Fix: check `ODLA_TENANT`/`ODLA_ENV` in the relevant `wrangler.jsonc`
env block and which deploy command ran. `npx @odla-ai/cli smoke --env dev`
prints what it verified against.

## Provision fails with an auth/token error

Cause: the `odla_dev_…` token expired (~24h) or the handshake was never
approved.
Fix: re-run `npx @odla-ai/cli provision` — it starts a fresh handshake; the
matching existing account must be supplied with `--email` or
`ODLA_USER_EMAIL`, then signs in, reviews, and approves the exact code at the
printed URL. Never ask for a password or session token. Use `--no-open` in
non-interactive shells if the browser launch misbehaves.

## `smoke` fails: missing credentials

Cause: `.odla/credentials.local.json` absent, for a different app id,
or lacking a db key for the requested env.
Fix: run `npx @odla-ai/cli provision` for the configured envs first; confirm
`envs` in odla.config.mjs includes the env you're smoking.

## `smoke` fails: schema mismatch

Cause: local `src/odla/schema.mjs` changed since the last push.
Fix: re-run `npx @odla-ai/cli provision` (schema re-push is the migration
mechanism; additive changes are safe on live tenants), then re-run
smoke.

## Provision reports an existing o11y token but no local credential

Cause: the shown-once token was issued elsewhere, or the local credentials file
was lost. Plain provision refuses to invalidate a deployed Worker just to
recover plaintext.
Fix: after explicit human approval, run
`npx @odla-ai/cli provision --rotate-o11y-token --push-secrets` (add `--yes`
when production is in the plan). This persists the replacement before moving it
to the Worker. Do not use the Studio button for routine recovery; it cannot sync
the repository's credential file.

## Clerk-verified requests return no email

Cause: the Clerk session token doesn't include an email claim.
Fix: Clerk dashboard → session token customization → add the email
claim, then re-test. The worker only forwards what the JWT carries.

## Re-running provision — is it safe?

Yes: plain re-runs are idempotent (existing app registration and configured db
and o11y credentials are reused; schema/rules re-push). Destructive rotation is
always explicit: `--rotate-o11y-token` replaces only o11y, while
`--rotate-keys` is the broader credential rotation. Use either only on explicit
human request, and pair rotation with `--push-secrets` so the Worker receives
the replacement in the same run. This is not atomic: if the final Wrangler
transfer fails, the new value is already in the private credentials file. Run
the printed `secrets push --env ...` retry and do not rotate again.

## Something not covered here

Check, in order: `npx @odla-ai/cli doctor` output; this skill's current phase
and troubleshooting references; then the relevant installed package README and
exported TypeScript declarations/JSDoc. Do not improvise around a safety rule
to unblock yourself — surface the blocker to the human instead.
