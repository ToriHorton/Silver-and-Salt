# Silver & Salt Capital: odla Migration State

Durable state for migrating the Silver & Salt Capital website from GitHub
Pages to odla on Cloudflare. Any agent resuming this work should read this
file first, then follow the runbook in `.agents/skills/odla-migrate/SKILL.md`
(read only the current phase's reference file). `npx @odla-ai/cli doctor`
confirms config state.

**Branch rule (from the project owner):** all migration work happens on the
branch `odla-conversion-test`. Do not merge to `main`, do not push anything
that changes production. GitHub Pages (main branch) stays live and untouched
until Phase 5 sign-off. Rollback before Phase 5 is always "do nothing."

## Phase checklist

- [x] **P0: Preflight** (completed 2026-07-11, human approved)
- [x] **P1: Static site on Cloudflare (dev tenant only)** (completed 2026-07-11, human approved)
- [x] **P2: Database (odla-db)** (completed 2026-07-11, awaiting human approval to enter P3)
- [x] **P3: Login (Clerk)** (completed 2026-07-11, owner verified in browser)
- [x] **P3b: User sync (mirror Clerk users into $users)** (completed
  2026-07-11: owner pasted the signing secret into Studio by hand; verified
  by firing user.updated events and watching both accounts appear in
  `/api/admin/members` within seconds)
- [x] **P4: AI** SKIPPED per owner decision 2026-07-11. Replaced with member
  area build-out (provisional page, members page, admin table), done.
- [ ] **P5: Production + DNS cutover** (the ONLY phase that touches
  production). Owner pre-requisite 2026-07-11: a payment flow in the join
  flow must be designed and built BEFORE cutover. The design is
  **PAYMENT-SPEC.md** (repo root, excluded from the public build): Tori's
  onboarding-scope.html brief translated to this stack. Phase P1 of that
  spec (payment core) plus the owner's open-item answers gate cutover.

## P0 inventory findings (2026-07-11)

### Site shape
- Plain static HTML/CSS/JS. No generator, no framework, no build step
  originally (dev server was `python3 -m http.server 3000`).
- 155 git-tracked files, assets directory is 3.4 MB.
- Custom domain: `silverandsaltcapital.com` (from `CNAME`). This becomes
  `links.prod` in Phase 5.
- GitHub Pages deploy: legacy build from branch `main`, path `/` (repo root).
  Confirmed via `gh api repos/ToriHorton/Silver-and-Salt/pages`.
- `.nojekyll` is present, so underscore directories (`_reference`, `_mockups`,
  `_research`, `_scripts`, `_archive`) are publicly served on the live site
  today. The build keeps them for parity.

### Privacy hazard (important for every future agent)
Local-only CEO tools are gitignored but present in the working tree:
`dashboard.html`, `ecosystem.html`, `granola-inbox.js`, `newsletter-data.js`,
`network/people.js`, `network/people-utah.js`. They must never reach a deploy
directory. The build script therefore copies git-tracked files only (via
`git ls-files`), never a recursive directory copy.

### Dynamic features (candidates for later phases)
- `join.html` posts the investor application to a Google Apps Script Web App
  (writes to a Google Sheet, emails tori@silverandsaltcapital.com and the
  applicant). See `FORM-SETUP.md`. Candidate to move to odla-db in P2.
- `membership-form-script.gs` is the Apps Script source, kept in the repo.
- `localStorage` used as lightweight storage in `landscape-map-page.js`,
  `open-research.html`, `recommendations.html`, `investor/welcome/index.html`,
  `marketing/one-pager.html`. Candidates for odla-db in P2.
- `mailto:` contact links on several pages (no change needed).
- `investor/` and `members/` areas are public today; candidates for Clerk
  login in P3.

### Build (the P0 deliverable)
- `npm run build` runs `_scripts/build-site.sh`, which produces a clean
  `dist/` (removed and rebuilt every run). `dist/` is gitignored.
- Copies git-tracked files only. Excludes agent/migration infrastructure:
  `.github/`, `.agents/`, `.claude/`, `.cursor/`, `.gitignore`, `AGENTS.md`,
  `GEMINI.md`, `CLAUDE.md`, `MIGRATION.md`. (`CLAUDE.md` and two `.claude/`
  files were technically reachable on GitHub Pages; the owner confirmed
  2026-07-11 that this is a bug in the current site, and the odla version
  fixes it by excluding them. Keep excluding agent infra from `dist/`.)
- Verified 2026-07-11: 151 files in `dist/`, `index.html` and `CNAME` and
  `styles.css` present, none of the gitignored private files present, and the
  only tracked files absent from `dist/` are the intentional exclusions above.

### Secret scan
Word-boundary grep over all tracked files for key-shaped strings (`sk-`,
`sk_live_`, `whsec_`, `ghp_`, `github_pat_`, `AKIA`, `-----BEGIN`): clean.
(An earlier pass flagged `task-placeholder` CSS class names; false positive.)

## P1 results (2026-07-11)

- Dev worker deployed: **https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev**
  (worker name `silver-and-salt-capital-dev`, Cloudflare account
  c4f7c2b79a8ec203b50e1e36790ef038, wrangler OAuth as cory.ondrejka@gmail.com).
- Config: `wrangler.jsonc` (assets binding on `dist/`), entry `src/worker.ts`
  (health endpoint + assets pass-through). Deploy with
  `npm run deploy:app:dev` ONLY; the top-level (prod) config must not be
  deployed before Phase 5.
- `/api/health` on the dev worker returns `{ ok: true }` with header
  `x-odla-worker: silver-and-salt-capital`.
- Owner decision 2026-07-11: `.claude`/agent-infra files being publicly
  served on GitHub Pages is a bug; the odla build intentionally excludes them.

### Parity (live silverandsaltcapital.com vs dev worker, 2026-07-11)

| Path | Old | New | Notes |
|---|---|---|---|
| `/` | 200 | 200 | body byte-identical |
| `/join.html` | 200 | 307 then 200 | body byte-identical; see html_handling note |
| `/join` | 200 | 200 | both hosts serve extensionless |
| `/manifesto.html` | 200 | 307 then 200 | title matches |
| `/utah-funding-2025.html` | 200 | 307 then 200 | title matches |
| `/styles.css` | 200 | 200 | byte-identical |
| `/org-data.js` | 200 | 200 | byte-identical; type text/javascript vs application/javascript (equivalent) |
| `/assets/ivy-baker-priest.jpg` | 200 | 200 | image/jpeg both |
| `/definitely-missing-xyz` | 404 | 404 | old shows GitHub's 404 page, new has empty body (no 404.html in repo) |
| `/api/health` | 404 | 200 | new endpoint, by design |

Known intentional differences (flag at cutover review):
1. `.html` URLs 307-redirect to extensionless on the worker
   (`html_handling: "auto-trailing-slash"`; GitHub Pages served both forms
   directly with 200). Every URL form stays reachable.
2. New content-type headers omit `; charset=utf-8` (pages declare
   `<meta charset>`, so rendering is unaffected).
3. 404 body is empty rather than GitHub's branded page. A branded
   `404.html` would be a nice addition later.
4. Agent-infra files (`CLAUDE.md`, `.claude/`) are excluded (owner-confirmed
   bug fix).

## P2 results (2026-07-11)

- App registered on the platform: `silver-and-salt-capital`. Dev db tenant:
  **`silver-and-salt-capital--dev`**. `links.dev` set to the workers.dev URL.
- `odla.config.mjs` at repo root; schema `src/odla/schema.mjs` (entity
  `applications`, modeling the join.html form); rules `src/odla/rules.mjs`
  stay **deny-all** (the Worker mediates with the app key; browsers get no
  direct db access). The scaffolded `ai` block was removed from the config:
  AI is off until Phase 4, and smoke compares config vs platform.
- Credentials: `.odla/credentials.local.json` (0600) and `.dev.vars` written
  by provision, both gitignored; `ODLA_API_KEY` pushed to the dev Worker as a
  Wrangler secret over stdin (never echoed). Non-secret `ODLA_*` vars live in
  `wrangler.jsonc` (top level = prod tenant for Phase 5; `env.dev` = dev).
- Routes (in `src/worker.ts`, before the assets fall-through):
  - `POST /api/applications`: validates the join-form fields, writes one row
    (status "submitted", uuidv7 id mirrored as attr). Optional client
    `submissionId` becomes mutationId `join:<id>` for exactly-once dedupe.
  - `GET /api/applications/count`: `{ count }` aggregate.
  - `GET /api/health`: unchanged from P1.
- Verified 2026-07-11: all routes exercised locally via `wrangler dev` and on
  the deployed dev worker (create, dedupe across deploys, 400 validation,
  api 404, assets still serving). `npx @odla-ai/cli smoke --env dev` passes:
  public-config ok, schema live (5 entities incl. reserved), count aggregate.
  One test row exists in the dev tenant (submissionId `dev-smoke-001`).
- join.html still posts to Google Apps Script; the form frontend moves to
  `/api/applications` in a later phase (production behavior unchanged).

## P3 status (2026-07-11, in progress)

- Clerk app: **"Silver & Salt Capital"** in the **Built Not Found**
  workspace, `app_3G6TCBtJKVZo6Aq5UGgz9URtDqV`, dev instance
  `ins_3G6TCDEMt5xW61E15wmaVFdhbv0`, frontend API
  `relieved-eft-93.clerk.accounts.dev`. Repo is `clerk link`ed. The dev
  publishable key is inline in `odla.config.mjs` (public by design);
  provision registered it (setAuth) and public-config serves
  `{ publishableKey, issuer }`. (History: a first app was created 2026-07-11
  in the wrong workspace; the owner deleted it and created this one.
  Re-provision overwrote the stale key on public-config, and the worker
  picked it up at runtime with no redeploy, as designed.)
- Worker (src/worker.ts): verifies Clerk session JWTs itself with `jose`
  (issuer from public-config, cached 5 min; JWKS cached per issuer). Role
  read from the session token `role` claim; absent or unknown claim means
  **provisional** (safe default).
- Routes: `GET /api/auth/config` (public bootstrap for the sign-in page),
  `GET /api/me` (any verified session; 401 otherwise),
  `GET /api/applications/count` (admin only; 401 unauth / 403 non-admin).
  `POST /api/applications` stays public: it is the application form.
- UI: `members/index.html` (served at `/members/`), styled after join.html
  (moss hero, text wordmark with brand-amp, white card, lime primary, Clerk
  appearance themed to the brand with card chrome stripped). Loads clerk-js
  v5 from the frontend API host derived from the publishable key fetched at
  `/api/auth/config`; post-login redirect target is `/members/` (a real URL).
- **Build gotcha for future agents:** `npm run build` copies git-TRACKED
  files only. A brand-new page 404s until `git add`ed.
- Session-token claims are SET (2026-07-11, via
  `clerk config patch`): `email` from the primary email address and `role`
  from `public_metadata.role`. (Note: the first, deleted instance 404'd on
  all `clerk config *` commands; this instance supports them, so claims are
  config-as-code after all.)
- First visual round (2026-07-11): owner reported the Clerk widget layout
  broken and the sign-up page off-brand. Causes and fixes: (1) element-level
  appearance overrides (card padding 0, hidden header) fought Clerk's
  internal layout; now brand is carried by appearance VARIABLES only and
  Clerk renders its own card directly on the page field (the white host card
  shows only for loading and the member panel). Lesson for future agents: do
  not override Clerk `elements`, theme with `variables`. (2) The "Sign up"
  link led to Clerk's HOSTED page, which uses dashboard theming (dark,
  purple); sign-up now mounts locally at `/members/?view=sign-up` with the
  same appearance.
