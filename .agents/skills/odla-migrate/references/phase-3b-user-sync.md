# Phase 3b — Mirror Clerk users into odla-db (`$users`)

Optional, and staged: ship login first (Phase 3), then turn this on. **Clerk is
the source of truth for identity.** odla-db keeps a *mirror* of your users in the
reserved `$users` namespace so rules and app data can reference them. You do not
build the mirror yourself — the platform does it. This phase enables it.

Goal: signed-in users appear as rows in the app's `$users`, kept in sync with
Clerk (create/update/delete). Dev first, then prod.

Human obligation: create a Clerk webhook endpoint and get its signing secret
(`whsec_…`) into the tenant vault — piped through `secrets set` when a command
can print it, or pasted into Studio (both write-only). That plus the Phase-3
`clerk auth login` are the only human Clerk steps.

## How `$users` fills — two paths

1. **Browser talks to odla-db directly with its Clerk session token.** The
   platform verifies the JWT and auto-creates a basic `$users` row (`id` = the
   Clerk `sub`). No setup. This only happens for *user-token* access.
2. **The Clerk webhook (full profile).** Clerk pushes `user.created/updated/
   deleted` to odla-db, which upserts the full profile (`email`, `name`,
   `imageUrl`) and tombstones on delete. Works for **any** app.

**If your app is worker-mediated** (the worker holds the app's admin/scoped key
and calls odla-db itself — the Phase-2/3 pattern), that scoped credential is
**not projected into `$users`**. So the webhook (path 2) is how you get `$users`.
Enable it here.

## Enable the webhook

1. **Create the endpoint in Clerk** (per instance — dev instance → dev tenant;
   prod instance → prod tenant). URL:
   `https://db.odla.ai/webhooks/clerk/<ODLA_TENANT>`
   (the odla tenant, e.g. `<appId>--dev` in dev, `<appId>` in prod). Subscribe to
   `user.created`, `user.updated`, `user.deleted`. Clerk returns a signing secret
   `whsec_…`. Prefer the Clerk CLI if it exposes webhook creation; otherwise the
   Clerk dashboard → Webhooks → Add Endpoint. (`whsec_` is a real secret — never
   print/commit it; it is the only thing you paste, and it goes into the vault,
   not chat.)
2. **Store the secret in the tenant vault** as `clerk_webhook_secret`, write-only.
   If any command can print the `whsec_` (Clerk CLI, Svix API), pipe it without
   it ever being displayed:
   `<command that prints whsec_…> | npx @odla-ai/cli secrets set clerk_webhook_secret --env dev --stdin`.
   Otherwise a human pastes it into Studio's secret UI (`odla.ai/studio` → the
   app → the env → secrets) — same write-only slot. The server decrypts it only
   to verify inbound events (svix HMAC over `id.timestamp.body`).
3. **(Optional) `sk_…`** — the webhook payload already carries email/name/image,
   so the basic mirror needs only `whsec_`. Add the Clerk backend key only if
   you later need to resolve data the webhook doesn't send (invites, member
   lookups): `npx @odla-ai/cli secrets set-clerk-key --env dev --from-env CLERK_SECRET_KEY`
   stores it in the reserved `$clerk_secret` slot, write-only.

## Verify

- Sign in (or edit the user in Clerk) → a `$users` row appears (check Studio, or
  a worker route that runs `db.query({ $users: {} })`).
- Delete the Clerk user → the row is tombstoned, not hard-deleted.
- Rules can now gate on it: `$users` is platform-managed (a browser may view its
  own row but cannot write `$users`). Your app's own tables (members, roles,
  status) layer on top, keyed by the Clerk `sub` or `email`.

Done when: a real sign-in produces a `$users` row in the dev tenant. Repeat the
endpoint + secret for the prod instance/tenant at Phase 5.
