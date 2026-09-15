#!/usr/bin/env bash
# Install the three production edge secrets shared between the Built Not Found
# hub and Silver & Salt Capital (launch Phase 4a). Each value is generated
# here, streamed by stdin into BOTH prod vaults under the same key name, and
# never printed or written to disk. Run once from any directory:
#
#   bash ~/Projects/Silver-and-Salt/_scripts/install-prod-edge-secrets.sh
#
# Re-running mints new values (rotation); both sides always receive the same
# value, so the edges stay consistent.
set -euo pipefail

SILVER=~/Projects/Silver-and-Salt
BNF=~/Projects/bnfCapWeb
CLI="npx --yes @odla-ai/cli@0.60.0"
EMAIL=tori@silverandsaltcapital.com

install_pair() {
  local name="$1"
  local value
  value=$(openssl rand -hex 32)
  for repo in "$SILVER" "$BNF"; do
    printf '  %-48s -> %s\n' "$name" "$(basename "$repo")"
    printf '%s' "$value" | (
      cd "$repo" && ODLA_PROVISION_PROD=1 ODLA_ENV=prod $CLI secrets set "$name" \
        --env prod --stdin --yes --email "$EMAIL" 2>&1 | grep -v '^auth:' | sed "s#$value#<value>#g" | sed 's/^/     /'
    )
  done
}

echo "CRM share edge (hub <-> chapter):"
install_pair network_share_secret
echo "Signup-control edge (live runtime):"
install_pair signup_control_silver_and_salt_capital__live
echo "Membership-authority edge (live runtime):"
install_pair membership_authority_silver_and_salt_capital_live
echo "done: reload the Chapters workspace on builtnotfoundcapital.com/admin/"
