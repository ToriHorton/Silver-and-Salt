#!/usr/bin/env bash
#
# Publish the Silver & Salt Capital CEO dashboard to its obscure URL.
#
#   https://silverandsaltcapital.com/hq-25b5a94e297e.html
#
# WHY THIS SCRIPT EXISTS
# ----------------------
# The old deploy ran "git add ... && git commit && git push origin main" against
# whatever branch happened to be checked out. During the odla/Chapter migration
# the repo is often sitting on a feature branch (j1-tiers-on-chapter,
# odla-conversion-test, p0-align-odla-packages, ...). In that state the commit
# landed on the feature branch and "git push origin main" pushed the untouched
# local main ref, so the push was a silent no-op and the dashboard quietly went
# stale for weeks. It also risked sweeping half-finished src/ work into a
# dashboard commit.
#
# This script never has that failure mode. It builds the commit with git
# plumbing against a temporary index:
#
#   * It NEVER reads or writes .git/index, HEAD, or the working tree state.
#   * It NEVER checks out, stashes, merges, rebases, or switches branches.
#   * It starts from a freshly fetched origin/main tree and overlays ONLY the
#     allowlisted files, so it is structurally impossible to publish odla work,
#     src/, join.html, or anything else that happens to be dirty.
#   * It pushes a commit SHA straight to main, always as a fast-forward on top
#     of current origin/main. It never forces.
#   * It takes no ref locks on the local side, so a stale .git/*.lock left by a
#     crashed git process does not block a deploy.
#
# Run it from any branch, with any amount of uncommitted work in the tree.
#
# Exit codes: 0 published, 3 nothing to publish, non-zero anything else.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$PWD"

SLUG="hq-25b5a94e297e.html"
SOURCE="dashboard.html"

# The ONLY paths this script is ever allowed to put in a commit.
ALLOWLIST=(
  "$SLUG"
  "deploy-stamp.txt"
  "granola-inbox.js"
  "newsletter-data.js"
  "task-decisions.json"
  "goals.js"
  "goals.json"
)

STAMP_SUFFIX="${1:-}"   # optional: caller passes a token suffix, e.g. "a1b2"

log() { printf '%s\n' "$*" >&2; }

# --- 1. sanity ---------------------------------------------------------------
[ -f "$SOURCE" ] || { log "FATAL: $SOURCE not found in $REPO"; exit 1; }

# --- 2. refresh origin/main (read-only, no merge, no ref on our side) --------
git fetch --quiet origin main
BASE="$(git rev-parse FETCH_HEAD)"
log "Base: origin/main @ ${BASE:0:7}"

# --- 3. build the payload ----------------------------------------------------
cp "$SOURCE" "$SLUG"

if [ -n "$STAMP_SUFFIX" ]; then
  STAMP="$(date -u +%Y-%m-%dT%H:%MZ)-$STAMP_SUFFIX"
else
  STAMP="$(date -u +%Y-%m-%dT%H:%MZ)-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c4)"
fi
printf '%s\n' "$STAMP" > deploy-stamp.txt
log "Stamp: $STAMP"

# --- 4. overlay the allowlist onto origin/main's tree, in a temp index -------
TMPIDX="$(mktemp -t ssc-deploy-idx.XXXXXX)"
trap 'rm -f "$TMPIDX" "$TMPIDX.lock"' EXIT
export GIT_INDEX_FILE="$TMPIDX"

git read-tree "$BASE"

for f in "${ALLOWLIST[@]}"; do
  [ -f "$f" ] || { log "skip (absent): $f"; continue; }
  blob="$(git hash-object -w "$f")"
  git update-index --add --cacheinfo "100644,$blob,$f"
done

TREE="$(git write-tree)"
unset GIT_INDEX_FILE

# --- 5. nothing changed? stop cleanly ---------------------------------------
if [ "$TREE" = "$(git rev-parse "$BASE^{tree}")" ]; then
  log "Nothing to publish: tree identical to origin/main."
  exit 3
fi

# --- 6. build the commit, then AUDIT it before it can leave the machine ------
COMMIT="$(git commit-tree "$TREE" -p "$BASE" \
  -m "Daily dashboard deploy $(date -u +%Y-%m-%d)")"

CHANGED="$(git diff --name-only "$BASE" "$COMMIT")"
log "Changed files:"; printf '%s\n' "$CHANGED" | sed 's/^/  /' >&2

BAD=0
while IFS= read -r path; do
  [ -z "$path" ] && continue
  ok=0
  for allowed in "${ALLOWLIST[@]}"; do
    [ "$path" = "$allowed" ] && ok=1 && break
  done
  [ "$ok" -eq 1 ] || { log "FATAL: commit touches non-allowlisted path: $path"; BAD=1; }
done <<< "$CHANGED"
[ "$BAD" -eq 0 ] || { log "Aborting, nothing pushed."; exit 1; }

# Belt and braces: dashboard.html must never be published under its own name.
if printf '%s\n' "$CHANGED" | grep -qx "$SOURCE"; then
  log "FATAL: $SOURCE would be committed under its own name. Aborting."
  exit 1
fi

# --- 7. push the SHA directly to main. Fast-forward by construction. ---------
if ! git push --quiet origin "$COMMIT:refs/heads/main"; then
  log "Push rejected. Re-fetching and retrying once on the new tip."
  sleep 5
  git fetch --quiet origin main
  NEWBASE="$(git rev-parse FETCH_HEAD)"
  if [ "$NEWBASE" = "$BASE" ]; then
    log "FATAL: push failed and origin/main did not move. Not a race. Aborting."
    exit 1
  fi
  exec "$0" "$STAMP_SUFFIX"
fi

log "Pushed ${COMMIT:0:7} to origin/main."

# --- 8. fast-forward the local main ref only when provably safe -------------
# Safe means: local main is exactly the base we built on, so no unpushed local
# commits can be orphaned. If main is ahead, leave it alone and say so.
if LOCALMAIN="$(git rev-parse --verify --quiet refs/heads/main)"; then
  if [ "$LOCALMAIN" = "$BASE" ]; then
    if git update-ref refs/heads/main "$COMMIT" "$BASE" 2>/dev/null; then
      log "Local main fast-forwarded to ${COMMIT:0:7}."
    else
      log "NOTE: could not move local main (likely a stale ref lock). Harmless: run 'git pull' when convenient."
    fi
  else
    log "NOTE: local main has unpushed commits, leaving it untouched. Run 'git pull' when convenient."
  fi
fi

printf '%s\n' "$STAMP"
exit 0
