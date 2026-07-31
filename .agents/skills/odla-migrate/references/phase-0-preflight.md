# Phase 0 — Preflight

Goal: understand the repo and make it migratable. No accounts, no
platform state, no changes to the live site.

Human obligation: none.

## Steps

1. Inventory the repo and record findings:
   - Static generator? (`_config.yml` = Jekyll, astro/eleventy/vite
     configs, plain HTML?) Build command? Output directory?
   - Custom domain? (`CNAME` file at root or in the publish source —
     capture the domain; it becomes `links.prod` in Phase 5.)
   - How Pages deploys: `gh-pages` branch, `docs/` folder, or a
     `.github/workflows/*` using deploy-pages.
   - Dynamic wishes: forms posting to third parties, `mailto:` contact,
     localStorage used as a database, TODOs mentioning login/db.
2. Ensure the build outputs to a DEDICATED directory (`dist/`, `_site/`,
   `build/`). If the site is served from the repo root, restructure so a
   build step (even a copy script) produces a clean output dir first.
   This is a hard blocker: pointing wrangler's assets at a directory
   containing node_modules kills `wrangler dev` with "spawn EBADF".
3. Confirm the output dir is gitignored if it is generated.
4. Secret scan: grep tracked files for key-shaped strings (`sk-`,
   `sk_live_`, `whsec_`, `ghp_`, `github_pat_`, `AKIA`, `-----BEGIN`).
   Any hit: STOP, show the human file:line (never the value), and
   resolve before continuing.
5. Create `MIGRATION.md` at the repo root: the six-phase checklist with
   P0 marked in progress, the inventory findings, and the chosen build
   dir. Commit it (review `git status` first).

## Verification checklist

- [ ] Build runs clean and populates only the dedicated output dir
- [ ] Output dir contains index.html and the site's assets
- [ ] No committed secrets found (or resolved with the human)
- [ ] MIGRATION.md committed

Rollback: nothing to roll back.

Done when: all boxes checked and the human approves entering Phase 1
(their next obligation: a Cloudflare account + `wrangler login`).
