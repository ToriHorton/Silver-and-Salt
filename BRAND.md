# Silver & Salt Capital — Brand Standards

A reference for maintaining visual consistency across the site.

---

## Fonts

| Role | Family | Weights | Source |
|------|--------|---------|--------|
| **Display / Serif** | Cormorant Garamond | 300, 400, 600, 700 (+ italics) | Google Fonts |
| **Body / UI** | Satoshi | 400, 500, 700, 900 | Fontshare |

**Rules:**
- Cormorant Garamond is used for hero headlines, section headings, stat numbers, blockquotes, and the wordmark
- Satoshi is used for body text, labels, buttons, nav links, and all UI elements
- No other fonts should be added. Inter and Libre Caslon Display have been removed.

---

## Color Palette

### Core colors (always available)
| Token | Hex | Usage |
|-------|-----|-------|
| `--cream` | `#FBF8F2` | Page background |
| `--sand` | `#F4EFE6` | Section backgrounds, cards |
| `--moss` | `#2F3E34` | Primary text, dark surfaces |
| `--moss-light` | `#4A5E50` | Body text |
| `--sage` | `#7E8E84` | Muted text, labels |
| `--rust` | `#D16B4F` | Default accent (standalone pages) |
| `--teal` | `#1A8F7D` | Opportunity page accent |
| `--warm` | `#C4A47E` | Gold accent |

### Dynamic palettes (index.html — set by JS)
Each tab page uses a different palette via `--pop`, `--accent`, `--highlight`:

| Page | Palette | `--pop` | Notes |
|------|---------|---------|-------|
| Home | Rust | `#D16B4F` | Warm terracotta |
| The Thesis | Ink | `#3D5A99` | Deep blue |
| How It Works | Plum | `#8B5E83` | Muted purple |
| Join | Lime | `#7CB83F` | Vibrant green |
| About | Rust | `#D16B4F` | Same as Home |

---

## Spacing Scale

All spacing uses CSS custom properties from `styles.css`:

```
--space-1:  4px     --space-9:  40px
--space-2:  8px     --space-10: 48px
--space-3:  12px    --space-11: 56px
--space-4:  16px    --space-12: 64px
--space-5:  20px    --space-13: 80px
--space-6:  24px    --space-14: 96px
--space-7:  28px    --space-15: 112px
--space-8:  32px    --space-16: 120px
```

**Usage:** Section padding uses large values (80-120px vertical). Component padding uses mid-range (16-48px). Inline spacing uses small (4-12px).

---

## Type Scale

### Static sizes
| Token | Size | Usage |
|-------|------|-------|
| `--text-2xs` | 9px | Footnote superscripts |
| `--text-xs` | 10px | Eyebrow labels, stat labels |
| `--text-sm` | 11px | Nav links, small labels, tags |
| `--text-base` | 13px | Body small, CTAs |
| `--text-md` | 14px | Card descriptions |
| `--text-lg` | 15px | Body alternate |
| `--text-xl` | 16px | Section body |
| `--text-2xl` | 17px | Primary body text |
| `--text-3xl` | 18px | Hero sub-line |
| `--text-4xl` | 20px | Nav wordmark, stat numbers |

### Fluid headings
| Token | Range | Usage |
|-------|-------|-------|
| `--text-h6` | 20-28px | Card titles |
| `--text-h5` | 22-32px | Medium headings |
| `--text-h4` | 26-36px | Section sub-headings |
| `--text-h3` | 28-42px | Section headings |
| `--text-h2` | 36-56px | Page heroes |
| `--text-h1` | 48-72px | Main hero titles |
| `--text-display` | 52-108px | Statement numbers |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Buttons, badges |
| `--radius-md` | 8px | Cards, inputs |
| `--radius-lg` | 12px | Large cards |
| `--radius-full` | 50% | Circles, avatars |
| `--radius-pill` | 100px | Pill shapes |

---

## Buttons

Three standardized variants defined in `styles.css`:

| Class | Style | Usage |
|-------|-------|-------|
| `.btn .btn-primary` | Solid `--pop` background | Primary CTAs |
| `.btn .btn-outline` | Transparent, moss border | Secondary actions |
| `.btn .btn-ghost` | Text-only with underline | Inline links |

Legacy aliases `.btn-pop` and `.btn-dark` still work but map to `.btn-primary`.

---

