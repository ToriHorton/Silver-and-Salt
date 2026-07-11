# Phase 3 — Login (Clerk, client mode)

Goal: Clerk sign-in on the site, the worker verifying session JWTs
itself, at least one route gated. Dev only.

Human obligation: **run `npx clerk auth login`** — a one-time browser
OAuth into their Clerk account. This is the ONE interactive step and the
whole reason to surface it early: the agent cannot authenticate as the
user. After login, credentials are stored locally and the agent drives
the rest (`apps create`, `link`, `env pull`, `config patch`) from Bash.
There is no `pk_` to hand-paste — the CLI pulls it. (Never handle `sk_…`
or `whsec_…` in client mode; `env pull` writes an `sk_` into a gitignored
`.env.local` that stays local and unused.)

Use the Clerk CLI (`npx clerk`) to create the instance rather than the
dashboard. Do NOT assume an app exists: a stale publishable key can linger
on the registry's app_auth record from a deleted/recreated app —
`clerk apps list` is the source of truth for what's real.

## Steps

1. Provision the Clerk app with the CLI (after the human's `clerk auth
   login`):
   - `npx clerk apps list` — confirm what exists (catch stale/leftover
     instances); create if absent.
   - `npx clerk apps create "<App Name>"` — creates the app + dev
     instance (`pk_test_…`).
   - `npx clerk link` (or `--app <id>`), then `npx clerk env pull` — pull
     the dev `pk_test_…` into `.env.local`. Take only the publishable key.
2. Add the key to `odla.config.mjs`: `auth: { clerk: { dev: "<pk_test_…>" } }`
   (inline is fine — it's public), then `npx @odla-ai/cli provision`
   (idempotent) — calls setAuth for the dev env; the issuer is derived
   from the key. **provision OVERWRITES any stale key** on public-config.
   The worker fetches auth config from public-config at runtime, so a key
   change propagates without a redeploy.
3. `npm i jose`. In the worker, use this documented verification pattern:
   - fetch `<ODLA_PLATFORM>/registry/apps/<ODLA_APP_ID>/public-config?env=<ODLA_ENV>`,
     cache ~5 min per isolate
   - `createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"))`,
     cached per issuer
   - `jwtVerify(token, jwks, { issuer })` on the `Authorization: Bearer`
     header; pass `{ sub, email }` to routes
   - ensure the Clerk session token includes an email claim if routes
     need email: try `npx clerk config schema --keys session` then
     `npx clerk config patch --json '{…}'`; else set it in the dashboard
     (Sessions → customize session token) to
     `{"email": "{{user.primary_email_address}}"}`
4. Gate at least one `/api/*` route on a verified user; return 401
   otherwise.
5. Add Clerk sign-in to the site pages. For a React/Preact site, use
   `@odla-ai/auth-clerk`: wrap the app in `<ClerkGate publishableKey>`
   (key from public-config) and drop in `<SignIn />`. It runs on vanilla
   clerk-js (no clerk-react), loads clerk-js as a lazy chunk, and themes
   to odla-ui via `clerkAppearanceFromTokens()`. Otherwise drive ClerkJS
   directly with the publishable key from public-config, or use Clerk's
   hosted pages. For a **vanilla/static site**, load Clerk's browser bundle
   with the key on the tag — it hot-loads `window.Clerk` as a ready
   *instance* (not a constructor): `<script src="https://<frontend-api>/
   npm/@clerk/clerk-js@5/dist/clerk.browser.js" data-clerk-publishable-key=
   "<pk>">` then `await window.Clerk.load()`. The `<frontend-api>` is the
   host encoded in the pk. Then mount `Clerk.mountSignIn(el, { appearance })`
   and attach `Clerk.session.getToken()` as the `Bearer` on `/api/*` calls.
6. Deploy dev (`npm run deploy:app:dev`).

Clerk is the **source of truth** for identity; odla-db keeps a mirror in
`$users`. Shipping login (this phase) is enough to gate routes. Mirroring
users into `$users` (svix webhook, "full" mode) is a **separate, optional
next step — see phase-3b-user-sync.md** — not needed to ship login.

## Shape the instance with the Clerk CLI (optional, for invite-only sites)

The same `clerk` CLI configures the instance as code (per app, from any
directory with `--app <id>`) — no dashboard clicking. For a members-only
site you typically want email-only + no social SSO + an allowlist:

- Inspect: `npx clerk config schema --keys session auth_email auth_password
  auth_access_control` ; pull current with `npx clerk config pull`.
- Apply a partial patch (dry-run first with `--dry-run`):
  `npx clerk config patch --json '{"auth_password":{"enabled":false},
  "connection_oauth_google":{"enabled":false},
  "auth_access_control":{"allowlist_enabled":true,
  "allowlist_blocklist_enforced_on_sign_in":true}}'`
  (email-code sign-in stays on via `auth_email`). A committed
  `clerk-config.json` + `clerk config patch --file` keeps it reproducible and
  reusable across the dev and prod instances.
- Invite-gate sign-ups by adding allowed emails to the allowlist:
  `npx clerk api /allowlist_identifiers -X POST -d
  '{"identifier":"<email>","notify":false}'` (per app with `--app <id>`).
- The email session-token claim (Phase 3 step 3) is just another patch:
  `clerk config patch --json '{"session":{"claims":{"email":
  "{{user.primary_email_address}}"}}}'`.

## Match the site's existing look and feel (do NOT invent a style)

Every visible element you add — the sign-in gate, any nav/top bar, an
admin console, cross-links — MUST look like it was always part of the
site. A bolted-on or default-styled element is a defect even if it
works. Before writing any markup:

1. **Read the site's design system first.** Find its stylesheet(s) and
   shared components (header/nav/footer). Note the exact tokens: fonts
   (heading vs body), color palette, logo/wordmark markup, spacing,
   button styles, radii. Reuse them verbatim — same classes, or copy the
   exact values. Never approximate; "close enough" reads as wrong (a
   32px logo next to the real 36px one, the accent colour off by a shade,
   a heading in the body font — all instantly visible).
2. **Reuse existing components.** If the site has a `<site-header>`/nav
   component, extend or replicate it exactly rather than inventing a new
   bar. New surfaces (admin, member area) should share ONE bar with the
   rest of the site — identical logo size, wordmark size, padding, max
   width.
3. **Theme third-party widgets to the brand.** A vendor's default chrome
   (Clerk's card + purple user-button avatar, Stripe's default inputs)
   is off-brand by definition. Use its theming API — Clerk `appearance`:
   strip the card to blend into a host card, set `colorPrimary`/fonts/
   radii to the site tokens, hide redundant headers, `overflow:visible`
   so it can't clip its own labels. Don't ship a raw vendor widget, and
   don't show an off-brand account avatar when a plain "Sign out" fits.
4. **Bump the cache-bust version** (`?v=`) on any shared asset you change
   (stylesheet, header script), on every page that embeds it — otherwise
   cached visitors keep the old copy and "your fix didn't deploy".
5. **You cannot see the render — so never claim a visual match.** State
   what you changed and ask the human to confirm; expect a round or two
   of "the logo's too small / it clips / that colour is wrong" and treat
   that as the normal loop, not something to argue with.

## Verification checklist

- [ ] Unauthenticated curl to the gated route → 401
- [ ] Signed-in browser session reaches the gated route
- [ ] `npx @odla-ai/cli smoke --env dev` still passes
- [ ] Every added UI element matches the site's existing look (fonts,
      palette, logo, spacing) — human-confirmed, not self-asserted
- [ ] Post-login redirect lands on a real URL (mind trailing-slash /
      directory-index routing), not a 404
- [ ] MIGRATION.md updated (gated routes, Clerk instance name)

Rollback: remove the auth layer / ungate the route; nothing outside dev
changed.

Done when: both auth outcomes verified and the human approves Phase 4
(their next obligation: a provider API key, used in THEIR shell only)
— or Phase 5 directly if they don't want AI.
