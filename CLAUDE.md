# Silver & Salt Capital — Project Instructions

## Workflow Rules
- **Never use git worktrees.** Always work directly on the main branch or create standard branches. Worktrees cause confusion and lost work.

---

## Brand Rules (always follow)

When writing anything related to the company (copy, HTML, alt text, commit messages, PR titles, documentation, memory entries, anywhere the name appears):

1. **Always write the full name: "Silver & Salt Capital."** Never "Silver & Salt" alone (drops the firm's identity as a capital entity). Never "Silver and Salt Capital" (wrong character).
2. **Always use the ampersand character `&`, never the word "and."**
3. **In HTML on the website,** wrap the ampersand in `<span class="brand-amp">&amp;</span>` so it renders in Cormorant Garamond upright, never italic. The italic ampersand is a curly script glyph that is not part of the brand identity.
4. **No em dashes (`—`) or en dashes (`–`) in any copy.** Use commas, periods, colons, parentheses, or semicolons instead. Hyphens in compound words (e.g., "women-led") are fine; the rule targets dashes only. Em/en dashes read as breathless; our voice is calm and declarative.
5. **Define by what something IS, never by what it isn't.** Avoid "isn't X, it's Y" / "not X, but Y" / "this isn't..." constructions in product, brand, or marketing copy. State the positive directly. Personal narrative negations ("I didn't know it existed") are fine; product/concept negations are not.
6. **Digits 0-9 always render in Cormorant Infant, never Cormorant Garamond.** This is enforced automatically by the `unicode-range` `@font-face` override at the top of `styles.css` (section "0. NUMERAL OVERRIDE"). Do not delete that block, do not wrap digits in `<span class="num">`, and do not introduce new serif display fonts without applying the same override pattern. If a font-loading change is made, spot-check [utah-funding-2025.html](utah-funding-2025.html) afterward, since that page is digit-heavy and the regression would be visible at a glance.
7. **Full brand standards live in `_reference/brand-standards.md`.** Consult it before any brand-facing work (logo, color, typography, voice, punctuation).

---

## Project State (last updated 2026-04-11)

### Website
- **Live at:** silverandsaltcapital.com (GitHub Pages, auto-deploys on push to `main`)
- **Repo:** github.com/ToriHorton/Silver-and-Salt
- **Stack:** Static HTML/CSS, no build step

### Pages
- `index.html` — Homepage
- `join.html` — ✅ LIVE: Two-step investor application (form → calendar booking)
- `dashboard.html` — CEO command center
- `manifesto.html`, `opportunity.html`, `networks.html` etc. — Supporting pages

### join.html — Application Flow
- **Step 1:** Form captures name, email, org, referral, focus areas, intro message
- **Step 2:** Google Calendar Appointments iframe for scheduling a 30-min intro call
- **Step 3:** Confirmation screen with Ivy Baker Priest quote and sepia photo
- **Backend:** Google Apps Script Web App (see `FORM-SETUP.md` for details)
  - Writes rows to Google Sheet "Silver & Salt Capital — Applications"
  - Sends notification to tori@silverandsaltcapital.com + confirmation to applicant
- **Styling:** Treatment E — sage left panel, lime right panel, cream wordmark
- **Voice:** Approachable and premium — "A few questions, followed by a brief conversation."

### Recent Fixes (2026-04-11)
- Back-link changed to visible white text (was low-contrast sage, nearly invisible)
- On mobile: back-link now block-level at top of hero instead of absolute-positioned in corner
- Calendar iframe `overflow: hidden` → `overflow: visible` (was cutting off the booking widget)
- Mobile calendar kept at 600px height with touch scrolling enabled
- Quote card centers on mobile (image + identity text) instead of left-aligning
- Added 768px breakpoint for tablets — was only 480px before

### Brand
- Full standards in `BRAND.md`
- Use `join.html` copy as the voice reference for new pages
