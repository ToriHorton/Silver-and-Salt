# Phase 1 — Same site, served by a Cloudflare Worker

Goal: the exact same site, deployed to a workers.dev URL via a Worker
with an assets binding. No odla yet. GitHub Pages untouched.

Human obligation: create a Cloudflare account (free plan) and run
`wrangler login` (browser flow — they run it, or run `! wrangler login`
in this session).

## Steps

1. `npm i -D wrangler`
2. Write `wrangler.jsonc` by hand using this documented shape:
   - `name`: kebab-case app id; `main`: `src/worker.ts`
   - `compatibility_date` (today), `compatibility_flags: ["nodejs_compat"]`
   - `assets: { "directory": "<buildDir>", "binding": "ASSETS",
     "not_found_handling": "404-page" }` — match the site's current 404
     behavior; the directory is the Phase 0 build dir, NEVER the repo root
   - `env.dev` block: `name` = "<name>-dev", same assets
3. Minimal `src/worker.ts`:
   - `GET /api/health` returns JSON `{ ok: true }` and sets an
     `x-odla-worker: <name>` response header
   - everything else: `return env.ASSETS.fetch(req)`
4. Build the site, then `wrangler dev` and spot-check pages locally.
5. Deploy ONLY dev: `npx wrangler deploy --env dev`. Do not deploy the
   top-level (prod) config before Phase 5.
6. Parity check: pick 5–10 representative paths (home, a deep page, an
   asset, a missing path for 404). Curl each on BOTH the Pages URL and
   the workers.dev URL; compare status, content-type, and title.
7. Add non-`deploy` npm scripts so CI never auto-deploys:
   `"deploy:app:dev": "<build> && wrangler deploy --env dev"` (and later
   `"deploy:app"` for prod). Never name a script exactly `deploy`.
8. Record the workers.dev URL and parity results in MIGRATION.md.

## Verification checklist

- [ ] `wrangler dev` serves the site with no EBADF / watcher errors
- [ ] Parity table recorded (status + content-type + title per path)
- [ ] `/api/health` returns `{ ok: true }` on the deployed dev worker
- [ ] GitHub Pages site still serving, untouched

Rollback: delete the dev worker in the Cloudflare dashboard. Pages was
never touched.

Done when: parity recorded and the human approves Phase 2 (their next
obligation: sign in at https://odla.ai/studio and approve a handshake code).
