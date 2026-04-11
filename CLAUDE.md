# Silver & Salt Capital — Project Instructions

## Workflow Rules
- **Never use git worktrees.** Always work directly on the main branch or create standard branches. Worktrees cause confusion and lost work.

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
