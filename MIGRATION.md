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
  SUPERSEDED 2026-07-13 (owner-directed): the Apps Script dual-submit is
  REMOVED. The form posts only to `/api/applications`; the Sheet row and
  the Gmail sends from the owner's account are gone (dev tests were
  spamming both). `membership-form-script.gs` and `FORM-SETUP.md` are
  deleted from this branch (git history keeps them; production main still
  runs its own copy until cutover). Note: an unpaid application now
  generates no admin email; the admin notification fires on payment
  (invoice.paid), and the console lists everything.

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

## Scheduling v2: odla-db is the source of truth (2026-07-14, owner-directed)

@odla-ai/calendar 0.2.0 replaced the read-only mirror with a live booking
proxy (FreeBusy, computeBookableSlots, create/reschedule/cancel with Meet
links and Google-sent invites; `$bookings` mirror namespaces are GONE
platform-side). Owner directive implemented:

- **`meetings` entity is canonical** (schema): startAt/endAt/timezone/
  status/googleEventId/meetUrl/htmlLink plus drift fields. Google Calendar
  is a projection carrying the invitation email and Meet link.
- **First-party booking**: join step 3 is now an on-brand slot picker
  (day chips + time grid). `GET /api/schedule/slots` computes availability
  (Google FreeBusy + group scheduling rules in `groups.schedulingJson`:
  45 min, Mon-Fri 9-17 America/Los_Angeles, 24h notice, 14-day window);
  `POST /api/schedule/book` books or REBOOKS (existing event is
  rescheduled so the invite thread and Meet link survive), writes the
  meeting row, updates the application, sends the prep email once. The
  Google appointment-schedule iframe, the "have you booked" checkbox, and
  the self-report route are all gone. Member page links "Join the video
  call" (meetUrl) and "Change your time" (join.html?reschedule=<appId>).
