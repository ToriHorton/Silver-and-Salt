#!/bin/bash
# Silver & Salt Capital — Brand Consistency Checker
# Runs before every build/serve to catch branding violations.
# Exit code 0 = pass (warnings only), exit code 1 = hard errors found.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0
WARNINGS=0

# Only check public-facing HTML (skip _reference, _mockups, node_modules, .claude)
HTML_FILES=$(find "$ROOT" -name '*.html' \
  -not -path '*/_reference/*' \
  -not -path '*/_mockups/*' \
  -not -path '*/_scripts/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/.claude/*' | sort)

if [ -z "$HTML_FILES" ]; then
  echo "No HTML files found to check."
  exit 0
fi

echo "========================================"
echo " Silver & Salt Capital — Brand Check"
echo "========================================"
echo ""

# ─── 1. NAME CHECKS ─────────────────────────────────────────────

echo "--- Name Consistency ---"

# "S&S Capital" and "S&amp;S Capital" are accepted abbreviations (no spaces required).
# Flag "S&S" or "S&amp;S" only when NOT followed by "Capital".
# Allow: decorative bg text, SVG labels, source citations, shorthand in context.
for f in $HTML_FILES; do
  matches=$(grep -n 'S&amp;S\|S&S' "$f" 2>/dev/null \
    | grep -vi 'Capital' \
    | grep -v '<!--' \
    | grep -v 'hero-bg-text\|hero-bg\|m-hero-bg' \
    | grep -v '<text ' \
    | grep -v 'S&amp;S Analysis\|S&S Analysis' \
    | grep -v 'S&amp;S COLLECTIVE\|S&S COLLECTIVE' \
    | grep -v 'carry to S' \
    || true)
  if [ -n "$matches" ]; then
    echo "  ERROR: '$f' has 'S&S' without 'Capital' (must be 'S&S Capital'):"
    echo "$matches" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
  fi
done

# Check for "Silver and Salt" (should always use &)
for f in $HTML_FILES; do
  matches=$(grep -in 'Silver and Salt' "$f" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo "  ERROR: '$f' has 'Silver and Salt' (must use '&'):"
    echo "$matches" | sed 's/^/    /'
    ERRORS=$((ERRORS + 1))
  fi
done

# Check for "Silver & Salt" without "Capital" in visible text contexts
# (allow in CSS class names, file paths, URLs, and nav split-circle markup)
for f in $HTML_FILES; do
  # Get lines with "Silver" + "&" + "Salt" that don't also have "Capital"
  matches=$(grep -n 'Silver.*&.*Salt' "$f" 2>/dev/null \
    | grep -iv 'Capital' \
    | grep -v 'class=' \
    | grep -v '<link' \
    | grep -v 'href=' \
    | grep -v '\.css' \
    | grep -v 'font-family' \
    | grep -v 'nav-mark' \
    | grep -v 'sc-amp' \
    | grep -v '<!--' \
    || true)
  if [ -n "$matches" ]; then
    echo "  WARNING: '$f' has 'Silver & Salt' without 'Capital':"
    echo "$matches" | sed 's/^/    /'
    WARNINGS=$((WARNINGS + 1))
  fi
done

echo ""

# ─── 2. AMPERSAND CHECKS ────────────────────────────────────────

echo "--- Ampersand Rendering ---"

# Check for bare & in visible text / title tags
for f in $HTML_FILES; do
  matches=$(awk '
    /<style/,/<\/style>/ { next }
    /<script/,/<\/script>/ { next }
    /class=.*&/ { next }
    /href=.*&/ { next }
    /src=.*&/ { next }
    /content=.*&/ { next }
    {
      line = $0
      # Remove all valid HTML entities
      gsub(/&amp;/, "", line)
      gsub(/&lt;/, "", line)
      gsub(/&gt;/, "", line)
      gsub(/&nbsp;/, "", line)
      gsub(/&mdash;/, "", line)
      gsub(/&ndash;/, "", line)
      gsub(/&rsquo;/, "", line)
      gsub(/&lsquo;/, "", line)
      gsub(/&rdquo;/, "", line)
      gsub(/&ldquo;/, "", line)
      gsub(/&hellip;/, "", line)
      gsub(/&#[0-9]+;/, "", line)
      gsub(/&[a-zA-Z]+;/, "", line)
      # Remove content inside HTML tags (attributes)
      gsub(/<[^>]*>/, "", line)
      # Check if bare & remains in visible text
      if (line ~ /&/) {
        printf "  %d: %s\n", NR, $0
      }
    }
  ' "$f" 2>/dev/null)
  if [ -n "$matches" ]; then
    echo "  WARNING: '$f' may have bare '&' in visible text (use &amp; or styled span):"
    echo "$matches" | head -5 | sed 's/^/    /'
    WARNINGS=$((WARNINGS + 1))
  fi
done

echo ""

# ─── 3. COLOR PALETTE CHECKS ────────────────────────────────────

echo "--- Color Palette ---"

# Approved hex colors (case-insensitive)
APPROVED_COLORS="FBF8F2|F4EFE6|2F3E34|4A5E50|7E8E84|D16B4F|E07A5E|FFFFFF|ffffff|000000|F0EDE7"

for f in $HTML_FILES; do
  # Find hex colors in inline styles and style blocks
  off_palette=$(grep -oiE '#[0-9a-fA-F]{6}' "$f" 2>/dev/null \
    | sort -u \
    | grep -viE "^#($APPROVED_COLORS)$" \
    || true)
  if [ -n "$off_palette" ]; then
    echo "  WARNING: '$f' uses colors not in the brand palette:"
    echo "$off_palette" | sed 's/^/    /'
    WARNINGS=$((WARNINGS + 1))
  fi
done

echo ""

# ─── 4. CSS VARIABLE USAGE ──────────────────────────────────────

echo "--- CSS Variable Usage ---"

# Check that pages use CSS variables rather than hardcoded hex where possible
for f in $HTML_FILES; do
  # Count hardcoded brand colors that should be CSS vars
  hardcoded=$(grep -cE '#2F3E34|#FBF8F2|#F4EFE6|#D16B4F|#4A5E50|#7E8E84|#E07A5E' "$f" 2>/dev/null || true)
  hardcoded=${hardcoded:-0}
  var_usage=$(grep -c 'var(--' "$f" 2>/dev/null || true)
  var_usage=${var_usage:-0}
  if [ "$hardcoded" -gt 10 ] && [ "$var_usage" -lt 3 ]; then
    echo "  WARNING: '$f' has $hardcoded hardcoded color values but only $var_usage CSS variable uses."
    echo "           Consider using CSS custom properties (--cream, --moss, --pop, etc.)"
    WARNINGS=$((WARNINGS + 1))
  fi
done

echo ""

# ─── SUMMARY ─────────────────────────────────────────────────────

echo "========================================"
echo " Results: $ERRORS error(s), $WARNINGS warning(s)"
echo "========================================"
echo ""
echo "Brand references:"
echo "  _reference/brand-standards.md   — Logo, colors, typography, footer"
echo "  _reference/brand-north-star.md  — Website goals & guardrails"
echo "  _reference/copy-strategy.md     — Voice, tone, key messages"
echo ""

if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: $ERRORS brand error(s) must be fixed before serving."
  exit 1
else
  if [ "$WARNINGS" -gt 0 ]; then
    echo "PASS with warnings. Review items above."
  else
    echo "PASS: All brand checks passed."
  fi
  exit 0
fi