## Letter Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--tracking-tight` | -0.03em | Display headings |
| `--tracking-snug` | -0.02em | Large headings |
| `--tracking-normal` | -0.01em | Regular headings |
| `--tracking-wide` | 0.02em | Buttons, UI text |
| `--tracking-wider` | 0.06em | Nav links, small labels |
| `--tracking-widest` | 0.14em | Section labels |
| `--tracking-ultra` | 0.22em | Hero eyebrows |

---

## Line Height

| Token | Value | Usage |
|-------|-------|-------|
| `--leading-none` | 1 | Stat numbers, display text |
| `--leading-tight` | 1.1 | Headings |
| `--leading-snug` | 1.3 | Sub-headings |
| `--leading-normal` | 1.55 | Card descriptions |
| `--leading-relaxed` | 1.7 | Body text |
| `--leading-loose` | 1.8 | Long-form body |

---

## File Structure

| File | Purpose |
|------|---------|
| `styles.css` | **Shared stylesheet** — all tokens, base styles, nav, buttons, footer, animations |
| `index.html` | Main site (5 tab pages) — page-specific CSS only |
| `manifesto.html` | Founding Vision — page-specific CSS only |
| `opportunity.html` | The Opportunity — page-specific CSS only |
| `networks.html` | Women's Angel Collectives — page-specific CSS only |
| `open-research.html` | Open Research — page-specific CSS only |

### Adding a new page
1. Link `styles.css` before any inline `<style>` block
2. Add `class="nav-standalone"` to `<nav>` element
3. Add `class="has-grain"` to `<body>` if grain overlay is desired
4. Only add page-specific CSS in the inline `<style>` block
5. Use design tokens for all spacing, type, radius, and color values

---

## Navigation

**Index.html** uses a two-tier nav: logo bar (`nav-top`) + tab rail (`nav-rail`).

**Standalone pages** use a single-tier nav: logo + links + CTA (`nav-standalone`).

Both share the same fixed positioning and backdrop blur from `styles.css`.

---

## Surface Classes

| Class | Effect |
|-------|--------|
| `.s-cream` | Cream background |
| `.s-sand` | Sand background |
| `.s-dark` | Moss background, light text (auto-adjusts h2, h3, .body, .label colors) |
| `.s-glow` | Radial gradient overlay using `--accent-soft` and `--pop-glow` |

---

## Layout & Alignment Standards

### Horizontal padding
All sections, heroes, and full-width containers use **48px** horizontal padding at desktop. This is the single standard — never use 40px.

| Breakpoint | Horizontal padding |
|------------|-------------------|
| Desktop (>900px) | 48px |
| Tablet (768px) | 24px |
| Mobile (480px) | 16px |

### Content max-width
All main content containers use **max-width: 1100px** with `margin: 0 auto`. The `.wrap` class provides this.

Intentionally narrower containers (for readability) may use 680px or 720px, but their **parent section** must still use 48px padding and full-width backgrounds.

### Text alignment
- **Home page**: Centered hero and CTA sections
- **The Thesis, How It Works, Join**: Left-aligned content within `.wrap` containers
- **Standalone pages** (Manifesto, Opportunity, Networks, Open Research): Left-aligned
- **CTA sections**: Always centered (these are calls-to-action, not content)

### Centering approach
- Use `margin: 0 auto` for structural centering (containers)
- Use `text-align: center` only for content that should visually center (CTAs, hero text on Home page)

---

## Sources & Citations

### Approach
Clean and confident. No inline citation numbers cluttering the text. Sources are shown in two ways:

1. **Stat cards** — Source name in small gray text directly on the card (e.g., "BCG / MassChallenge")
2. **Page-level sources section** — A single "Sources & methodology" section at the bottom of each page listing claims with their sources, plus a link to the Open Research page

### Source section markup
Use the `.page-sources` component from `styles.css`:
```html
<div class="page-sources">
  <div class="page-sources-heading">Sources & methodology</div>
  <ul class="page-sources-list">
    <li><span class="claim">Claim text</span> <span class="source">— Source name</span></li>
  </ul>
  <a href="open-research.html" class="page-sources-link">Full research & methodology →</a>
</div>
```

---

## Key Copy Decisions

| Element | Text | Notes |
|---------|------|-------|
| Home CTA strip | "We're starting now." | Urgency + confidence |
| Home CTA subtext | "The first 100 members will set the thesis, shape the culture, and define what comes next." | Founding member appeal |
| Closing line | "Utah's next generation of innovation will be shaped by founders & determined by funders — it's time more of them are women." | Used on Home, Manifesto, Join pages. Always weight 600, cream/white color for readability on dark backgrounds. |
