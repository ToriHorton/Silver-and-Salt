#!/usr/bin/env bash
# Manual deploy of the Silver & Salt Capital CEO dashboard.
#
# Per Tori's decision on 2026-07-14, the dashboard IS published, but only as an
# unlinked, noindexed copy at an obscure URL, pending password protection:
#   https://silverandsaltcapital.com/hq-25b5a94e297e.html
#
# This is now a thin wrapper. All the real work lives in
# _scripts/publish-dashboard.sh, which is safe to run from ANY branch with ANY
# amount of uncommitted odla migration work in the tree. It never switches
# branches, never touches your index or working tree state, and can only ever
# publish an allowlist of dashboard files.
#
# The scheduled task "granola-pull-dashboard-deploy" calls the same script, so
# the manual and automatic paths cannot drift apart.
#
# Still local-only (never published): ecosystem.html, network/people.js,
# network/people-utah.js, task-management.html, TASK-MANAGEMENT.md.

set -euo pipefail
cd "$(dirname "$0")"

exec ./_scripts/publish-dashboard.sh "manual"
