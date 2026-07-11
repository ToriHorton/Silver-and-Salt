# odla SDK cheat-sheet

Install only what the app needs. Every package ships an `llms.txt` in
`node_modules/@odla-ai/<pkg>/` with the full, current API — read it. Minimal
real usage below.

## @odla-ai/db — realtime graph database

Data is **namespaces** of rows, declared in `src/odla/schema.mjs`, gated by
default-deny `src/odla/rules.mjs`. Isomorphic (browser + Worker).

```ts
// browser client — token from your IdP (Clerk):
const db = init({ appId, endpoint, getToken });
const { data } = useQuery({ notes: { $: { order: { createdAt: "asc" } } } });
transact(db.tx.notes[crypto.randomUUID()].update({ text, createdAt: Date.now() }));
```

Worker/admin side: `init({ appId: tenantId, adminToken: env.ODLA_API_KEY, endpoint })`
— the admin key bypasses rules, so a worker-mediated backend needs none.

## @odla-ai/auth-clerk — sign-in (Clerk; runs on Preact or React)

```tsx
<ClerkGate publishableKey={pk} appearance={clerkAppearanceFromTokens()}>
  <SignedOut><SignIn routing="hash" /></SignedOut>
  <SignedIn>{/* useClerkAuth().getToken → db init; <UserButton/> signs out */}</SignedIn>
</ClerkGate>
```

The publishable key is public; `provision` stores it (`setAuth`). Rules evaluate
the signed-in user's JWT as `auth` — e.g. `auth.signedIn`, `auth.email`.

## @odla-ai/ai — inference (Claude / GPT / Gemini)

```ts
const { ai } = await initFromPlatform({ platform, appId, env, db });
await ai.chat({ messages }); // provider/model + key resolved from the platform vault
```

No API key in your code or env — it lives in the tenant vault; `provision`
stores it when the configured `ai.keyEnv` is set at provision time.

## @odla-ai/o11y — observability (Cloudflare Workers)

```ts
export default withObservability(handler);          // traces fetch/cron/bindings
count("http.requests", 1, { "http.route": path });   // metrics
recordError(err, { route, code });                   // structured errors
```

When `o11y` is in `services`, run
`npx @odla-ai/cli provision --write-dev-vars --push-secrets`. The CLI enables
the service, issues or reuses its token, persists it locally, writes
`.dev.vars`, and transfers `ODLA_O11Y_TOKEN` to the Worker over Wrangler stdin.
With a token present, the SDK defaults `ODLA_O11Y_ENDPOINT` to
`https://o11y.odla.ai` and the service label to
`ODLA_O11Y_SERVICE ?? ODLA_APP_ID`; both remain overrides. First-party hosting
binds `ODLA_O11Y_COLLECTOR` instead (no public endpoint/token).

Source instrumentation remains your job: install the package, wrap with
`withObservability`, and select useful signals. Never rotate through Studio as
routine setup. On explicit human request, use
`provision --rotate-o11y-token --push-secrets` so local and deployed values stay
in sync.

## @odla-ai/security — pre-ship vulnerability harness

Run the passive CLI in local/CI development; do not import it into the running
Worker:

Before installing the exact release, require
`npm view @odla-ai/security@0.2.2 version` to succeed before installing it. An
exact-version `E404` means the release is unavailable, not that the preflight
passed, and does not prove the package name is absent.

```
npm i -D --save-exact @odla-ai/security@0.2.2
npx odla-security scan . --profile odla --out .odla/security/pre-ship --fail-on high --fail-on-candidates critical
```

Deterministic rules emit leads. After explicit redacted-source approval, run
`npx @odla-ai/cli security run . --env dev --ack-redacted-source` for hosted,
app-attributed discovery and independent validation. It obtains owner auth and
never asks for provider keys. The lower-level library flow remains available
for custom orchestrators; active reproduction still requires an explicitly
injected isolated executor and never falls back to the host shell.

## Others

- **@odla-ai/ui** — design system: CSS tokens, five themes, component styles,
  chart helpers.
- **@odla-ai/kg** — ontology-driven knowledge graph: source connectors, LLM
  extraction, provenance-preserving writes.
- **@odla-ai/blog** — static-first blogging; files in, site out.
- **@odla-ai/apps** — control-plane SDK (create apps, toggle services); the CLI
  and registry usually handle this for you.
