# Silver & Salt Capital — Project Instructions

## Workflow Rules
- **Never use git worktrees.** Always work directly on the main branch or create standard branches. Worktrees cause confusion and lost work.

---

## Project State (last updated 2026-04-09)

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
- **Backend:** Google Apps Script Web App (see `FORM-SETUP.md` for details)
  - Writes rows to Google Sheet "Silver & Salt Capital — Applications"
  - Sends notification to tori@silverandsaltcapital.com + confirmation to applicant
- **Styling:** Treatment E — sage left panel, lime right panel, cream wordmark
- **Voice:** Approachable and premium — "A few questions, followed by a brief conversation."

### Brand
- Full standards in `BRAND.md`
- Use `join.html` copy as the voice reference for new pages
