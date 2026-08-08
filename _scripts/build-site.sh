#!/usr/bin/env bash
# Build the Silver & Salt Capital static site into dist/.
#
# Copies GIT-TRACKED files only. This matters for two reasons:
#   1. Parity: GitHub Pages serves exactly what is committed on main.
#   2. Privacy: local-only CEO tools (dashboard.html, ecosystem.html,
#      granola-inbox.js, newsletter-data.js, network/people*.js) are
#      gitignored and must never reach a deploy directory. A blind
#      `cp -r` would leak them; `git ls-files` cannot.
#
# Agent/migration infrastructure is excluded because it is not part of
# the public website.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist

git ls-files -z -- . \
  ':!:.github' \
  ':!:.agents' \
  ':!:.claude' \
  ':!:.cursor' \
  ':!:.gitignore' \
  ':!:AGENTS.md' \
  ':!:GEMINI.md' \
  ':!:CLAUDE.md' \
  ':!:MIGRATION.md' \
  ':!:PAYMENT-SPEC.md' \
  ':!:JOURNEYS-PLAN.md' \
  ':!:MULTI-BRAND-PLAN.md' \
  ':!:UI-COMPONENT-SPECS.md' \
  ':!:ADMIN-CALENDAR-SPEC.md' \
  ':!:src' \
  ':!:vite.config.mjs' \
  ':!:wrangler.jsonc' \
  ':!:odla.config.mjs' \
  ':!:package.json' \
  ':!:package-lock.json' \
  | rsync -a --files-from=- --from0 . dist/

# App islands (admin console, member area, join booking step): Preact via
# Vite, bundled into dist/assets/app/. Worker and island SOURCE is excluded
# from the copy above; only bundles ship. Marketing pages never touch this.
npx vite build --logLevel warn

echo "Built dist/ with $(find dist -type f | wc -l | tr -d ' ') files."