- **Drift detection, never adoption**: `/api/admin/meetings` compares
  canonical meetings against `availability.upcoming()` by eventId and
  flags `time_changed` (with Google's time shown) or `gone_from_google`
  on the admin Introduction Calls card; admin can Cancel (removes the
  Google event, guest notified). Our data never changes from drift.
- **CONNECTED AND E2E VERIFIED 2026-07-14.** Root cause of the CLI
  failures found in source: 0.11.2's status parser throws on any access
  mode except "read", while the pivoted platform reports access "book"
  (one stale line; reported to odla). Workaround used the CLI's own
  registry endpoints directly (`POST
  /registry/apps/<app>/calendar/google/connect?env=dev` with the dev
  token -> consentUrl -> `open` in the owner's browser -> poll attempt
  until healthy). Live E2E: 87 slots computed from real FreeBusy; a
  fresh application booked one; canonical meeting row written
  (eventId + meetUrl), Google sent the invite with a real Meet link,
  application flipped to call_scheduled with matching meetingAt, prep
  email logged, admin Introduction Calls shows In sync. Remaining
  manual test: owner drags/deletes the event in Google Calendar and
  confirms the drift flag appears on /admin/ (never auto-adopted).
- **UI-COMPONENT-SPECS.md** (repo root, excluded from build) requests a
  buildless SlotPicker from the odla team; join.html's hand-rolled picker
  is the interim.
- Note for future agents: CLI 0.11.2 validates the legacy config key
  `calendars` and rejects 0.2.0's `availabilityCalendars`; config uses
  the legacy name until the CLI catches up.

## Email delivery: Cloudflare Email Service (2026-07-15, LIVE ON DEV)

Outbound email moves from the log-only stub to Cloudflare Email Service via
the Worker's `send_email` binding (owner-directed 2026-07-15). Dev sends come
from the odla.ai domain (already onboarded to Email Service on this
Cloudflare account); the Phase 5 cutover switches EMAIL_FROM to a
silverandsaltcapital.com address, which requires onboarding that domain to
Email Service in the Cloudflare dashboard FIRST (recorded as a P5
pre-requisite in wrangler.jsonc comments).

- **Transport** (src/email.ts): `resolveTransport(env.SEND_EMAIL,
  env.EMAIL_FROM)` returns the Cloudflare sender when both exist, log-only
  otherwise. Payload from = `{ name: group.name, email: EMAIL_FROM }`;
  group.replyTo rides as Reply-To (it needs no verification). Fail-safes:
  outside prod, sends still redirect to group.debugEmail with a "[dev]"
  subject prefix, and a dev tenant with NO debug inbox falls back to
  log-only, so test applicants can never receive real mail.
- **Config** (wrangler.jsonc): `"send_email": [{ "name": "SEND_EMAIL" }]`
  plus `EMAIL_FROM` var in BOTH the top level (prod,
  membership@silverandsaltcapital.com, deployed only at Phase 5) and env.dev
  (silver-and-salt-capital@odla.ai). Wrangler envs inherit no bindings, so
  dev declares its own.
- **Exactly-once**: real delivery makes webhook retries dangerous, so
  emailLog gained `dedupeKey` (indexed) and `error` attrs (schema change).
  sendTemplated checks for a prior successful row with the same dedupeKey
  before delivering; failure rows record the transport error code and never
  carry the dedupe mutationId, so a retry after failure can succeed and
  still be logged.
- **Send-on-action controls** (owner request): each template in
  groups.emailTemplates now carries `enabled` (absent = enabled).
  sendTemplated skips disabled templates; the admin test route forces past
  the flag. Booking stamps prepEmailSentAt only when a send actually
  happened, so re-enabling the prep email lets a later rebooking send it.
- **Admin console** (/admin/ Email tab): Email Delivery card (read-only
  transport + verified from address, editable notification/reply-to/debug
  addresses), per-template "Send automatically" toggle and "Send me a test"
  button (POST /api/admin/email/test, admin-gated, honest about
  redirect/log-only), and a Recent Sends card (GET /api/admin/email/log,
  newest 50, shows failures). GET/PUT /api/admin/group/email now carries
  enabled flags plus envName/transport/fromEmail.
- **Verified 2026-07-15 (local)**: 30-check behavioral harness over the
  bundled email module (transport selection, redirect, no-debug fallback,
  enabled/force, dedupe suppression and retry-after-failure, failure rows);
  wrangler dev boots with the binding (simulated locally), db routes serve,
  admin routes 401 unauthenticated; admin inline JS syntax-checked; brand
  check errors are all pre-existing (index.html, brand-book.html, _archive).
- **DEPLOYED AND VERIFIED 2026-07-15** (owner approved the schema push and
  re-ran `clerk login`): provision pushed the emailLog schema, the dev
  worker deployed with the live SEND_EMAIL binding, and admin-JWT curls
  against the deployed worker confirmed: config reports transport
  "cloudflare" from silver-and-salt-capital@odla.ai with all four enabled
  flags true; test sends of prepEmail and adminNotification returned ok
  with Email Service receipts (redirected to the debug inbox); the send
  audit shows both new rows as transport cloudflare above the historical
  log-only rows. A sender-verification failure would have surfaced as
  E_SENDER_NOT_VERIFIED in the audit, so odla.ai is confirmed onboarded.
  Remaining owner niceties: eyeball the two "[dev]" emails in
  cory.ondrejka+debug@gmail.com and click through the Email tab (toggles,
  test buttons, Recent Sends). Note: `smoke --env dev` currently stops
  after its public-config check when the CLI 0.11.2 calendar status parser
  hits the platform's "book" access mode (same known bug as Scheduling v2);
  provision's own output covered the schema confirmation.

## Billing dashboard and tab deep links (2026-07-15)

Owner feedback after the email round: deep links into the tabbed admin page
need a query or anchor, and the admin needs a billing dashboard. Both done
and verified on the deployed dev worker.

- **Tab deep links**: /admin/ now accepts `?tab=<people|billing|calendar|
  settings|email>` (calls aliases to calendar since the 2026-07-15
  consolidation) as well as the `#hash` form (mail clients rewrite links
  and drop fragments more often than queries, so emails use the query
  form). Switching tabs canonicalizes the URL back to the hash. The
  sign-in mount's fallbackRedirectUrl preserves path + query + hash, so
  the deep link survives an auth round trip. The adminNotification email's
  {{adminUrl}} now renders `<origin>/admin/?tab=people`.
- **Billing tab** (between People and Introduction Calls): summary stats
  (active memberships, annual run rate counting only what will renew,
  renewals within 60 days, past due, refunded) plus a Memberships table
  (person, application status, live subscription status with
  ends-at-renewal note, amount/interval, renewal date, links into the
  Stripe dashboard, test-mode aware). Data from GET /api/admin/billing
  (admin-gated): applications joined with one page of
  GET /v1/subscriptions?status=all (flags `truncated` at 100 rather than
  silently capping; note the 2025+ API keeps current_period_end on the
  subscription items). Stripe is the money source of truth; db rows
  contribute person and pipeline status. `billingReady: false` until the
  vault has the Stripe key, and the tab says so instead of erroring.
- **Verified 2026-07-15** on deployed dev with an admin JWT: billingReady
  true, testMode true, 7 active test subscriptions at a 630000-cent run
  rate, the refunded application showing its canceled subscription, both
  abandoned card-only tests showing incomplete_expired, dashboard links on
  every row; deployed page serves the billing tab and the ?tab= bootstrap.

## Preact conversion of the app pages (2026-07-15, owner-directed)

The owner called the "static site, no build step" framing stale: the app
surfaces (admin console, member area, join booking step) are applications,
and Preact keeps them cheap to serve. Marketing pages stay untouched on the
copy-through path.

- **Build**: Vite + @preact/preset-vite (vite.config.mjs), run by
  `_scripts/build-site.sh` AFTER the git-tracked copy; bundles land in
  dist/assets/app/ (admin.js, members.js, join-picker.js + shared Preact
  chunks, ~10 KB core). Entry names are stable; pages reference them with
  the repo's ?v= convention. The copy pass now also EXCLUDES src/,
  wrangler.jsonc, vite.config.mjs, odla.config.mjs, and package*.json from
  dist (none exist on production main; the worker source was being served
  publicly, now 404s).
- **Admin console** (src/app/admin/, five modules + shared src/app/lib.js
  and src/app/slot-picker.jsx): the ~1,100-line inline script became
  Preact components with IDENTICAL markup/classes, so the page CSS is
  unchanged. All five tabs stay mounted (hidden) so data loads in parallel
  at sign-in like before. People rows remount per reload (generation key)
  to match the old full-rebuild edit-state semantics. The admin reschedule
  picker and the join picker now share one SlotPicker component
  (class-contract parameterized), replacing two hand-rolled copies.
- **Member area** (src/app/members.jsx): same conversion; hero text
  updates and the Clerk sign-in mount stay page-owned DOM.
- **Join page**: ONLY the step 2 slot picker converted
  (src/app/join-picker.jsx). The island contract is
  window.SSCJoinPicker.load({ getApplicationId, onBooked }) with a queueing
  shim in the page for the classic-script/module load race. The form and
  payment flow stay vanilla deliberately: they are the card-entry path that
  needs a human browser pass to re-verify, and they convert separately.
  The @odla-ai/ui SlotPicker/Tabs/DataTable swap-in happens when the ui
  team ships (DataTable spec was handed off 2026-07-15; the buildless
  custom-element requests in UI-COMPONENT-SPECS.md are superseded by this
  conversion).
- **Verified 2026-07-15**: 10-check render-to-string suite over the
  components with fixture data (SlotPicker day/time chips + aria-pressed,
  every tab's loading skeleton, PersonRow variants incl. self-role lock
  and refunded-row action hiding); build produces the bundles; local and
  deployed workers serve all three pages + bundles 200 and /src/worker.ts
  404; join.html inline script still parses. NOT yet verified (needs the
  owner's browser): admin tab click-through, members sign-in views, and a
  join-flow booking end to end.

## Admin Calendar tab and branded 404 (2026-07-15)

- **Calendar tab** (ADMIN-CALENDAR-SPEC.md, owner-requested 2026-07-14):
  sixth admin tab with three views: By user (sections per applicant,
  upcoming first, person filter), Agenda (@odla-ai/ui CalendarAgenda,
  upcoming only), and Month (@odla-ai/ui CalendarMonth, prev/today/next
  navigation, count-capped day chips). The Preact conversion made the ui
  React components directly consumable, so the spec's zero-build
  constraint (and its buildless fallback options) are obsolete. Clicking
  a meeting anywhere opens a detail panel with drift badge, Meet and
  Google Calendar links, and working Reschedule (shared SlotPicker) and
  Cancel actions. Deep links: #calendar/<view>[/<YYYY-MM>|/<person>];
  the tab owns the hash while active. calendar.css is vendored at
  assets/odla-ui/calendar.css (same contract as tabs.css) and the admin
  page's --ui-* token map gained the missing tokens. Worker:
  GET /api/admin/meetings now accepts ?all=1 (full history, cap 500) and
  ?from=&to= (epoch ms window); the default stays upcoming-50 for the
  Introduction Calls table.
- **Branded 404** (404.html at repo root, git-tracked): serves on both
  hosts' conventions (Cloudflare assets not_found_handling "404-page";
  GitHub Pages picks it up at cutover, closing P1 known difference 3).
  Cloudflare caveat, verified live: the branded body serves for browser
  NAVIGATIONS (Sec-Fetch-Mode: navigate skips the worker on 2025-04+
  compatibility dates); programmatic fetches through the worker fall
  through to an empty-body 404, which is correct for API-ish requests.
- **Verified 2026-07-15**: 13-check render suite now covers CalendarTab
  pills/loading plus CalendarMonth/CalendarAgenda under preact/compat
  with DST-week fixtures (US fall-back, day placement by data-date);
  deployed dev serves calendar.css, the branded 404 on navigation, and
  all three meetings query modes (default 50, all=1, empty window) under
  an admin JWT. Owner browser pass pending: click through the three
  views, reschedule + cancel from the detail panel, and the month grid
  on a phone width.

## @odla-ai/ui 0.6.0: DataTable adoption (2026-07-15)

The ui team shipped the DataTable we spec'd (0.5.0 lacked it; 0.6.0
published later the same day, with FilterChips/Segmented and marketing
components alongside). Adopted:

