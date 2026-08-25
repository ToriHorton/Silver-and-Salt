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
# Agent/migration infrastructure and internal documents are excluded
# because they are not part of the public website. NOTE: this list only
# shapes dist/. GitHub Pages serves the repo root directly, so anything
# below is STILL public on Pages until the cutover retires it.
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
  ':!:LEGAL-REVIEW-HOW-IT-WORKS.md' \
  ':!:BRAND.md' \
  ':!:WORKFLOW.md' \
  ':!:faq-complete.md' \
  ':!:report-headers.numbers' \
  ':!:report-headers.xlsx' \
  ':!:_reference' \
  ':!:_mockups' \
  ':!:_research' \
  ':!:_archive' \
  ':!:_scripts' \
  ':!:generate-faq-pdf.py' \
  ':!:enriched_data.tsv' \
  ':!:women_orgs_additions.csv' \
  ':!:hq-*.html' \
  ':!:granola-inbox.js' \
  ':!:newsletter-data.js' \
  ':!:goals.js' \
  ':!:goals.json' \
  ':!:deploy-dashboard.sh' \
  ':!:deploy-stamp.txt' \
  ':!:onboarding-scope.html' \
  ':!:membership-in-full.html' \
  ':!:brand-book.html' \
  ':!:*-options.html' \
  ':!:membership-[b-h].html' \
  ':!:membership-[fgh][0-9].html' \
  ':!:membership-draft.html' \
  ':!:membership-final.html' \
  ':!:membership-compare.html' \
  ':!:membership-section-draft.html' \
  ':!:membership-signup-section*.html' \
  ':!:membership-sorter-marketing.html' \
  ':!:membership-price-final3.html' \
  ':!:membership-price-special.html' \
  ':!:how-b.html' \
  ':!:how-c.html' \
  ':!:how-it-works-additions.html' \
  ':!:hen-variants.html' \
  ':!:hero-type.html' \
  ':!:map-mockup.html' \
  ':!:src' \
  ':!:tests' \
  ':!:vitest.config.mjs' \
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
