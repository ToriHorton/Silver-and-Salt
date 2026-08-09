# Silver & Salt Capital — Brand Standards

## Name & Ampersand (Non-Negotiable)

These rules must be followed everywhere the brand appears: copy, HTML, alt text, commit messages, documentation, LinkedIn templates, anything.

1. **Always use the full name: "Silver & Salt Capital."** Never "Silver & Salt" alone (drops the firm's identity as a capital entity). Never "Silver and Salt Capital" (wrong character).
2. **Always use the ampersand character `&`, never the word "and."**
3. **In HTML on the website,** wrap the ampersand in `<span class="brand-amp">&amp;</span>` so it renders in Cormorant Garamond upright, never italic. The italic ampersand is a curly script glyph that is not part of the brand identity. See "Wordmark Rules" below for the full reasoning.

---

## Voice & Punctuation (Non-Negotiable)

Our written voice is approachable and premium. Punctuation should feel calm and intentional, not breathless.

1. **No em dashes (`—`) or en dashes (`–`) in body copy, headings, template text, metadata, or UI strings.** Use commas, periods, colons, parentheses, or semicolons instead.
   - Bad: `Two standard placements — pick whichever fits your profile.`
   - Good: `Two standard placements. Pick whichever fits your profile.`
   - Good: `Two standard placements: pick whichever fits your profile.`
2. **Hyphens in compound words are fine** (e.g., "women-led," "high-potential," "community-driven"). Hyphens are lexical; dashes are punctuation. The rule targets dashes only.
3. **Prefer short, declarative sentences.** If a dash feels necessary, it usually signals a sentence that wants to be two sentences.
4. **Reasoning:** Em/en dashes read as improvised or breathless; our voice is closer to Kinfolk than Bloomberg. Calm cadence, full stops, quiet confidence.

### Define by what it IS, never by what it isn't

5. **No "isn't X, it's Y" / "not X, but Y" constructions in product, brand, or marketing copy.** State the positive directly.
   - Bad: `Posting isn't self-promotion. It's how people find us.`
   - Good: `Posting is how the founders and investors in your network find Silver & Salt Capital.`
   - Bad: `Silver & Salt Capital is not a fund.`
   - Good: `Silver & Salt Capital is a collective of accredited women investors.`
6. **Exception:** Personal-narrative negations are fine ("I didn't know it existed," "I'd never considered this before"). The rule targets how we describe the brand, product, or concepts, not how members describe their own story.
7. **Reasoning:** Negation invites the reader to picture the thing you're denying. Stating what something IS keeps attention on the brand's actual identity, which is already strong enough to stand on its own.

### Pronouns when talking about investing

8. **Use "they" and "their" for the investor, not "she" and "her."** Added
   2026-08-08 by Tori.
   - Bad: `Nobody should invest money she cannot set aside.`
   - Good: `Nobody should invest money they cannot set aside.`
   - Bad: `Everyone makes their own money decisions and writes her own checks.`
   - Good: `Everyone makes their own money decisions and writes their own checks.`
9. **This applies to the investing side specifically.** Silver & Salt Capital
   is a community of women and says so proudly: "women who talk about money
   out loud," "the women we fund," "a seat for your mother or your daughter."
   That collective language stays. What changes is the pronoun standing in
   for a single investor in an explanation, a policy, an FAQ answer, or a
   disclosure.
10. **Reasoning:** two reasons, and the second is the one that matters more.
    Deal access is open to accredited investors on federal criteria alone,
    so copy describing who may invest should not read as though it is
    describing only women. And a member's spouse, a trust, or a self-directed
    IRA may be the actual investor, so "she" can simply be wrong.
    Practically, "they" also reads as neutral rather than as a correction,
    which suits a calm voice.

Codified in project-level `CLAUDE.md` so Claude Code sessions enforce these rules automatically.

---

## Logo: Horizontal Mark

The Silver & Salt Capital logo consists of the **split-circle icon** paired with the **wordmark**. Two approved treatments exist depending on context.

### Primary (Navigation / Hero)
- **Font:** Cormorant Garamond, weight 600 (semibold)
- **Size:** 28px
- **Letter-spacing:** -0.01em
- **Split-circle:** 36px, Cormorant Garamond ampersand at weight 600, 19px
- **Use when:** The logo needs to compete with other elements — navigation bars, page headers, overlaid on images, or anywhere requiring visual punch through busy backgrounds.
- **History:** Originally 700 (bold). Briefly tested at 400 (too thin) before settling on 600 in May 2026 — heavier than the brand asset's editorial-light treatment but lighter than the original bold, so it holds presence in nav without overpowering the content below.

### Secondary (Footer / Stationery / Print)
- **Font:** Cormorant Garamond, weight 300 (light)
- **Size:** 22px
- **Letter-spacing:** -0.02em
- **Split-circle:** 40px, Cormorant Garamond ampersand at weight 300, 21px
- **Use when:** The logo appears in a quiet, grounded context — footers, letterheads, business cards, presentation closings, or anywhere luxury restraint is appropriate.

### Compact / Partnership Mark
- **Use when:** Co-branding strips, partner postcards, event materials, or any context requiring less horizontal space than the full wordmark.
- **Layout:** S [split-circle badge] S on one row, italic "Capital" centered below
- **S letters:** Cormorant Garamond, weight 700, 26px, color moss (#2F3E34)
- **Split-circle badge:** 48px diameter, moss left / pop right, Cormorant Garamond ampersand at weight 600
- **S-to-badge gap:** 4px (tight)
- **"Capital" text:** Cormorant Garamond, weight 300, italic, 14px, color sage (#7E8E84)
- **Capital vertical gap:** 2px (snug — reads as one unit with the mark row)
- **On dark backgrounds:** S letters in #F0EDE7, badge left half sage (#7E8E84), "Capital" in rgba(240,237,231,0.45). See "On Dark Backgrounds" section for approved treatments.
- **Mockup reference:** `_reference/logo-compact-mockups.html`

### Wordmark Rules
- In horizontal logo treatments, **"Silver & Salt Capital" must always appear on a single line.** Never split or wrap the wordmark across multiple lines.
- The wordmark and split-circle should always appear together in horizontal marks — never the wordmark alone.
- **The ampersand (&) in the wordmark must always use `font-style: normal` (upright), never italic.** The Cormorant Garamond serif ampersand in its upright form is the brand character. An italic ampersand renders as a curly/script form that is not part of the brand identity. This applies everywhere the wordmark appears — nav, footer, brand assets, mockups, exports.

### Split-Circle Icon
- Half moss (#2F3E34), half pop/rust (#D16B4F)
- White ampersand "&" centered, Cormorant Garamond serif
- Can be used standalone as a favicon or social avatar

### On Dark Backgrounds

On dark backgrounds (moss, ink blue, or any dark surface), the standard split-circle left half (moss #2F3E34) disappears. Three approved on-dark treatments exist:

#### Approved On-Dark Treatments
- **A. Standard (moss left / accent right)** — acceptable when the background provides enough contrast (e.g., ink blue #3D5A99). The left half may be subtle but reads as intentional.
- **D. Outlined (cream outline left / filled accent right)** — the left half uses a cream (#F0EDE7) stroke outline instead of a filled half. Elegant and sophisticated. Use when the logo needs to feel refined on dark surfaces.
- **E. Sage left / accent right** — the left half uses sage (#7E8E84) instead of moss. Stays in the green family but provides visible contrast on dark backgrounds. **This is the preferred treatment for the website.**

For the **rust colorway**, "accent right" = #D16B4F.
For the **plum colorway**, "accent right" = #8B5E83.

#### Disallowed On-Dark Treatments
The following treatments are **not permitted** and are not part of the brand:
- Cream-filled (#F0EDE7) or white-filled left half — too much contrast, reads as a different logo
- Full white wordmark — breaks the warmth of the brand
- Rust-colored ampersand in the wordmark — the ampersand should always be muted/subdued, never accent-colored

---

## Tagline

> *Connecting capital to Utah founders who use it best.*

- **Font:** Cormorant Garamond, weight 300, italic
- **Color:** Sage (#7E8E84)
- **Size:** 15px in footer context; scale proportionally elsewhere
- **Usage:** Appears below the wordmark. Always in italic. Never in all-caps. The period is part of the tagline.

---

## Ampersand Watermark (Design Component)

The ampersand "&" is a signature design element that can be used as a large-scale background watermark throughout Silver & Salt materials.

### Specifications
- **Font:** Cormorant Garamond, weight 300
- **Opacity:** 3-4% (barely visible, felt more than seen)
- **Color:** Moss (#2F3E34) on light backgrounds; white on dark backgrounds
- **Size:** 280-400px depending on container (should feel monumental)
- **Position:** Typically right-aligned or right-of-center, vertically centered in the container. Can also be centered.

### Approved Uses
- Footer background (right-aligned, partially cropped by edge)
- Section dividers or transition areas
- Presentation slide backgrounds
- Print materials (letterhead, report covers)
- Email signatures or headers

### Guidelines
- Never at full opacity — always a whisper, not a shout
- Should not interfere with text readability
- Works on both light (sand/cream) and dark (moss) backgrounds
- The watermark creates a subtle sense of brand presence without competing with content

---

## Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Cream | #FBF8F2 | Primary background |
| Sand | #F4EFE6 | Secondary background, footer |
| Moss | #2F3E34 | Primary text, dark surfaces |
| Moss Light | #4A5E50 | Body text |
| Sage | #7E8E84 | Muted text, tagline |
| Pop/Rust | #D16B4F | Accent, buttons, split-circle right half |
| Pop Hover | #E07A5E | Hover states, highlights |

---

## Typography

| Role | Family | Weight | Notes |
|------|--------|--------|-------|
| Display / Wordmark (bold) | Cormorant Garamond | 700 | Nav logo, hero headings |
| Display / Wordmark (light) | Cormorant Garamond | 300 | Footer logo, elegant contexts |
| Display / Italic | Cormorant Garamond | 300 italic | Tagline, pull quotes |
| **Display digits 0-9** | **Cormorant Infant** | **300, 400, 600, 700** | **Replaces Cormorant Garamond for numerals only. See "Numeral Override" below.** |
| Headings | Satoshi | 900 | Section titles, stats |
| Labels / UI | Satoshi | 700 | Navigation, buttons, uppercase labels |
| Body | Inter | 300-500 | Paragraph text |

### Numeral Override (digits always render in Cormorant Infant)

**Rule:** Digits 0-9 always render in Cormorant Infant, never in Cormorant Garamond.

**Why:** Cormorant Garamond's "1" is an unflagged stem that misreads as capital I or lowercase l. In a brand built around showing numbers (deal counts, dollar amounts, percentages, dates) that ambiguity is unacceptable. Cormorant Infant is the same family with a small flag on the "1" that distinguishes it cleanly. We adopted Infant for digits only and kept Garamond for all letterforms because Garamond's editorial tone is a brand asset everywhere except in numerals.

**How it's applied:** Automatic. No `<span class="num">` wrappers, no opt-in classes, no per-page work. The substitution lives at the top of `styles.css` as **section "0. NUMERAL OVERRIDE"** and uses CSS `unicode-range` to re-source the digit code points (`U+0030-0039`) of Cormorant Garamond from the Cormorant Infant latin subset on Google Fonts. The browser stitches the two fonts together at render time. Anywhere `font-family: 'Cormorant Garamond'` is set, digits silently render in Infant.

**When this can break:**
- If anyone removes or renames the override block in `styles.css` while keeping Cormorant Garamond loaded, digits will revert to the unflagged Garamond stem.
- If Google Fonts changes the gstatic versioned URLs for Cormorant Infant (the URL contains a `/v22/` path segment that could become `/v23/`), the override will silently fail and digits will fall back to Garamond. Spot-check with [utah-funding-2025.html](../utah-funding-2025.html) on each font-loading change.
- If a designer hardcodes a different serif (Fraunces, Newsreader, EB Garamond) without applying the same override pattern, the digit rule does not extend automatically.

**Verification:** The 2025 snapshot ([utah-funding-2025.html](../utah-funding-2025.html)) is the canary. Its "169" headline is the most digit-prominent element on the site, and the difference between "169" with override (clearly flagged 1) and without (1 reads as lowercase l) is visible at a glance.

### Type Scale (CSS custom properties)

| Token | Size | Usage |
|-------|------|-------|
| --text-2xs | 11px | Fine print, footnotes |
| --text-xs | 12px | Source citations |
| --text-sm | 13px | Labels, captions |
| --text-base | 15px | Base UI text |
| --text-md | 16px | Card descriptions |
| --text-lg | 17px | Body paragraphs |
| --text-xl | 18px | Large body text |
| --text-2xl | 19px | Section intros |
| --text-3xl | 20px | Subheadings |
| --text-4xl | 22px | Large subheadings |

Inline body text in `index.html` uses 17px as the standard paragraph size. Minimum readable text should be 15px. The type scale was increased +2px from original values in April 2026 to improve readability for older audiences.

---

## Copy Standards

### Consistent CTA Language
- All primary CTA buttons use **"Join Us"** — never "Apply Now" or other variants.

### Key Terminology
- **"exit (return your investment) faster"** — always parenthetically define "exit" for non-investor audiences.
- **"Accredited investor"** — define on first use per SEC rules ($200K income / $1M net assets).
- **Angel investing, syndicate, SPV, SAFE, IRR** — all defined in the Angel Investing 101 accordion on the How It Works page.

### Utah Paradox Framing
- Preferred phrasing: *"In the United States, Utah is ranked #3 to start a business. #50 for women's equality."*
- Follow with: *"The gap between being a great place to start a business and being challenging for women's equality is exactly what makes the opportunity so exciting."*
- Avoid: "That's not a contradiction" or dismissive framings of the inequality.

### Thesis Page Section Order
1. Hero — "Utah's high-performing founders are underfunded"
2. The Utah Paradox — #3/#50 with stat cards
3. Not new. Just new to Utah. — national landscape map + org examples
4. The Science of Small Bets — portfolio math + convergence chart
5. The Data — "Don't take our word for it" + performance stats
6. Sources & methodology

### Section Color Pattern (Thesis Page)
Blue → Cream → Green → Cream → Blue — alternating for contrast.

---

## Header Layout

The standard header sits at the top of every page and is identical in structure across the site. Per-page personality comes from the palette, not the layout.

**Anatomy:**
- **Top tier (`.nav-top`):** Split-circle icon + wordmark (Cormorant Garamond 600, 28px) on the left. "Join" button on the right. Padding `18px 48px 12px` at desktop, with tablet (768px) and phone (480px) responsive overrides — all in `styles.css`, no per-page overrides.
- **Rail tier (`.nav-rail`):** Four core tabs, always present: **Start, Home, The Thesis, How It Works**. The active tab has a moss bottom border. Hover color = `var(--pop)`.
- **Section tab (5th tab):** On standalone pages, a 5th non-link tab appears showing the current section: **About**, **Research**, or **Press**. Hovering this tab opens a dropdown listing every page in that section (mirrors the corresponding footer column). The current page in the dropdown is highlighted in `var(--pop)`. The home page does **not** show a section tab — its 4-tab rail is canonical.

**What varies per page:**
- **Logo right-half** (`.sc-right`) — picks up `var(--pop)` (rust on most pages, teal on About pages, etc.).
- **Join button background** — same `var(--pop)`.
- **Section tab presence** — only on standalone pages, varying label by section.
- The home page's Welcome tab gets a lime accent override in `index.html` via `body:has(#page-welcome.active) .nav-mark .sc-right`. Deliberate exception, intentionally scoped.

### Single Source of Truth (`<site-header>` web component)

The header markup lives in **one file**: [`assets/site-header.js`](../assets/site-header.js). Every page renders it via a `<site-header>` custom element. To update the header (logo, wordmark, Join button, tab labels), edit that one file. Every page picks up the change on next load. No build step.

**Adopt this pattern on any new page.** Two lines, placed where the header should appear (typically the first thing inside `<body>`):

```html
<site-header></site-header>
<script src="assets/site-header.js?v=1"></script>
```

**Do not paste inline `<nav>` markup into new pages.** Inline navs are how the section pages diverged from the home before this consolidation (extra "Join" link in the nav-apply, stale section tab, default browser link blue + underline on the wordmark anchor). The web component prevents that drift.

**Inner home anchors** (Start, Home, Thesis, How) render as `href="index.html#xxx"` so middle-click and cmd-click work as expected. On the home page itself, the component intercepts plain left-clicks and routes through `showPage()` so the SPA-style tab switcher fires instead of a full reload, and syncs the active class to whichever inner page is currently showing.

**Section pages and dropdown configuration:** Each section's pages live in the `SECTIONS` constant at the top of `assets/site-header.js`. Adding a new page to a section is a one-line edit there — the dropdown updates everywhere automatically. To onboard a new standalone page into the rail, give it `<site-header section="about|research|press">` and add an entry to the relevant `SECTIONS[...].pages` array. The dropdown also derives its "current page" highlight by matching `location.pathname` against each entry's `href`, so no per-page wiring is needed.

**The wordmark anchor needs `text-decoration: none`** in `styles.css` (`.nav-mark { text-decoration: none; color: inherit; }`). Without it, browsers apply default `:link` blue and underline. This used to silently afflict every standalone page.

---

## Footer Layout

The standard footer uses:
- **Background:** Sand (#F4EFE6)
- **Top border:** 1px solid rgba(47,62,52,0.08) — matches nav border
- **Layout:** Flexbox, space-between. Brand left, copyright right.
- **Left side:** Split-circle icon + wordmark (light) + tagline (italic)
- **Right side:** Copyright line, small, muted (opacity 0.35)
- **Background element:** Ampersand watermark, right-aligned, 280px, 4% opacity
- **Padding:** 40px top/bottom, 40px sides — compact, not monumental

### Single Source of Truth (`<site-footer>` web component)

The footer markup lives in **one file**: [`assets/site-footer.js`](../assets/site-footer.js). Every page that uses the standard footer renders it via a `<site-footer>` custom element. To update the footer (links, copy, columns, copyright year, legal disclaimer), edit that one file. Every page picks up the change on next load. No build step.

**Adopt this pattern on any new page** that needs the standard footer. Two lines, placed where the footer should appear (typically right before `</body>`):

```html
<site-footer></site-footer>
<script src="assets/site-footer.js?v=1"></script>
```

**Do not paste inline `<footer>` markup into new pages.** Inline footers are how the site drifted out of sync in the first place (stale "Join" links, missing Research entries, "Founding Vision" instead of "Regenerative Capital"). The web component prevents that drift.

**Footer logo color matches the page's header logo** automatically: both `.nav-mark .sc-right` and `.f-mark .sc-right` use `var(--pop)`, so each page's palette flows through to the footer. The home page's lime accent on the Welcome tab is a deliberate exception scoped via `body:has(#page-welcome.active) .f-mark .sc-right` in `index.html`.

**Inner home anchors** (Start, Home, Thesis, How, Story, Community Commitments) render as `href="index.html#xxx"` for normal navigation. On the home page itself, the component intercepts clicks and routes through `showPage()` so the SPA-style tab switcher fires instead of a full reload.

**Pages that intentionally do not use the standard footer:** `dashboard.html` (custom `dash-footer`) and `join.html` (no footer).

---

## Brand Asset Files

All downloadable brand assets live in `assets/logos/brand-assets/`. These are high-resolution transparent PNGs rendered with the Cormorant Garamond font. The public download page is `brand-assets.html`.

### Rust Colorway

| File | Dimensions | Use |
|------|-----------|-----|
| `ssc-primary-logo.png` | 1126 × 205 | Navigation, hero, light backgrounds |
| `ssc-primary-logo-light.png` | 1126 × 205 | Dark backgrounds (cream text, sage/rust circle) |
| `ssc-secondary-logo.png` | 958 × 221 | Footer, stationery, print |
| `ssc-icon.png` | 1024 × 1024 | Favicon, Gmail, social avatars |
| `ssc-compact-mark.png` | 342 × 334 | Co-branding, partnerships, light backgrounds |
| `ssc-compact-mark-dark.png` | 342 × 334 | Co-branding on dark backgrounds |

### Plum Colorway

| File | Dimensions | Use |
|------|-----------|-----|
| `ssc-primary-plum.png` | 1126 × 205 | Alternate colorway, light backgrounds |
| `ssc-primary-plum-light.png` | 1126 × 205 | Alternate colorway, dark backgrounds |
| `ssc-secondary-plum.png` | 958 × 221 | Alternate colorway, footer/print |
| `ssc-icon-plum.png` | 1024 × 1024 | Alternate colorway, favicon/social |
| `ssc-compact-plum.png` | 342 × 334 | Alternate colorway, co-branding |
| `ssc-compact-plum-dark.png` | 342 × 334 | Alternate colorway, dark backgrounds |

### Notes
- All assets are transparent PNG with RGBA color
- Icons are 1024×1024 for Retina sharpness at any display size
- Horizontal logos are auto-cropped to content (no excess whitespace)
- Font source files are in `assets/fonts/` (Cormorant Garamond)
- Re-render script: `assets/logos/export-hires.html` (browser) or run `assets/logos/render-brand-assets.py` (Python/Pillow)

---

*Last updated: April 2026*
