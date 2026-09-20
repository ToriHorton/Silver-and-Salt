#!/bin/zsh
# Operator step (runbook "Opening and closing sales"): set SALES_STATE on the
# PRODUCTION Silver & Salt Capital Worker. Sales state is server-enforced
# (src/sales-state.ts): disabled refuses every purchase and signup entry point,
# restricted admits only the canary link plus the allowlist, public opens the
# join page to everyone. Changing it is a secret write, never a code deploy,
# and takes effect within seconds. SALES_STOP, if set, overrides everything.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  disabled|restricted|public) ;;
  *) echo "usage: _scripts/set-sales-state.sh <disabled|restricted|public>" >&2; exit 2 ;;
esac
printf '%s' "$1" | npx wrangler secret put SALES_STATE >/dev/null
echo "SALES_STATE=$1 on the production Worker; readout:"
curl -s https://silverandsaltcapital.com/api/sales-state
echo
