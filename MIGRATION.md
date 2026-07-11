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
- [x] **P1: Static site on Cloudflare (dev tenant only)** (completed 2026-07-11, awaiting human approval to enter P2)
- [ ] **P2: Database (odla-db)**
- [ ] **P3: Login (Clerk)**
- [ ] **P3b: User sync (mirror Clerk users into $users)** (optional)
- [ ] **P4: AI** (optional)
- [ ] **P5: Production + DNS cutover** (this is the ONLY phase that touches production)

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
