# Mobile Audit & Fix — Silver & Salt Capital

## Context
The site has partial mobile support — index.html has breakpoints at 900/768/600px and some pages (manifesto, opportunity, accredited-women-research, source-bible) have a 768px breakpoint. But three pages (networks.html, open-research.html, utah-funding-research.html) have zero media queries, and all standalone pages hide the "Back to Home" link on mobile with no replacement. Touch targets, spacing, and typography need tightening across the board.

## Scope — 8 files, 5 categories of fixes

### 1. Add mobile hamburger menu to all standalone pages
**Files:** manifesto.html, opportunity.html, networks.html, open-research.html, utah-funding-research.html, accredited-women-research.html, source-bible.html

Currently standalone pages have `nav` with logo + "Back to Home" link. At 768px the link is hidden (or there's no media query at all). Fix:
- Add a hamburger button (CSS-only, no JS library) that reveals a dropdown with "Back to Home" and "Apply" links
- Consistent nav markup and styles across all standalone pages
- Tap target minimum 44×44px for the hamburger

### 2. Add media queries to the 3 pages that have none
**Files:** networks.html, open-research.html, utah-funding-research.html

**networks.html (768px):**
- Nav padding: 48px → 16px
- Hero padding: 120px 48px → 100px 16px
- `.stats-row`: flex-wrap already set, reduce gap
- `.ss-card`: single column (`grid-template-columns: 1fr`)
- `.network-grid`: `minmax(320px, 1fr)` → `1fr` (force single column)
- `.main` padding: 64px 48px → 48px 16px
- Map section padding: 48px → 16px

**open-research.html (768px):**
- Nav padding: 48px → 16px
- Hero padding: 120px 48px → 100px 16px
- `.stats-bar`: flex-wrap, reduce gap, reduce padding
- `.main` padding: 80px 48px → 48px 16px
- `.principles` grid: 2-col → 1-col
- `.report-card` grid: 2-col → 1-col (stack report number above content)

**utah-funding-research.html (768px):**
- Nav padding: 48px → 16px
- Hero padding: 120px 48px → 100px 16px
- `.main` padding: 64px 48px → 48px 16px
- `.key-findings` grid: auto-fit → 2-col for mobile
- `.data-table`: horizontal scroll wrapper or smaller font
- `.callout` padding: reduce

### 3. Improve index.html mobile experience
**File:** index.html

- Add 480px breakpoint for small phones (font sizes, hero padding)
- Ensure tab nav has visual scroll indicator (fade edge) so users know to swipe
- Touch target on nav tabs: increase height to 44px minimum
- Ensure Apply button doesn't shrink too small on narrow screens

### 4. Global mobile touch & spacing fixes (all files)
- Minimum 44×44px touch targets on all interactive elements (links, buttons)
- Ensure no horizontal overflow on any page at 375px width
- Tables: add `overflow-x: auto` wrapper or reduce font size on mobile
- Ensure font sizes are readable (minimum 14px body text on mobile)

### 5. Small-screen (480px) typography pass
**All files with media queries:**
- Add 480px breakpoint where missing for very small screens
- Reduce large heading sizes further
- Ensure callout/stat numbers don't overflow containers

## Files to modify (in order)
1. `networks.html` — add full 768px + 480px media queries + mobile nav
2. `open-research.html` — add full 768px + 480px media queries + mobile nav
3. `utah-funding-research.html` — add full 768px + 480px media queries + mobile nav
4. `index.html` — improve existing mobile styles, tab nav UX, add 480px breakpoint
5. `manifesto.html` — add mobile nav hamburger, review existing 768px styles
6. `opportunity.html` — add mobile nav hamburger, review existing 768px styles
7. `accredited-women-research.html` — add mobile nav hamburger, review existing 768px
8. `source-bible.html` — add mobile nav hamburger, review existing 768px

## Mobile nav pattern (shared across standalone pages)
```html
<button class="nav-menu-btn" onclick="this.closest('nav').classList.toggle('nav-open')" aria-label="Menu">
  <span></span><span></span><span></span>
</button>
```
```css
.nav-menu-btn { display:none; } /* hidden on desktop */
@media(max-width:768px) {
  .nav-menu-btn { display:flex; flex-direction:column; gap:5px; ... 44×44px tap target }
  .nav-back, .nav-links { display:none; }
  nav.nav-open .nav-dropdown { display:flex; }
}
```

## Verification
- Preview each page at 375px (iPhone SE), 390px (iPhone 14), and 768px (iPad) widths
- Check no horizontal scroll at any width
- Verify all tap targets are at least 44×44px
- Verify hamburger menu opens/closes and links work
- Verify tables don't overflow on mobile
