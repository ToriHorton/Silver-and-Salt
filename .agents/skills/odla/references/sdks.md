# odla SDK cheat-sheet

Install only what the app needs. Prefer the installed package's README and
exported TypeScript declarations/JSDoc over training memory; resolve public
entry points through its `package.json` `exports`. Rendered references are also
available at `https://odla.ai/docs/packages/<pkg>`. Minimal real usage follows.

## @odla-ai/db — realtime graph database

Data is **namespaces** of rows, declared in `src/odla/schema.mjs`, gated by
default-deny `src/odla/rules.mjs`. Isomorphic (browser + Worker).

```ts
// browser client — token from your IdP (Clerk):
import { OdlaProvider, useQuery, useTransact } from "@odla-ai/db/preact";
const db = init({ appId, endpoint, getToken });
const { data } = useQuery({ notes: { $: { order: { createdAt: "asc" } } } });
transact(db.tx.notes[crypto.randomUUID()].update({ text, createdAt: Date.now() }));
```

Worker/admin side: `init({ appId: tenantId, adminToken: env.ODLA_API_KEY, endpoint })`
— the admin key bypasses rules, so a worker-mediated backend needs none.

## @odla-ai/auth-clerk — native Preact sign-in (Clerk)

```tsx
<ClerkGate publishableKey={pk} appearance={clerkAppearanceFromTokens()}>
  <SignedOut><SignIn routing="hash" /></SignedOut>
  <SignedIn>{/* useClerkAuth().getToken → db init; <UserButton/> signs out */}</SignedIn>
</ClerkGate>
```

The publishable key is public; `provision` stores it (`setAuth`). Rules evaluate
the signed-in user's JWT as `auth` — e.g. `auth.signedIn`, `auth.email`.

## @odla-ai/calendar — live Google Calendar booking

Calendar requires `services: ["db", "calendar"]` plus a `calendar.google`
block (`availabilityCalendars` per env, optional `bookingCalendar`). Normal
provision opens a second, state-bound Google checkpoint issued by the
platform; the human grants the booking scopes in a browser. Google tokens
stay platform-side and never become app/CLI secrets. Google Calendar is the
single source of truth — odla stores no calendar or attendee data, and
nothing syncs.

```ts
// Trusted Worker only — the admin key must never enter browser code.
const cal = initCalendar({
  appId: env.ODLA_APP_ID,       // registry app id
  env: env.ODLA_ENV,
  adminToken: env.ODLA_API_KEY,
  endpoint: env.ODLA_PLATFORM ?? "https://odla.ai",
});
const fb = await cal.availability.freeBusy({ timeMin, timeMax });
const slots = computeBookableSlots(fb.busy, { from: timeMin, to: timeMax,
  timezone, slotMinutes: 30 });
const { booking } = await cal.actions.create(
  { summary, startAt, endAt, attendees: [email], timezone, meet: true },
  { idempotencyKey: `booking:${recordId}` }, // retry-safe; Google emails the invite
);
```

Store the returned `eventId`/`meetUrl` on the app's own record;
`actions.reschedule(eventId, …)` and `actions.cancel(eventId)` use it. A
taken slot rejects with non-retryable `calendar_slot_unavailable` — refetch
slots, don't retry. Browser code never calls `initCalendar` or the platform
calendar routes; it hits the app's own endpoints and may import pure helpers
(`computeBookableSlots`, formatters) from `@odla-ai/calendar/client`.
`SlotPicker` from `@odla-ai/ui` renders the slot output directly.

After consent, use `odla-ai calendar calendars --env dev --json` to discover
selectable ids and edit the checked-in list. Re-provision, then verify
`calendar status --env dev` reports `bookable: yes` and `smoke` passes. A
pre-pivot read-only grant reports `degraded`/`calendar_reconsent_required`;
re-run `calendar connect`.

## @odla-ai/ai — inference (Claude / GPT / Gemini)

```ts
const { ai } = await initFromPlatform({ platform, appId, env, db });
await ai.chat({ messages }); // provider/model + key resolved from the platform vault
```

No API key in your code or env — it lives in the tenant vault; `provision`
stores it when the configured `ai.keyEnv` is set at provision time.

## @odla-ai/crm — records, pipelines, follow-ups, and contactability

Define the CRM once in an app module, mount `createCrmRoutes` in trusted Worker
code behind the app's admin authorization, and render the optional admin kit
from `@odla-ai/crm/ui`. Declare `createCrmIntegration(crm, options)` under
`odla.config.mjs` `integrations`—never under `services`.

```ts
import { createCrmIntegration } from "@odla-ai/crm";
import { crm } from "./src/crm.js";

export default {
  app: { id: "my-app", name: "My App" },
  services: ["db"],
  integrations: [createCrmIntegration(crm, { basePath: "/api/crm" })],
  links: { dev: "https://dev.example.com" },
};
```

Provision merges the CRM schema/rules and creates `crm_config` only when
absent. Doctor checks the composed contract offline; smoke calls the records
route anonymously and requires `401`. The CLI does not edit the Worker or
invent `authorize`. Billing is an optional injected `BillingProvider`; reuse
app-owned payment code when present rather than assuming another package.

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

Require `npm view @odla-ai/security version` to succeed before installing it.
A registry failure blocks the preflight; it is not a clean scan. Use a normal
dependency declaration, commit the lockfile, and record the resolved version.

```
npm i -D @odla-ai/security
npm ls @odla-ai/security
npx odla-security scan . --profile odla --out .odla/security/pre-ship --fail-on high --fail-on-candidates critical
```

Deterministic rules emit leads. After explicit redacted-source approval, run
`npx @odla-ai/cli security run . --env dev --ack-redacted-source` for hosted,
app-attributed discovery and independent validation. It obtains owner auth and
never asks for provider keys. The lower-level library flow remains available
for custom orchestrators; active reproduction still requires an explicitly
injected isolated executor and never falls back to the host shell.

## Others

- **@odla-ai/chapter** — membership sites from one `defineChapter()` config:
  generates the odla-db schema + deny-all rules + group seed + provisioning
  integration, and ships the worker (join/apply, Stripe membership, Google
  booking, member area, exactly-once lifecycle email, CRM projection, and
  leader → follower record delivery) plus a UI kit. Composable:
  `chapterWorker({ chapter, routes })` runs host routes before the built-ins and
  shares its auth context; `<ChapterAdmin chapter={chapter}/>` derives the
  familiar brand/section shell and uses host-independent `?tab=` routing;
  `./ui/member` is Preact-only (no Clerk SDK). **If a migration target
  is a membership site, start here instead of hand-authoring schema** — see
  `odla-migrate/references/phase-2-chapter.md`.
- **@odla-ai/ui** — design system: CSS tokens, five themes, component styles,
  chart helpers.
- **@odla-ai/kg** — ontology-driven knowledge graph: source connectors, LLM
  extraction, provenance-preserving writes.
- **@odla-ai/blog** — static-first blogging; files in, site out.
- **@odla-ai/apps** — control-plane SDK (create apps, toggle services); the CLI
  and registry usually handle this for you.