- **People, Billing (Memberships), and Recent Sends** are now
  @odla-ai/ui DataTable: click-to-sort headers (aria-sort), built-in
  filter input with live match count, and loading/empty/no-matches slots
  wired to the console's existing spinner and empty-note styles.
- **People edit model**: rows carry a mutable `draft` written by
  UNCONTROLLED selects/inputs; the actions cell reads the draft at save.
  DataTable keys rows by rowKey and MOVES live tr nodes on sort/filter,
  so in-flight edits survive reorder; a generation counter in the rowKey
  remounts rows onto fresh server state after any mutation. This is
  exactly the acceptance case from the spec (live controls in cells, no
  behavior loss).
- **Introduction Calls stays hand-rolled** deliberately: its inline
  reschedule expansion row has no slot in DataTable v1 (noted for the ui
  team as follow-up feedback). SUPERSEDED later on 2026-07-15: the tab
  itself was retired into the Calendar tab (see the consolidation
  section above), which removes the last hand-rolled table.
- CSS: table.css + data-table.css vendored (tabs.css re-vendored: 0.6.0
  switched to child selectors and added a .tabs-trailing slot; calendar
  css unchanged). Tokens gained --ui-good and --ui-space-6, and a scoped
  override block pins DataTable chrome to the console's existing table
  look (uppercase headers, cell rhythm, no height cap or sticky tint).
  Worker: billing rows and email-log rows now carry `id` for rowKey.
