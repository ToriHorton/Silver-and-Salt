#!/usr/bin/env bash
# Manual deploy of the Silver & Salt Capital CEO dashboard.
#
# Per Tori's decision on 2026-07-14, the dashboard IS published, but only as an
# unlinked, noindexed copy at an obscure URL, pending password protection:
#   https://silverandsaltcapital.com/hq-25b5a94e297e.html
#
# dashboard.html itself stays gitignored (the well-known URL never exists
# publicly). This script copies it to the obscure filename, commits the copy
# plus its data feeds (granola-inbox.js, newsletter-data.js), and pushes.
# The scheduled task "granola-pull-dashboard-deploy" does the same daily.
#
# Still local-only (never published): ecosystem.html, network/people.js,
# network/people-utah.js, task-management.html, TASK-MANAGEMENT.md.

set -euo pipefail
cd "$(dirname "$0")"

SLUG="hq-25b5a94e297e.html"

cp dashboard.html "$SLUG"
date -u +"%Y-%m-%dT%H:%MZ-manual" > deploy-stamp.txt

git add "$SLUG" deploy-stamp.txt .gitignore
[ -f granola-inbox.js ]   && git add granola-inbox.js
[ -f newsletter-data.js ] && git add newsletter-data.js
git commit -m "Deploy CEO dashboard to obscure URL $(date +%Y-%m-%d)" || echo "Nothing to commit."
git push origin main
echo "Deployed. Check https://silverandsaltcapital.com/$SLUG in a minute or two."
