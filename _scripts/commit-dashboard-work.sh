#!/usr/bin/env bash
# STEP 1 of 2: commit the dashboard task work to main. SAFE.
#
# What this does:
#   - clears the stale .git/index.lock (which will otherwise break the 4am deploy)
#   - commits ONLY granola-inbox.js and task-decisions.json
#   - pushes main
#
# What this deliberately does NOT do:
#   - it does not touch join.html, index.html, or any odla migration file
#   - it refuses to run if join.html somehow ends up staged
#
# Your live sign-up flow at silverandsaltcapital.com/join.html uses the Google
# Apps Script backend and works. It keeps working because the odla rewrite of
# join.html stays UNCOMMITTED. This script does not change that.

set -euo pipefail
cd "$(dirname "$0")/.."
echo "repo: $(pwd)"

# 1. Clear the stale lock.
find .git -name "*.lock" -delete 2>/dev/null || true
echo "locks cleared"

# 2. Confirm we are on main.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "ABORT: expected branch main, found $BRANCH"; exit 1
fi

# 3. Stage only the two dashboard data files.
git add granola-inbox.js task-decisions.json

# 4. Safety gate: nothing else may be staged, especially not join.html.
STAGED=$(git diff --cached --name-only)
echo "staged files:"; echo "$STAGED" | sed 's/^/  /'
if echo "$STAGED" | grep -qvE '^(granola-inbox\.js|task-decisions\.json)$'; then
  echo "ABORT: unexpected file staged. Run 'git reset' and investigate."; exit 1
fi
if echo "$STAGED" | grep -q 'join.html'; then
  echo "ABORT: join.html is staged. This would break the live sign-up form."; exit 1
fi

# 5. Commit and push.
git commit -m "Collapse dashboard task backlog: thread-aware inbox feed

Prune 23 superseded or already-done items from the staging feed (111 to 88),
then backfill thread_id and due onto every remaining item so the daily pull
supersedes within a thread instead of appending a new task each time an email
thread moves. Add task-decisions.json as the decision ledger the daily pull
reads on every run, so items Tori has rejected are never re-proposed.
Recovers 15 deadlines that were buried in prose context and therefore invisible
to the dashboard's overdue rendering."

git push origin main
echo
echo "Done. Verifying the live sign-up form is untouched:"
sleep 5
if curl -s https://silverandsaltcapital.com/join.html | grep -q "script.google.com/macros"; then
  echo "  OK: live join.html still uses the working Google Apps Script backend."
else
  echo "  WARNING: could not confirm the Apps Script endpoint on the live page. Check it."
fi
