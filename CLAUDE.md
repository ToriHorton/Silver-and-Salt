# Silver & Salt Capital — Project Instructions

## Workflow Rules
- **Never use git worktrees.** Always work directly on the main branch or create standard branches. Worktrees cause confusion and lost work.
- **Task management:** Before capturing, moving, updating, completing, deleting, or assigning any action item (or changing the Actions code in `dashboard.html`), read `TASK-MANAGEMENT.md` (local-only, git-ignored) and follow its Core Principles and Scenario Playbook.

---

## Brand Rules (always follow)

When writing anything related to the company (copy, HTML, alt text, commit messages, PR titles, documentation, memory entries, anywhere the name appears):

1. **Always write the full name: "Silver & Salt Capital."** Never "Silver & Salt" alone (drops the firm's identity as a capital entity). Never "Silver and Salt Capital" (wrong character).
2. **Always use the ampersand character `&`, never the word "and."**
3. **In HTML on the website,** wrap the ampersand in `<span class="brand-amp">&amp;</span>` so it renders in Cormorant Garamond upright, never italic. The italic ampersand is a curly script glyph that is not part of the brand identity.
4. **No em dashes (`—`) or en dashes (`–`) in any copy.** Use commas, periods, colons, parentheses, or semicolons instead. Hyphens in compound words (e.g., "women-led") are fine; the rule targets dashes only. Em/en dashes read as breathless; our voice is calm and declarative.
5. **Define by what something IS, never by what it isn't.** Avoid "isn't X, it's Y" / "not X, but Y" / "this isn't..." constructions in product, brand, or marketing copy. State the positive directly. Personal narrative negations ("I didn't know it existed") are fine; product/concept negations are not.
6. **Digits 0-9 always render in Cormorant Infant, never Cormorant Garamond.** This is enforced automatically by the `unicode-range` `@font-face` override at the top of `styles.css` (section "0. NUMERAL OVERRIDE"). Do not delete that block, do not wrap digits in `<span class="num">`, and do not introduce new serif display fonts without applying the same override pattern. If a font-loading change is made, spot-check [utah-funding-2025.html](utah-funding-2025.html) afterward, since that page is digit-heavy and the regression would be visible at a glance.
7. **When writing about investing, the investor is "they," never "she."** Collective
   language about the community stays proudly female ("women who talk about money
   out loud"). What changes is the pronoun standing in for one investor in an
   explanation, FAQ, policy, or disclosure. Deal access runs on federal accredited
   criteria alone, and the actual investor may be a spouse, a trust, or an IRA.
8. **Full brand standards live in `_reference/brand-standards.md`.** Consult it before any brand-facing work (logo, color, typography, voice, punctuation).

---

## odla Migration (branch `odla-conversion-test` only)

A phased test migration to odla.ai/Cloudflare is in progress on the branch
`odla-conversion-test`. Durable state lives in `MIGRATION.md` at the repo
root; the runbook is `.agents/skills/odla-migrate/SKILL.md`. Read
`MIGRATION.md` before touching migration work. Production (GitHub Pages on
`main`) stays untouched until Phase 5 sign-off.

---

## Membership Card Section — FINAL (Tori, 2026-08-05)

The "card selection" section is **finished and locked**. Canonical file:
`membership-section-draft.html` (mirrored in `membership-signup-section.html`
and inside `membership-draft.html`). **Use it only as designed; do not
restyle, reorder, or rewrite it without Tori's explicit direction.**
Not yet live; the live site is untouched.

The locked design, in order:

1. **Community Steward, $5,000 a year** — "For anyone who wants this shift to be sustainable." Gold top edge. Bullets (hairline rules, no markers): Everything in Founding Member; 2 hours of complimentary and private financial coaching; A private hour with every visiting expert, before the workshop; The annual retreat, included; Your name recognized as a Community Steward. Gold "A word of thanks" box ("You are the reason this community can exist. Stewardship pays the finance experts and the team who make every gathering happen. Your membership has an outsized impact."). CTA: "Fund the movement →".
2. **Founding Member** — gold seal (100 / ONLY) beside "The founding rate": struck $1,000 → **$900 a year** (Cormorant Infant digits, rust diagonal strike). Italic line: "Your founding rate of **10 percent**, held for as long as you stay." (Guarantee is the RATE, never the dollar.) "Designed for women in Utah." Bullets: 6 money classes, developed with Invest for Better; 20+ optional gatherings, including workshops led by wealth experts; Live pitch meetings, deal memos, and the option to invest*; A voice in finding and selecting the women we fund; A second membership included, for your mother or your daughter. CTA: "Join the action →".
3. **Associate Member, Free** — "Open to everyone, anywhere." White card, outlined CTA. Bullets: Founder pitch recordings for deals that become available after your join date; Deal memos from our completed research; The option to invest*. CTA: "Join for free →". (Wording revised by Tori 2026-08-06 for Rule 506(b) posture: the page solicits membership and relationship, never open deals; materials are framed as past or post-join-date.)
4. **Closer:** bold "Community Stewards and Founding Members learn how to invest, / meet the founders, and pick the companies." (order changed by Tori 2026-08-06; break after "invest," on desktop via `.x-vs-br`, hidden under 700px), then plain "Every member is first to know when a new deal is available." (revised from "can see the open deals" in the same 506(b) pass; flag this line for securities counsel review).
5. **Footnote** (13px Satoshi, enlarged for readability by Tori 2026-08-06): "*Please note, only accredited investors will have the option to invest." with "accredited investors" linking to `#faq-accredited`.
6. **Vertical rhythm compressed (Tori, 2026-08-06)** so cards, closer, and footnote fit one desktop screen (cards about 663px tall; section bottom padding 48px on desktop). Applied to membership.html, membership-section-draft.html, membership-signup-section.html, and membership-draft.html.

**Hero card FINAL (Tori, 2026-08-06).** The membership.html hero is finished and is the standard; do not rewrite without Tori's direction. Copy, in order: H1 "Utah has over 100,000 accredited women investors." with gold italic second line "Many of us were never taught how to build wealth."; one sub paragraph ("Our money is a powerful tool to shape who gets funded in our neighborhoods. It's time more of our startup founders were women."; the donating line was cut by Tori 2026-08-06); kicker "We're gathering the women who want to win together." with lime bold italic "win together"; CTAs "Pick your membership" (#memberships) + "How it works". No fine-print price line in the hero.

**Formatting standard (Tori, 2026-08-06): membership.html now uses the site tokens** (1100px wrap, 120/48/80 hero padding, --text-h1-scale Cormorant hero, 15px tracked Satoshi labels, Satoshi 900 h2s, 19px/1.76 body). New membership-page sections must use these tokens, never the old 880px/12px/16px scale.

**Benefits pillars section FINAL (Tori, 2026-08-06).** The membership.html benefits section is finished; do not restyle or rewrite without Tori's direction. Design, in order: centered ceremonial header (gold hairline label "MEMBERSHIP BENEFITS", Satoshi 900 h2 "Pick your own adventure.", italic Cormorant kicker "Opt in for as few or as many of these resources as you want."), then the tinted accordion: three `details` panels (`.mb-pillar`, tints lime/gold/moss, Cormorant Infant numerals, pillar 1 open by default). Pillar copy is Tori's final wording: 1 "Education about money" (Invest for Better Course with cohort of about 20; Finance Workshops; Office Hour Invite), 2 "Access to deals and due diligence" (Attend 4 pitch gatherings; See the Data Room; Participate in the research; Own your investment), 3 "A kind &amp; effective community of women" (the four community commitments pulled from the index.html "Our Commitments" section). Each pillar ends with a note styled as a white inset box with a gold left rule (`.mb-pillar-note`: Total value estimate; fund line; free second family seat). After the band: "What we hear" section (`.mb-heard`), two objection cards ("I don't have that kind of money." / "If these were good deals, Utah investors would already be in.") with permission-slip and change-the-system answers. Members grid has 5 founding members (Tori, Millicent, Lauren, Lavanya, Crystalee) with LinkedIn photos in members/; the member count line appears automatically at 30 founding members (SHOW_COUNT_AT in membership.html). Tori may make small copy edits; treat structure and design as locked.

**Assembled page (Tori, 2026-08-05): `membership.html` is now the full final membership page** (hero, locked card section, Who's In social proof, benefits pillars band, What we hear, FAQ with `#faq-accredited`, CTA), built from `membership-draft.html` and updated 2026-08-06 per the notes above. `membership-final.html` is an identical staging copy and can be deleted. Still local only; goes live on push to `main`. Unlinked from site navigation so far.

---

## Project State (last updated 2026-04-11)

### Website
- **Live at:** silverandsaltcapital.com (GitHub Pages, auto-deploys on push to `main`)
- **Repo:** github.com/ToriHorton/Silver-and-Salt
- **Stack:** Static HTML/CSS, no build step

### Pages
- `index.html` — Homepage
- `join.html` — ✅ LIVE: Two-step investor application (form → calendar booking)
- `dashboard.html` — CEO command center (gitignored; published daily as an unlinked, noindexed copy at the obscure URL `hq-25b5a94e297e.html` with `granola-inbox.js` + `newsletter-data.js`, per Tori's 2026-07-14 decision, pending password protection; never link that URL from any public page)
  - **Canonical version (Tori, 2026-07-14): the single-page `dashboard.html` on the MacBook Pro.** The split pages on the other computer (`dashboard-actions.html`, `dashboard-newsletter.html`, `dashboard.css`, `dashboard-app.js`) are deprecated; do not build on them.
- `manifesto.html`, `opportunity.html`, `networks.html` etc. — Supporting pages

### join.html — Application Flow
- **Step 1:** Form captures name, email, org, referral, focus areas, intro message
- **Step 2:** Google Calendar Appointments iframe for scheduling a 30-min intro call
- **Step 3:** Confirmation screen with Ivy Baker Priest quote and sepia photo
- **Backend:** the odla worker (`POST /api/applications` into odla-db). The
  former Google Apps Script backend (Sheet + Gmail sends; was FORM-SETUP.md
  and membership-form-script.gs) was retired on this branch 2026-07-13;
  transactional email comes from the worker's @odla-ai/email pipeline.
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
