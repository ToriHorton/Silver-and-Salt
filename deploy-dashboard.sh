#!/usr/bin/env bash
# Deploy the Silver & Salt Capital dashboard to GitHub Pages (silverandsaltcapital.com).
# Publishes the Actions tab, the Monthly Newsletter tab, and the Granola + newsletter data feeds.
# Re-run this any time you want the live site to pick up fresh Granola or newsletter data.
set -uo pipefail

cd "$(dirname "$0")" || exit 1

# Clear any stale git lock and diagnostic litter (safe if absent).
rm -f .git/index.lock .git/_probe 2>/dev/null || true

# Stage the dashboard and its data feeds (only the ones that exist). Nothing else is touched.
git add dashboard.html
[ -f newsletter-data.js ] && git add newsletter-data.js
[ -f granola-inbox.js ]   && git add granola-inbox.js

if git diff --cached --quiet; then
  echo "No dashboard changes to deploy."
  exit 0
fi

git commit -m "Deploy Silver & Salt Capital dashboard: Actions tab, Monthly Newsletter tab, live data feeds"
git push origin main
echo "Pushed. silverandsaltcapital.com updates in about 60 seconds."