- Owner's account: `user_3GMsLnTbZAfN5p6Qxv4b4cFRvH6`
  (cory.ondrejka@gmail.com, verified). Sign-up HAD succeeded; the hosted
  page just lost the redirect. `public_metadata.role` set to `"admin"` via
  `clerk api` 2026-07-11.
- Role metadata note: new sign-ups carry NO role metadata; the worker treats
  that as provisional by design. P3b (user sync) is the right place to stamp
  `role: "provisional"` onto the mirrored record at sign-up.
- **Human steps outstanding:**
  1. Sign IN (account exists) at
     https://silver-and-salt-capital-dev.cory-ondrejka.workers.dev/members/
     and confirm: on-brand widget, member panel with admin badge and
     applications count.
- **Open product decision (owner raised 2026-07-11):** the join.html
  application flow does not create a login account today (it still posts to
  Google Apps Script; unchanged since before the migration). Wiring it up
  (application -> odla-db row -> invite to create the provisional account)
  is scoped but needs the owner's go-ahead since it changes the production
  form's backend at cutover.

## P3b status and member-area build (2026-07-11)

- **Webhook endpoint created programmatically** (Svix portal token exchange
  via `npx clerk api /webhooks/svix`): endpoint
  `ep_3GMvkTIxg3P44be17rq72i6mtx7`, url
  `https://db.odla.ai/webhooks/clerk/silver-and-salt-capital--dev`, events
  `user.created`, `user.updated`, `user.deleted`. The signing secret was
  never printed or fetched.
