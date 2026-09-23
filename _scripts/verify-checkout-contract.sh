#!/bin/bash
# The checkout contract canary, over real HTTP.
#
# Run it after a deploy, and before adopting any new @odla-ai/chapter version.
# On 2026-09-22 a packaged upgrade made the quote route answer 400 to the
# request its own payment step sends, and membership checkout was down for
# every paid tier for about 41 hours. `npm test` stayed green the whole time,
# because both halves of the broken contract live inside the package.
#
# The probe asks for a quote on an application id that cannot exist, using the
# bodyless POST the payment step sends. Chapter parses the body BEFORE it looks
# the application up, so:
#
#   404  the body was accepted and the lookup ran. The contract holds.
#   400  the body guard refused the payment step's own request. Checkout is down.
#
# Nothing is created, charged, or mutated, so this is safe against production.
#
# Usage: _scripts/verify-checkout-contract.sh [base-url]
set -euo pipefail

base="${1:-https://silverandsaltcapital.com}"
base="${base%/}"
probe="00000000-0000-4000-8000-000000000000"
url="$base/api/payments/quote?application=$probe"

body=$(mktemp)
trap 'rm -f "$body"' EXIT

code=$(curl -s --max-time 20 -o "$body" -w "%{http_code}" -X POST "$url" || echo "000")

case "$code" in
  404)
    echo "checkout contract holds: $base answered 404 for an unknown application"
    exit 0
    ;;
  400)
    echo "::error::CHECKOUT IS DOWN at $base. The quote route refused the payment step's own request: $(cat "$body")"
    echo "This is the 2026-09-22 failure shape. No applicant can pay. See src/checkout-probe.ts."
    exit 1
    ;;
  000)
    echo "::error::checkout canary could not reach $url"
    exit 1
    ;;
  *)
    echo "::error::checkout canary got $code from $url; an unknown application must answer 404. Body: $(cat "$body")"
    exit 1
    ;;
esac
