#!/usr/bin/env bash
# Install the three production edge secrets shared between the Built Not Found
# hub and Silver & Salt Capital (launch Phase 4a). Each value is generated
# here, streamed by stdin into BOTH prod vaults under the same key name, and
# never printed or written to disk. Run once from any directory:
#
#   bash ~/Projects/Silver-and-Salt/_scripts/install-prod-edge-secrets.sh [crm|signup|membership ...]
#
# With no argument every pair is (re)minted. Re-running rotates; both sides
# always receive the same value, so the edges stay consistent.
set -euo pipefail

SILVER=~/Projects/Silver-and-Salt
BNF=~/Projects/bnfCapWeb
CLI="npx --yes @odla-ai/cli@0.60.0"
EMAIL=tori@silverandsaltcapital.com

# install_pair <chapter-side key> <hub-side key>: one value, two vaults.
install_pair() {
  local chapter_name="$1" hub_name="$2"
  local value
  value=$(openssl rand -hex 32)
  put() { # repo, name
    printf '  %-48s -> %s\n' "$2" "$(basename "$1")"
    printf '%s' "$value" | (
      cd "$1" && ODLA_PROVISION_PROD=1 ODLA_ENV=prod $CLI secrets set "$2" \
        --env prod --stdin --yes --email "$EMAIL" 2>&1 | grep -v '^auth:' | sed "s#$value#<value>#g" | sed 's/^/     /'
    )
  }
  put "$SILVER" "$chapter_name"
  put "$BNF" "$hub_name"
}

# Which pairs to (re)mint: all, or any of crm | signup | membership.
sel="${*:-all}"
want() { [[ "$sel" == "all" || " $sel " == *" $1 "* ]]; }

# Key names come from the resolved configs: the chapter's network.readers use
# the default network_share_secret; the hub's network.targets[].secretName is
# network_share_<chapter id with underscores>; the signup-control and
# membership-authority edges use the same per-runtime name on both sides.
want crm && { echo "CRM share edge (chapter network_share_secret <-> hub network_share_silver_and_salt_capital):"; install_pair network_share_secret network_share_silver_and_salt_capital; }
want signup && { echo "Signup-control edge (live runtime):"; install_pair signup_control_silver_and_salt_capital__live signup_control_silver_and_salt_capital__live; }
want membership && { echo "Membership-authority edge (live runtime):"; install_pair membership_authority_silver_and_salt_capital_live membership_authority_silver_and_salt_capital_live; }
echo "done: reload the Chapters workspace on builtnotfoundcapital.com/admin/"
