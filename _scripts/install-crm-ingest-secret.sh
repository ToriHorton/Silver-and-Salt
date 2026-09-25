#!/usr/bin/env bash
# Mint CRM_INGEST_SECRET, the bearer token for POST /api/crm-ingest, and
# install it on the production Worker. The value is streamed by stdin, never
# printed, and kept in the git-ignored .dev.vars (mode 600) so the morning
# task can read it. Re-running rotates it. Run from anywhere:
#
#   bash ~/Projects/Silver-and-Salt/_scripts/install-crm-ingest-secret.sh
#
# The dev Worker lives on a different Cloudflare account; set it there with
# `npx wrangler secret put CRM_INGEST_SECRET --env dev` from that account.
set -euo pipefail

REPO=~/Projects/Silver-and-Salt
VARS="$REPO/.dev.vars"
value=$(openssl rand -hex 32)

cd "$REPO"
printf '%s' "$value" | npx wrangler secret put CRM_INGEST_SECRET 2>&1 | sed "s#$value#<value>#g"

touch "$VARS"
chmod 600 "$VARS"
tmp=$(mktemp)
grep -v '^CRM_INGEST_SECRET=' "$VARS" > "$tmp" || true
printf 'CRM_INGEST_SECRET=%s\n' "$value" >> "$tmp"
mv "$tmp" "$VARS"
chmod 600 "$VARS"
echo "Saved to .dev.vars"
