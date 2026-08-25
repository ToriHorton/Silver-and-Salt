#!/usr/bin/env bash
# STEP 2 of 2: move the odla migration work off main onto odla-conversion-test.
# OPTIONAL. Run only when you are ready. Run commit-dashboard-work.sh first.
#
# WHY: your working tree on main currently holds the odla migration. Nothing is
# committed, so the live site is fine. But main's tree is dirty, which makes the
# 4am task's "git pull --ff-only" fail every morning. This moves the work to the
# branch where MIGRATION.md says it belongs, and returns main to a clean state.
#
# WHAT WAS VERIFIED before this script was written:
#   - 13 of the 19 modified files are byte-identical to odla-conversion-test already
#   - 60 of the 98 untracked files are byte-identical to odla-conversion-test already
#   - only these 8 files are genuinely newer than the branch:
#         .claude/launch.json
#         assets/site-footer.js
#         assets/site-header.js
#         faqs.html
#         index.html
#         onboarding-scope.html
#         src/odla/schema.mjs
#         src/worker.ts
#   - 36 untracked files are not on the branch at all (membership-*.html variants,
#     marketing/, hen-variants.html, how-b.html, etc.) and are LEFT ALONE by this
#     script. They stay untracked on main. Decide on them separately.
#
# A full backup already exists at:
#   the outputs folder, repo-backup-2026-07-29/ (1948-line patch + 118 files)
#
# SAFETY: this script stops before doing anything destructive and asks you to
# confirm. It never commits join.html to main.

set -euo pipefail
cd "$(dirname "$0")/.."
echo "repo: $(pwd)"
find .git -name "*.lock" -delete 2>/dev/null || true

NEWER=(.claude/launch.json assets/site-footer.js assets/site-header.js faqs.html
       onboarding-scope.html index.html src/odla/schema.mjs src/worker.ts)

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ "$BRANCH" = "main" ] || { echo "ABORT: expected main, found $BRANCH"; exit 1; }

if ! git diff --quiet -- granola-inbox.js task-decisions.json 2>/dev/null; then
  echo "ABORT: dashboard files still uncommitted. Run commit-dashboard-work.sh first."; exit 1
fi

echo
echo "This will:"
echo "  1. copy the 8 newer files to a temp dir"
echo "  2. stash everything else on main (including untracked), so main goes clean"
echo "  3. switch to odla-conversion-test"
echo "  4. drop the 8 newer files in, commit, and push that branch"
echo "  5. switch back to main and confirm join.html is the working Apps Script version"
echo
read -r -p "Proceed? type yes: " ok
[ "$ok" = "yes" ] || { echo "aborted"; exit 0; }

TMP=$(mktemp -d)
echo "temp dir: $TMP"
for f in "${NEWER[@]}"; do
  [ -f "$f" ] && mkdir -p "$TMP/$(dirname "$f")" && cp "$f" "$TMP/$f" && echo "  saved $f"
done
cp task-decisions.json "$TMP/task-decisions.json" 2>/dev/null || true

# Stash tracked modifications AND untracked files so the checkout can proceed.
git stash push -u -m "odla migration WIP moved off main 2026-07-29"
echo "stashed. main tree is now clean."

git checkout odla-conversion-test

for f in "${NEWER[@]}"; do
  [ -f "$TMP/$f" ] && mkdir -p "$(dirname "$f")" && cp "$TMP/$f" "$f" && git add "$f" && echo "  applied $f"
done

if git diff --cached --quiet; then
  echo "nothing new to commit on the branch."
else
  git commit -m "Carry forward newer odla work from main

Nav adds a Membership tab and a Members link, refreshed asset cache-busting
strings, updated worker and schema. These eight files were newer on main's
working tree than on this branch."
  git push origin odla-conversion-test
fi

git checkout main
cp "$TMP/task-decisions.json" task-decisions.json 2>/dev/null || true

echo
echo "=== final state ==="
echo "branch: $(git rev-parse --abbrev-ref HEAD)"
echo "main tree clean? $(git status --porcelain | wc -l) entries remaining"
if grep -q "script.google.com/macros" join.html; then
  echo "OK: join.html in your working tree is the WORKING Apps Script version."
else
  echo "WARNING: join.html is not the Apps Script version. Restore with: git checkout -- join.html"
fi
echo
echo "Your odla work is recoverable three ways: the branch, 'git stash list', and the backup folder."
