#!/usr/bin/env bash
# Mint REPORT_KEY, the bearer key the Monday weekly report (Library
# team-dashboard/team-emails.gs) uses to read GET /api/reports/curves, and
# install it on the production Worker. The value is streamed by stdin, never
# printed, kept in the git-ignored .dev.vars (mode 600), and copied to the
# clipboard for the Apps Script property CURVES_KEY. Re-running rotates it.
#
#   bash ~/Projects/Silver-and-Salt/_scripts/install-report-key.sh
set -euo pipefail

REPO=~/Projects/Silver-and-Salt
VARS="$REPO/.dev.vars"
value=$(openssl rand -hex 32)

cd "$REPO"
printf '%s' "$value" | npx wrangler secret put REPORT_KEY 2>&1 | sed "s#$value#<value>#g"

touch "$VARS"
chmod 600 "$VARS"
tmp=$(mktemp)
grep -v '^REPORT_KEY=' "$VARS" > "$tmp" || true
printf 'REPORT_KEY=%s\n' "$value" >> "$tmp"
mv "$tmp" "$VARS"
chmod 600 "$VARS"
printf '%s' "$value" | pbcopy
echo "Saved to .dev.vars and copied to the clipboard for the Apps Script property CURVES_KEY."
