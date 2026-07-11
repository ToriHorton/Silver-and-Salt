# Secrets map — read before ANY command that touches a credential

## Where each value lives (and the ONLY place it lives)

| Value | Lives in | Handling |
|---|---|---|
| Clerk publishable key (`pk_test_`/`pk_live_`) | registry, via provision → setAuth | public by design; the one value a human may paste into chat; fine inline in odla.config.mjs |
| Clerk webhook secret (`whsec_…`) | tenant vault (`clerk_webhook_secret`) | only for auth mode "full"; entered in Studio, never wrangler, never chat |
| Clerk secret key (`sk_test_`/`sk_live_`) | not used in this journey | never ask for it |
| LLM provider key | tenant vault | env var in the HUMAN's shell for one provision run; never wrangler vars, never git, never chat |
| `odla_sk_…` (tenant db key) | wrangler secret `ODLA_API_KEY` + `.odla/credentials.local.json` (0600) + `.dev.vars` | present when db is enabled; move it only with the pipeline below |
| `odla_dev_…` (developer token) | `.odla/dev-token.json` (0600) | ~24h lifetime, provision-time only; never deployed |
| scoped `odla_dev_…` (admin-approved platform capability) | `.odla/admin-token.local.json` (0600) | separate policy/credential/usage/self-audit scope, ~15m lifetime, denied on owner routes, never deployed |
| `o11y_…` (o11y ingest token) | wrangler secret `ODLA_O11Y_TOKEN` + `.odla/credentials.local.json` (0600) + `.dev.vars` | only if the app enables o11y; provision issues/reuses it and moves it alongside the db key; never a var, never chat |
| `ODLA_ENDPOINT` / `ODLA_TENANT` / `ODLA_PLATFORM` / `ODLA_APP_ID` / `ODLA_ENV` | wrangler `vars` | not secrets; keep them set in every env block |
| `ODLA_O11Y_ENDPOINT` / `ODLA_O11Y_SERVICE` | `.dev.vars` from provision or optional wrangler `vars` overrides | not secrets; public ingest defaults to `https://o11y.odla.ai` and `ODLA_APP_ID` when the token is present |

System AI provider credentials are platform-owned and never enter a customer
migration. `odla-ai security run` receives only app/run-bound role grants; do
not ask the human for Anthropic/OpenAI/Google keys for hosted security.

## Moving the db key (+ o11y token) into the Worker (never through the transcript)

Normal provisioning owns the complete sequence — issuance, mode-0600 local
storage, `.dev.vars`, and redacted Wrangler stdin transfer. It pushes
`ODLA_API_KEY` and, when the app enabled o11y, `ODLA_O11Y_TOKEN` too:

    npx @odla-ai/cli provision --write-dev-vars --push-secrets
    npx @odla-ai/cli provision --yes --push-secrets  # Phase 5; includes prod consent

Use the narrower command only to retry one environment's already-saved
credential transfer:

    npx @odla-ai/cli secrets push --env dev
    npx @odla-ai/cli secrets push --env prod --yes

Manual fallback (identical mechanics, if the CLI is unavailable):

    node -e 'const c=require("./.odla/credentials.local.json");process.stdout.write(c.envs.dev.dbKey)' \
      | npx wrangler secret put ODLA_API_KEY --env dev

(For prod, use `c.envs.prod.dbKey` and drop `--env` — the top-level
wrangler env is prod.)

## Standing rules

- Never `cat`, `head`, `grep -v`, or otherwise display `.dev.vars`,
  `.odla/credentials.local.json`, or `.odla/dev-token.json`. To check
  they exist, use `ls -l` (also confirms 0600).
- Before every commit: read `git status`; the files above and the build
  output dir must not be staged. `odla-ai init` gitignores them — trust
  but verify.
- If a secret value ever does land in the conversation or a committed
  file: tell the human immediately, treat it as burned, and rotate it
  (`provision --rotate-keys` for the broad credential set, or
  `provision --rotate-o11y-token --push-secrets` for o11y only — with explicit
  human approval; provider dashboard for LLM/Clerk values).
- Studio's o11y token control is manual recovery only. It invalidates the live
  token immediately and does not update `.odla/credentials.local.json`; prefer
  the CLI rotation above so the saved and deployed values move together.
