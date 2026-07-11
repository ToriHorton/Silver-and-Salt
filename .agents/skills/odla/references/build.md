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

## 2. Build the Worker shell

`npm i` only the SDKs you need and use the local `references/sdks.md` as the
integration map. Create the Worker entrypoint and `wrangler.jsonc` before any
deployed-secret transfer. With o11y, install `@odla-ai/o11y`, add
`"nodejs_compat"` to `compatibility_flags`, and wrap the entrypoint with
`withObservability`.

Each installed package's `node_modules/@odla-ai/<pkg>/llms.txt` is the full API
contract. The npm artifacts contain everything required for this flow; private
service source or online documentation is not setup context.

## 3. Provision  ⏸ device-code approval

```
npx @odla-ai/cli provision --write-dev-vars --push-secrets
```

Prints a short device code and a link. ⏸ The human opens https://odla.ai/studio, signs
in, and approves the code — no secret passes through the chat. Provision then:
creates the app, enables its services, issues or reuses the db key (and the
o11y ingest token when o11y is enabled), pushes schema + rules, writes
`.dev.vars`, and transfers configured Worker secrets through Wrangler stdin.
Local credential files are `0600` and gitignored. Verify with
`npx @odla-ai/cli doctor` — it prints the app, envs, services, and flags
anything unset. `--push-secrets` preflights the Wrangler config and login before
issuing or rotating a shown-once credential.

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

## 5. Security preflight

Install the passive harness and scan before any production secret or deploy:

Before installing the exact release, first verify
`npm view @odla-ai/security@0.2.2 version`. An exact-version `E404` means the
release is unavailable and blocks this preflight; it is not a clean scan and
does not prove the package name is absent.

```
npm i -D --save-exact @odla-ai/security@0.2.2
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