- Signing secret pasted into Studio by the owner 2026-07-11 (write-only
  vault, `clerk_webhook_secret`). UPDATE 2026-07-11 (CLI 0.9.0): the vault
  now HAS a pipeable write path:
  `<producer> | npx @odla-ai/cli secrets set <name> --env dev --stdin`
  (and `secrets set-clerk-key` for the reserved `$clerk_secret` slot).
  Use the pipe whenever a command can print the secret; Studio remains the
  fallback for dashboard-only values. The old "no write path" note
  predates 0.9.0. Sync verified: `user.updated` events mirrored both dev
  accounts into `$users` within seconds.
- **Schema v2:** applications gained `meetingAt` (epoch ms, admin-set; the
  Google Calendar booking widget cannot call us back) and `clerkUserId`
  (linked lazily when a signed-in user's email matches). Pushed to dev.
- **Worker routes added:** `/api/me` now returns the caller's application
  summary (status, meetingAt) matched by email, and lazily stamps
  `clerkUserId`. New admin-gated routes: `GET /api/admin/applications`
  (newest 200), `PATCH /api/admin/applications/:id` (status and/or
  meetingAt; validates status enum; 404s on unknown id so upsert cannot
  create phantom rows), `GET /api/admin/members` ($users mirror).
- **Join flow wired (owner-approved):** join.html now ALSO posts the
  application as JSON to `/api/applications` (best effort; Apps Script keeps
  the Sheet row and both emails; on GitHub Pages the API call 404s
  harmlessly).
- **Auto account creation (owner-directed 2026-07-11):** POST
  /api/applications now creates the applicant's Clerk account server-side
  (`ensureClerkAccount` in src/worker.ts): Clerk BAPI `POST /users` with the
  secret key read at runtime from the tenant vault via
  `db.secrets.get("clerk_secret_key")`. Email stays unverified until first
  sign-in (owner accepted). 422 (account exists) counts as success; a
  missing vault key quietly no-ops (response carries `accountCreated`).
  Step 3 of join.html now says the account is ready and links "Sign in to
  your member area" (`/members/?email=...`, sign-in prefilled). The sk_
  NEVER appears in the repo, Wrangler, or chat; vault only (sanctioned by
  the phase-3b reference for backend needs).
- Secret key pasted by the owner 2026-07-11 and verified: application
  submit returns `accountCreated: true`, the Clerk account exists, and the
  webhook mirrors it into `$users` (visible in the admin Member Accounts
  table). Re-submitting a duplicate application heals a previously missed
  account creation (row dedupes, account create retries).
- **Studio has TWO Clerk-secret slots; both are now filled and they serve
  different consumers.** The Settings "Clerk secret key" field (End-user
  auth block) is platform-reserved (reads come back `forbidden` on
  `$`-names, `not_found` otherwise) and lets odla-db itself resolve users
  via Clerk. The worker's copy MUST be a generic env secret named
  `clerk_secret_key` for `db.secrets.get()`. At Phase 5, repeat BOTH pastes
  with the prod instance key.
- **Member area (members/index.html) role views:** provisional sees their
  application status and, once set, the introduction call date; member sees
  Training Material and Upcoming Events placeholders.
- **Split pages (owner-directed 2026-07-11):** the admin console moved to
  its own page at `/admin/` (admin/index.html); `/members/` is member-only
  and shows admins an "Admin console" button. Shared auth bootstrap lives
  in `assets/member-auth.js?v=1` (bump the ?v= on change). The console's
  two former tables (Applications, Member Accounts) were duplicative
  (auto account creation put everyone in both) and merged into ONE People
  table: person, email, role select, application status select, meeting
  datetime, one Save per row.
- **Unified people API:** `GET /api/admin/people` joins applications,
  live `$users` rows (tombstoned `deleted: true` rows are skipped: the
  webhook keeps deleted Clerk users as tombstones), and roles fetched from
  Clerk BAPI with the vault key (single page of 100; paginate when the
  community outgrows it). `POST /api/admin/people/role` updates
  `public_metadata.role` (enum-validated; admins cannot change their own
  role; 503 if the vault key is missing). The old
  `GET /api/admin/applications` and `GET /api/admin/members` routes were
  REMOVED; `PATCH /api/admin/applications/:id` remains for row saves.
- **Verified 2026-07-11** (local + deployed dev): admin JWT (minted via
  Clerk BAPI sessions API) passes /api/me with role admin; applications
  list/patch round-trips (bad status 400, unknown id 404); provisional JWT
  sees their application with meetingAt and gets 403 on admin routes;
  unauthenticated requests 401; smoke passes.
- **Dev test fixtures:** Clerk user test.applicant@example.com
  (`user_3GMxDnbTiVSiCwog8oNyrNZuPCW`) matching the seeded application row
  (submissionId `dev-smoke-001`, status call_scheduled, meeting
  2026-07-20 15:00 UTC). Session-mint pattern for API testing:
  `clerk api /sessions -X POST` then `/sessions/<id>/tokens`.

## Payment flow P1 (2026-07-11, built; awaiting Stripe keys)

PAYMENT-SPEC.md P1 is implemented on the dev worker:
- Schema: applications gained phone/state/groupId/stripe ids/renewalAt/
  ack timestamps/prepEmailSentAt/canceled; new `groups` (per-brand settings
  and copy, seeded via `_scripts/seed-groups-dev.mjs`) and `emailLog`
  entities. Status enum now includes paid_pending_vetting and refunded.
- Worker: GET /api/groups/:id/join-config (public copy + line items +
  paymentsReady), POST /api/payments/subscription (vault
  `stripe_secret_key`; 503 until pasted), POST /api/webhooks/stripe
  (HMAC-verified; invoice.paid / charge.refunded /
  customer.subscription.deleted; idempotent by event id), admin
  POST .../approve (status + role promotion with Clerk email-lookup
  fallback + onboarding email; fires once, never from payment) and
  POST .../refund (full refund + subscription cancel; webhook flips
  status). Booking route now also sends the prep email once and accepts
  paid_pending_vetting.
- Email: @odla-ai/email construction behind an EmailSender seam;
  transport is log-only until Phase 5 wiring; dev sends redirect to
  cory.ondrejka+debug@gmail.com with a [dev] prefix; all sends audited in
  emailLog. Templates live on the group row.
- join.html: three-step tracker (payment step appears only when
  paymentsReady, so GitHub Pages behavior is unchanged), phone/state
  fields, disclaimer checkbox gating submit, refund-policy checkbox
  gating the Payment Element reveal, Express Checkout + Payment Element
  with brand Appearance, redirect-return handling, paid status callout on
  the booking step.
- Admin console: Payment column (paid/refunded/unpaid + renewal), Approve
  and Refund row actions. Member area: membership/renewal line and a
  refunded state.
- Clerk users now carry public_metadata.profile (phone, state, whoYouAre,
  focus, linkedin) from the application (owner-directed).
- **Stripe configured and E2E VERIFIED 2026-07-11** (Test Mode). Owner
  pasted both vault secrets; `_scripts/setup-stripe-dev.mjs` created
  product `prod_UrrarmxdVJJMun`, the $900/year price, and webhook endpoint
  `we_1Ts7rX3sLwQtiao1eDcVrBld`. Note: the account runs the 2025+ Stripe
  API, so the client secret comes from `latest_invoice.confirmation_secret`
  (invoices carry no payment_intent) and refunds locate the customer's
  earliest succeeded charge. Full acceptance run: $900 charged with the
  test card -> `invoice.paid` verified the signature and flipped the row to
  paid_pending_vetting with renewal 2027-07-11 and both emails logged ->
  Approve promoted the role to member and logged the onboarding invite ->
  a second applicant paid and was refunded via the console action
  (90000 cents returned, subscription canceled, row flipped to refunded
  with canceled=true by the webhooks). Remaining for the payment flow:
  owner browser pass of the payment step UI, Apple Pay domain
  registration, P2 referrals, P3 accreditation panel, P4 monitoring, and
  the prod-instance repeats at Phase 5.

## Booking capture (2026-07-11)

Google's appointment widget is a sealed iframe: no callback ever reaches the
page or the worker, so bookings were invisible to the db. Two-layer answer:

1. **Self-report at confirm (SHIPPED):** step 2 of join.html gained an
   optional "Your booked time" field beside the existing "I've booked my
   time" checkbox. On Continue the page POSTs
   `/api/applications/<id>/booking` (the uuid from the submit response acts
   as a capability; also kept in sessionStorage across refreshes). The
   route sets status to call_scheduled and meetingAt when provided,
   validates the time to a sane range, and NEVER moves status backwards
   (applies only from submitted/call_scheduled, so admin progression wins;
   verified). The member area and admin table show it immediately.
2. **Authoritative calendar sync: @odla-ai/calendar (Phase 2b), BLOCKED ON
   PLATFORM as of 2026-07-11.** The package (0.1.0, pinned) and CLI 0.10.0
   calendar verbs are installed, `odla.config.mjs` carries the full
   `calendar.google` block (primary calendar, organizerSelf +
   requireAttendees filters, attendeePolicy "full", the appointment page as
   bookingPageUrl.dev), doctor validates it, and the owner approved a fresh
   device handshake. But the platform registry rejects the service
   ("unsupported service: calendar") and `calendar connect/status` 404:
   the server rollout lags the npm release. "calendar" is therefore parked
   OUT of `services` (leaving it in breaks every provision run). TO RESUME:
   add "calendar" back to services, run provision, complete the Google
   consent (owner's calendar account; consent is read-only
   calendar.events.readonly), then `calendar calendars/status` + smoke, then
   wire $bookings-to-application correlation by attendee email (respect the
   existing no-status-regression guard) and remove the join step 2
   self-report field. The Apps Script bridge idea is superseded.

## Auth and roles design (owner-specified 2026-07-11)

Clerk is the auth provider. Three user states, stored as a role on the
mirrored user record and enforced by db rules:

1. **provisional**: signed up but has not completed the intro interview.
2. **member**: completed the interview.
3. **admin**: everything members get, plus internal stats, dashboards,
   member lists, and similar internal tooling.

Implications for later phases: the gitignored local-only CEO tools
(`dashboard.html`, `ecosystem.html`, private network data) are candidates to
return to the site behind the admin role once P3 rules enforce it. Promotion
provisional to member happens after the interview; member to admin is
owner-managed.

## Non-negotiable rules (from the runbook, restated)
1. Old site stays live and untouched until Phase 5 sign-off.
2. Dev only until Phase 5: `envs: ["dev"]` in `odla.config.mjs`; dev tenant is
   `<appId>--dev`. Verify tenant before any write or deploy.
3. Never print, paste, or commit a secret. Read
   `.agents/skills/odla-migrate/references/secrets-map.md` before any command
   that touches a credential.
4. Never `git add -A` without reading `git status` first.
5. Never widen a db rule to silence a 403; any rules change is a human
   checkpoint.
6. Never rotate keys or o11y tokens unless the human explicitly asks.

## Log

- **2026-07-11 (P0):** Created branch `odla-conversion-test`. Ran
  `npx @odla-ai/cli setup` (installed `.agents/skills/` runbooks plus
  per-harness adapters: `.claude/skills/`, `.cursor/`, `.github/`, `AGENTS.md`,
  `GEMINI.md`). Completed inventory above. Added `_scripts/build-site.sh` and
  the `build` npm script; gitignored `dist/`. Secret scan clean. Next human
  obligations: approve entering P1, sign in at https://odla.ai/studio (open
  Docs, "Moving your site to odla"), create a Cloudflare account, and run
  `wrangler login`.
- **2026-07-11 (P1):** Owner approved P1; wrangler already logged in. Added
  `wrangler.jsonc`, `src/worker.ts`, npm scripts `dev:worker` and
  `deploy:app:dev`. Deployed dev worker and recorded parity table (all paths
  match; four intentional differences listed above). Verified `wrangler dev`
  locally with no watcher errors, and GitHub Pages still serving unchanged.
  Next human obligations: approve entering P2 (database), sign in at
  https://odla.ai/studio, and approve a handshake code when the CLI asks.
- **2026-07-11 (P2):** Owner approved P2 and specified the three-state role
  model (provisional/member/admin, recorded above). Installed pinned
  @odla-ai/cli 0.8.0 + @odla-ai/db. `init` scaffolded config/schema/rules;
  owner approved handshake code SAV4-3DR4 in Studio; provision created the
  app, dev tenant, key, and pushed schema + deny-all rules. Added ODLA_* vars
  to wrangler.jsonc and /api/applications routes to the worker; all verified
  locally and deployed; smoke passes. Next human obligations: approve entering
  P3 (Clerk login), create a Clerk account/app, and paste the publishable key
  (pk_..., not the secret key) when asked.
