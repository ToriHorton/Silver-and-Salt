# Build a new odla app (greenfield)

Exact commands, verified against `@odla-ai/cli`. ⏸ marks a human step.

## 1. Scaffold

```
npx @odla-ai/cli init --app-id my-app --name "My App"
```

Writes `odla.config.mjs`, `src/odla/schema.mjs`, `src/odla/rules.mjs`, and adds
`.odla/*` + `.dev.vars` to `.gitignore`. Edit `schema.mjs` to declare your
namespaces (e.g. `notes`). Leave `rules.mjs` as-is for now — provision generates
deny-all rules from the schema. To turn on auth/observability, add `"o11y"` to
`services` and an `auth.clerk` block in `odla.config.mjs` (init leaves it
commented).

For a Google booking mirror, include both `"db"` and `"calendar"`. Configure
`calendar.google.calendars` for every env (start with `"primary"`), optional
match filters, and `attendeePolicy: "full" | "hashed"`. This release is
read-only; do not add OAuth credentials or action scopes to config.
For static Appointment Schedule parity, add the public per-env
`bookingPageUrl`; it is link/embed configuration, never a credential.

## 2. Build the Worker shell

`npm i` only the SDKs you need and use the local `references/sdks.md` as the
integration map. `npm i -D wrangler` so the project pins its own copy instead
of relying on an implicit `npx` fetch. Create the Worker entrypoint and
`wrangler.jsonc` before any deployed-secret transfer — take the current config
syntax from Cloudflare's live docs (SKILL.md "Tooling sources"), not memory.
With o11y, install `@odla-ai/o11y`, add `"nodejs_compat"` to
`compatibility_flags`, and wrap the entrypoint with `withObservability`.

Each installed package's README and exported TypeScript declarations/JSDoc are
the version-matched API contract; resolve public entry points through its
`package.json` `exports`. For everything odla, the npm artifacts contain the
whole setup context — private service source or web documentation is never
required. Third-party tooling (wrangler, Clerk) is the reverse: use the live
vendor docs, never memorized steps.

## 3. Provision  ⏸ device-code approval

```
npx @odla-ai/cli provision --email <existing-odla-account> --write-dev-vars --push-secrets
```

The email is an account identifier, never a password or session credential.
Prints a short device code and a link. ⏸ That same account opens the link, signs
in, explicitly reviews the exact code, and approves it — loading the URL alone
does not claim access, and no secret passes through the chat. Provision then:
creates the app, enables its services, issues or reuses the db key (and the
o11y ingest token when o11y is enabled), pushes schema + rules, writes
`.dev.vars`, and transfers configured Worker secrets through Wrangler stdin.
Local credential files are `0600` and gitignored. Verify with
`npx @odla-ai/cli doctor` — it prints the app, envs, services, and flags
anything unset. `--push-secrets` preflights the Wrangler config and login before
issuing or rotating a shown-once credential.

Calendar adds a second ⏸ checkpoint after the odla device approval: provision
prints/opens a state-bound Google URL issued by the platform and waits while the human grants
`calendar.events.readonly` and the hosted connector performs initial sync. The
CLI never receives the Google callback code or tokens. Once connected, run
`npx @odla-ai/cli calendar calendars --env dev --json`, refine the checked-in
calendar ids if needed, re-provision, and verify `calendar status --json`.

The CLI stops at the source boundary: it verifies but does not invent your
application semantics. Do not use Studio to mint a routine o11y token. Manual
Studio rotation is recovery-only;
normal replacement is
`npx @odla-ai/cli provision --rotate-o11y-token --push-secrets` after explicit
human approval.

## 4. Run locally

```
npx wrangler dev
```

`wrangler dev` auto-loads `.dev.vars`. Exercise the app. A default-deny `403`
means the namespace has no rule yet — add one in `src/odla/rules.mjs`
(deliberately; e.g. `{ notes: { view: "auth.signedIn", create: "auth.signedIn" } }`),
re-provision to push it, and retry.

Calendar uses the same `ODLA_ENDPOINT`, `ODLA_TENANT`, and server-only
`ODLA_API_KEY`; it adds no Worker secret. Keep `initCalendar` in trusted Worker
code. Browser code uses db subscriptions under explicit rules or pure
`@odla-ai/calendar/client` helpers, never the admin key.

## 5. Security preflight

Install the passive harness and scan before any production secret or deploy:

Before installing the exact release, first verify
`npm view @odla-ai/security@0.3.1 version`. An exact-version `E404` means the
release is unavailable and blocks this preflight; it is not a clean scan and
does not prove the package name is absent.

```
npm i -D --save-exact @odla-ai/security@0.3.1
npx odla-security scan . --profile odla --out .odla/security/pre-ship --fail-on high --fail-on-candidates critical
```

Read `.odla/security/pre-ship/REPORT.md`. The CLI makes no model calls and does
not execute target code. A `candidate` is a review lead, not a confirmed
vulnerability; do not suppress one merely to clear the gate. Baseline entries
need a fingerprint, concrete reason, owner, and expiry.

Optional hosted follow-up (human must explicitly approve redacted tracked-source
disclosure under the configured providers' retention/residency terms):

```
npx @odla-ai/cli security run . --env dev --ack-redacted-source
```

For a repeatable commit-pinned job after the human approves the read-only
GitHub App:

```
npx @odla-ai/cli security github connect --env dev
npx @odla-ai/cli security plan --env dev
npx @odla-ai/cli security sources --env dev
npx @odla-ai/cli security run --source <source-id> --ref main --env dev --plan-digest <digest-from-security-plan> --ack-redacted-source
```

The CLI infers the repository from a safe GitHub origin, never requests a PAT
or provider key, follows the job and applies the gate by default. GitHub read
approval does not replace the explicit redacted-source acknowledgement. Target
code is not executed and a clean report is not proof of security.

Do not ask for Anthropic/OpenAI/Google keys. The CLI obtains app-owner auth;
the platform fixes separate discovery/validation grants to the admin-configured
routes, attributes usage to this app/env/run, and retains no source or prompts
in its accounting ledger. A rolling platform-ceiling `429` always carries a
conservative retry hint. A provider-side `429` uses the sanitized
`provider_rate_limited` code and carries a bounded hint only when the upstream
supplied one. Surface either without looping or manufacturing a provider key.

## 6. Ship  ⏸ human checkpoint

Add `"prod"` to `envs`, provision again (prod tenant = the bare `appId`), then:

```
npx @odla-ai/cli provision --yes --push-secrets  # prod mutation + configured Worker secrets
npx wrangler deploy
```

Verify with `npx @odla-ai/cli smoke --env prod`. Point env vars at the service
custom domains, never `*.workers.dev` (Workers can't fetch same-account workers.dev).
