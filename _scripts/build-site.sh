#!/usr/bin/env bash
# Build the Silver & Salt Capital static site into dist/.
#
# Ships ONLY what the website reaches: _scripts/site-manifest.mjs starts from
# the entry pages the Worker serves (index, 404, join, admin, members) and
# follows every local link, script, stylesheet, image, and font from there.
# A tracked file that no page references (a draft, a mockup, a research
# note, a deck, a spec) is not part of the website and never reaches dist/.
# The manifest only ever names git-tracked files, so anything gitignored
# cannot leak either.
# The extension guard below is a second net for anything a page links to
# that the site should not be serving.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist

node _scripts/site-manifest.mjs | rsync -a --files-from=- --from0 . dist/

# Browser security headers for every static asset (audit S04). Cloudflare
# applies dist/_headers at the edge; the Worker sets the same set on its own
# responses, and tests/hardening.test.mjs holds the two together.
cp _headers dist/_headers

# App islands (admin console, member area, join booking step): Preact via
# Vite, bundled into dist/assets/app/. Worker and island SOURCE is excluded
# from the copy above; only bundles ship. Marketing pages never touch this.
npx vite build --logLevel warn

if [ -e dist/vendor ] || [ -e dist/scripts ]; then
  echo "Build refused: development packages or scripts reached public assets." >&2
  exit 1
fi

# Extension guard. Only file types the public site actually serves may reach
# dist/. Anything else (a .pptx deck, a .docx draft, a .py build script, a
# .md note, a file with no extension) means the deny list above missed a new
# tracked file, and the build fails instead of publishing it.
allowed='html|css|js|mjs|map|json|webmanifest|xml|txt|png|jpg|jpeg|gif|svg|webp|ico|avif|pdf|woff|woff2|ttf|otf|mp4|webm|mp3|vtt'
stray=$(find dist -type f | grep -v -E "\.($allowed)$" | grep -v -x "dist/_headers" || true)
if [ -n "$stray" ]; then
  echo "Build refused: files the site does not serve reached dist/:" >&2
  printf '  %s\n' $stray >&2
  exit 1
fi

# Deploy fingerprint. The commit this build came from, served as a plain file
# at /version.txt. The deploy workflow polls it on the LIVE domain after
# deploying, so a deploy that reports success without actually reaching the
# edge fails loudly instead of silently serving the previous version. That is
# the failure that shipped stale copy on 2026-09-10: wrangler uploaded the
# asset, the API call that activates the version got a 503, and nothing
# noticed. To check by hand:
#   curl -s https://silverandsaltcapital.com/version.txt
# and compare it to `git rev-parse HEAD` on main.
printf '%s\n' "${GITHUB_SHA:-$(git rev-parse HEAD)}" > dist/version.txt

echo "Built dist/ with $(find dist -type f | wc -l | tr -d ' ') files."