- **Verified 2026-07-15**: the render suite (13 checks) now pushes
  fixture rows through the real DataTable with the real People columns
  (paid row with sort/filter chrome, self-role lock, refunded action
  hiding, empty-state slot); deployed dev serves the new CSS and both
  APIs return row ids. Owner browser pass: sort and filter each table,
  then confirm an in-flight edit survives a sort.

## Introduction Calls folded into Calendar (2026-07-15, owner-directed)

The owner flagged the Introduction Calls and Calendar tabs as duplicative
(same meetings, same Reschedule/Cancel against the same endpoints).
Calendar was the superset, so the Introduction Calls tab is retired:

- **Needs attention strip** in the Calendar tab, above all three views:
  every out-of-sync meeting (drift time_changed or gone_from_google,
  not cancelled), past or future, with the applicant, our time, and the
  drift badge; clicking opens the existing detail panel. This preserves
  the old table's drift-at-a-glance duty and the flagged-never-adopted
  doctrine. The "updated from Google" adoption note moved into
  DriftBadge, so the detail panel and by-user rows both show it.
- **Back-compat**: #calls and ?tab=calls alias to the Calendar tab and
  the URL canonicalizes to #calendar/agenda. No email ever linked
  tab=calls (the worker emits only ?tab=people).
- **Deliberate drops**: the per-row Meet link (one click away in the
  detail panel) and the optimistic-reschedule-with-rollback flow
  (Calendar's confirm-then-reload is live-verified and simpler).
- **Deleted**: src/app/admin/calls.jsx, its tab button/panel, and the
  orphaned #meetings-table CSS. The resched-* styles stay (the detail
  panel's picker uses them). GET /api/admin/meetings is unchanged; the
  console now always calls it with ?all=1.
- This also retires the console's last hand-rolled table, closing the
  local "DataTable needs a row-expansion slot" gap without waiting on
  the ui team.
- **Verified 2026-07-15**: render suite (15 checks) covers the strip
  (moved + removed flagged with Google's time, clean and cancelled rows
  excluded, empty strip renders nothing); build has zero
  meetings-table/CallsTab references; deployed dev serves the console.
  Owner browser pass: #calls lands on the agenda, drag/delete an event
  in Google Calendar and watch the strip, then Reschedule/Cancel from
  the detail panel.

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
   the server rollout lagged the npm release. UPDATE 2026-07-12: the
   rollout landed; provision now ENABLES the service and registers the
   config (status shows calendars/policy/bookingPageUrl, zero scopes,
   bookingCount 0). The remaining blocker is platform-side:
   `calendar_google_oauth_not_configured` (503) when starting consent,
   i.e. the connector service is missing its own Google OAuth client
   credentials. Nothing app-side can fix it. CAVEAT while waiting:
   provision exits at the consent step AFTER the calendar steps but BEFORE
   schema/rules push; to push schema changes in the interim, temporarily
   comment "calendar" out of services for that one run. TO RESUME once
   odla configures their Google OAuth app: run provision (or `calendar
   connect --env dev`), complete the read-only Google consent on the
   calendar account hosting the appointment schedule, verify
   `calendar calendars/status` + smoke, wire $bookings-to-application
   correlation by attendee email (respect the no-status-regression
   guard), then remove the join step 2 self-report field. The Apps Script
   bridge idea is superseded.

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

## CRM admin layer (@odla-ai/crm) (2026-07-16, on dev; owner browser pass pending)

Adopted the new `@odla-ai/crm` module (v0.1.1) as the admin relationship layer,
in a **hybrid** with the existing operational system (owner-chosen):

- **Authoritative flows stay as-is.** `applications.status` remains the
  pipeline; join form, Stripe webhooks, meetings/scheduling, and Clerk
  promotion are untouched. A one-way sync (`src/crm-sync.mjs`,
  `syncPersonToCrm`) projects each person into a `crm_record` of type
  `person`; `crm_record.stage` MIRRORS `applications.status` (never
  authoritative). Sync fires after every status write (join, book, webhook,
  approve, PATCH) and is `.catch`-wrapped so a CRM hiccup can never 5xx an
  operational flow. `POST /api/admin/crm/sync` backfills/repairs (idempotent).
- **What the CRM owns** (no operational equivalent before): tags, notes,
  follow-up tasks, saved views, contact-consent, and audited ad-hoc/template
  email — surfaced in a new People record panel (`src/app/admin/people-crm.jsx`,
  built on `@odla-ai/crm/ui` under `preact/compat`). Lifecycle actions in the
  panel (Approve/Refund/stage) call the EXISTING `/api/admin/applications/:id`
  routes; the worker mirrors the result back. Model in `src/crm.mjs`.
- **Email**: two free-form classes (`personal` transactional, `announcement`
  marketing with unsubscribe) plus a `check_in` template, all consent-gated and
  audited in `crm_email_log`. Kept separate from the four operational lifecycle
  templates in `groups.emailTemplates` (do not merge — double-send risk).
- **Routes** mounted at `/api/crm/*` (`createCrmRoutes`), admin-gated by reusing
  `verifyUser`; the raw Cloudflare transport is injected (CRM does its own
  consent/dev-redirect/audit). Deps bumped: `@odla-ai/ui` 0.6.0->0.7.0 (full
  `assets/odla-ui/odla-ui.css` now vendored), added `@odla-ai/crm@0.1.1`.
- **Super-admins + admin promotion (2026-07-16).** A record-panel "Access" card
  (super-admin-only) promotes a person's Clerk role, incl. to `admin`. Gated by
  a **super-admin** tier stored in a new `superAdmins` odla-db table that is
  READ-ONLY from the app: deny-all rules like every namespace AND no worker
  route ever writes it, so it can only be set in the odla Studio data browser
  (rationale: browsers hold no db credential, so an injected page script has no
  write path). Worker: `isSuperAdmin(db,email)` (read-only query, matched to the
  caller's verified email); `/api/me` returns `superAdmin` for admins; new
  `GET /api/admin/people/access?userId=`; `POST /api/admin/people/role` now
  refuses to create/change an `admin` (or touch a super-admin) unless the caller
  is a super-admin, and never writes the super-admin flag. Dev bootstrap:
  `cory.ondrejka@gmail.com` seeded into `superAdmins`; in prod the owner adds
  rows in Studio (keyed by lowercased email).
- **Admin IA restructure (2026-07-17, owner-directed).** Top tabs collapsed to
  three: **Dashboard** (new `GET /api/admin/dashboard`: applications total/7d/30d,
  live revenue + new-paid 7d/30d, pipeline by stage, upcoming-calls agenda +
  drift; plus the full billing table) / **People** (the CRM two-pane) /
  **Settings** (call + email settings merged). Old billing/calendar/email/calls
  tabs fold in; legacy `?tab=` names redirect. The People rail is now a custom
  role-styled list (admins/members badged, active row highlighted; roles from
  `/api/admin/people`) instead of the packaged CrmList. The record detail is now
  six sub-tabs: Info / Comms / Comms history / Scheduling (reschedule/cancel) /
  Billing / Notes. The standalone month/by-user Calendar view was retired in
  favor of the Dashboard agenda + per-person Scheduling (owner choice).

**Upstream incompatibility — NOW RESOLVED (2026-07-17).** The brand-new
`@odla-ai/crm@0.1.1` and `@odla-ai/cli@0.13.x` were briefly published ahead of a
fully-compatible `@odla-ai/db`. Both issues are now fixed upstream and the
workaround shim has been removed:
  1. [FIXED by db 0.6.5] `@odla-ai/cli@0.13.x` imported `collectToken` from
     `@odla-ai/db`, which 0.6.4 did not export -> the CLI failed at module load.
     0.6.5 exports it, so `odla-ai` loads again.
  2. [FIXED by crm 0.1.2 + db 0.6.6] `@odla-ai/crm@0.1.1` read rows via
     `where:{id}` and wrote `null` for empty slot columns, which db 0.6.4/0.6.5
     didn't support (filters only DECLARED indexed attrs; rejects `null`). This
     was carried by a `wrapCrmDb` shim (id-stamp + null-strip) plus a manual
     id-declaration in the provision script. **crm 0.1.2 now mirrors the entity
     id as an attr itself, no longer writes null slots, and its `CRM_SCHEMA`
     declares that `id` attr** — so on 0.1.2 + db 0.6.6 the full op surface
     passes UNSHIMMED (re-verified 2026-07-17). The shim and the manual
     id-declaration were removed; the injected `AdminDb` is passed straight
     through.

Provisioning still uses `_scripts/provision-crm-dev.mjs` (pushes the merged
schema + seeds `crm_config` with the app admin key — no dev-token re-auth). The
official `npx odla-ai provision` also works again now (CLI loads, CRM_SCHEMA is
self-consistent) if you want it to lay down the explicit deny-all crm rules;
until then those namespaces rely on default-deny + no browser db credential.

**Verified on dev (2026-07-16, re-verified unshimmed 2026-07-17):** provision
pushed the crm_* namespaces + seeded config; backfill synced 20 people (stage +
billing snapshot + consent channels + Clerk link all correct, 0 errors); the
full CRM op surface (create/read/update/setStage/tags/notes/tasks/consent/email)
passes against the live dev tenant (now UNSHIMMED on crm 0.1.2 + db 0.6.6);
worker bundles and boots; `/api/crm/records`
and `/api/admin/crm/sync` return 401 unauthenticated; admin island builds with
the CRM UI under Preact; existing tabs compile under ui 0.7.0. **Remaining: the
owner's browser pass** — sign in at `/admin/` as admin, exercise the People
record panel (open a record, add a note/task/tag, save a view, send a free-form
and a template email to a test person, confirm consent gating), confirm
Approve/Refund still drive the operational routes and the stage mirrors, and
eyeball Billing/Calendar/Email-Settings under ui 0.7.0. New files are untracked;
`git add` before the next `npm run build` (build-site.sh copies git-tracked
files only — `assets/odla-ui/odla-ui.css` especially).

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
- **2026-07-15 (calls/calendar consolidation):** Owner flagged the
  Introduction Calls and Calendar tabs as duplicative; folded the former
  into the latter with a Needs attention drift strip, a #calls alias, and
  the last hand-rolled table retired. Deployed to dev.
- **2026-07-15 (DataTable):** Updated to @odla-ai/ui 0.6.0 and adopted
  the requested DataTable across People, Billing, and Recent Sends
  (sortable, filterable, state slots; live cell controls preserved).
  Introduction Calls keeps its hand-rolled table until DataTable grows a
  row-expansion slot. Deployed to dev.
- **2026-07-15 (calendar tab + 404):** Built the ADMIN-CALENDAR-SPEC.md
  Calendar tab on the new Preact build using @odla-ai/ui
  CalendarMonth/CalendarAgenda (first real consumption of the ui React
  components in this stack), extended /api/admin/meetings with range
  params, and added the branded 404 page. Deployed to dev; owner browser
  pass pending.
- **2026-07-15 (Preact conversion):** Owner directed the app pages onto a
  scoped Vite + Preact build (marketing pages untouched). Admin console,
  member area, and the join slot picker are now Preact islands with
  identical markup; worker source is no longer publicly served. Deployed
  to dev; owner browser pass pending.
- **2026-07-15 (billing + deep links):** Owner confirmed both test emails
  arrived. Added ?tab= deep links (used by the admin email) and the admin
  Billing tab backed by live Stripe data; deployed and verified on dev.
- **2026-07-15 (email):** Wired Cloudflare Email Service behind the existing
  EmailSender seam (dev from-address on odla.ai per the owner), added
  per-template send toggles, admin test sends, and the Recent Sends audit.
  Owner approved the schema push and refreshed the clerk CLI login; deployed
  to dev and verified end to end (real sends accepted by Email Service,
  audit rows show transport cloudflare). Remaining: owner browser pass of
  the Email tab and a glance at the two "[dev]" test emails in the debug
  inbox.
- **2026-07-11 (P2):** Owner approved P2 and specified the three-state role
  model (provisional/member/admin, recorded above). Installed pinned
  @odla-ai/cli 0.8.0 + @odla-ai/db. `init` scaffolded config/schema/rules;
  owner approved handshake code SAV4-3DR4 in Studio; provision created the
  app, dev tenant, key, and pushed schema + deny-all rules. Added ODLA_* vars
  to wrangler.jsonc and /api/applications routes to the worker; all verified
  locally and deployed; smoke passes. Next human obligations: approve entering
  P3 (Clerk login), create a Clerk account/app, and paste the publishable key
  (pk_..., not the secret key) when asked.
- **2026-07-18 (second dev machine + owner-account worker):** Set up a second
  developer machine (Node 26 via Homebrew; `npm install`, NOT `npm ci`, since
  the lockfile was slightly out of sync; approved the six install scripts
  esbuild/workerd/sharp/fsevents/protobufjs/@google/genai, now persisted in
  package.json `allowScripts`). Provisioned local dev credentials against the
  shared app with `provision --write-dev-vars`. Known snag: the rules push
  403s with "not your app" (the app is owner-held by cory.ondrejka@gmail.com
  and the rules are already deployed deny-all, so they need no push), and
  provision exits before writing `.dev.vars`. Workaround: the minted key is
  already in `.odla/credentials.local.json` (`envs.dev.dbKey`), so `.dev.vars`
  was written from it directly (`ODLA_API_KEY=<key>`, 0600, never printed);
  that single secret is all a local worker needs (every other ODLA_* var is
  inline in wrangler.jsonc; Clerk/Stripe keys resolve at runtime from the
  tenant vault). Then deployed a SECOND dev worker on the owner's OWN
  Cloudflare account (tori@silverandsaltcapital.com, account aa3582f8...):
  registered the `silver-and-salt.workers.dev` subdomain (wrangler v4 dropped
  the `subdomain` command, so the owner registered it in the dashboard) and ran
  `deploy:app:dev` (--env dev ONLY). Live at
  https://silver-and-salt-capital-dev.silver-and-salt.workers.dev, sharing the
  same dev backend (db tenant silver-and-salt-capital--dev, Clerk
  relieved-eft-93, Stripe) as Cory's dev worker. `ODLA_API_KEY` pushed to the
  deployed worker via `secrets push` (owner ran it; the db routes 500'd for
  ~30s during secret propagation, then went green). All routes verified on the
  deployed worker: `/` and `/api/health` 200, `/api/auth/config` serves the
  shared Clerk key, `/api/me` 401 unauth, `/api/groups/silver-and-salt-capital/
  join-config` returns the real group (paymentsReady true). Known gap: real
  email sends from THIS worker fail sender verification, because dev EMAIL_FROM
  (silver-and-salt-capital@odla.ai) is a sender verified on Cory's account, not
  the owner's (audited, non-fatal; local `wrangler dev` simulates the binding).
  To send real mail from the owner-account worker later, onboard a
  silverandsaltcapital.com (or owner-owned) sender to Cloudflare Email Service
  on the owner's account. Production and `main` remain untouched.
- **2026-07-30 (signed leader edge rollout):** Upgraded the dev Chapter
  implementation to `@odla-ai/db` 0.9.0, `@odla-ai/crm` 0.5.0, and
  `@odla-ai/chapter` 0.26.0. Reviewed the additive, deny-all
  `crm_record_origin` and `crm_record_delivery` namespaces under shared
  package decision `21c28820-c0b6-5780-b8e1-bd34d01100c4`; updated the frozen
  parity fixtures before provisioning. This follower still has no leader
  target configuration and retains its existing brand, public/member routes,
  admin structure, and local pipeline authority. Production and `main` remain
  untouched.
