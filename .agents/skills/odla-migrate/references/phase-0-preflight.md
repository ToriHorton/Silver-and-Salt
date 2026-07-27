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
   - Every route's method/path, current consumer, owning source file, request and
     response contract, auth/cache behavior, and evidence. Source evidence is a
     path + commit; deployed evidence is an origin + immutable deployment
     version. Never infer current-branch ownership from an unversioned deployed
     response, an old branch, or git history.
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
5. Choose the intended stable odla `appId`. Follow
   `project-state.md`'s pre-registration bootstrap: keep the inventory and
   evidence in focused source-controlled artifacts/commits and the checkpoint
   handoff. Do not create a parallel migration diary. PM becomes authoritative
   immediately after Phase 2 registers the app.

## Verification checklist

- [ ] Build runs clean and populates only the dedicated output dir
- [ ] Output dir contains index.html and the site's assets
- [ ] No committed secrets found (or resolved with the human)
- [ ] Intended `appId`, inventory evidence, and source commit recorded in the
      checkpoint handoff

Rollback: nothing to roll back.

Done when: all boxes checked and the human approves entering Phase 1
(their next obligation: a Cloudflare account + `wrangler login`).
