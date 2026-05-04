/* ═══════════════════════════════════════════════════════════════
   <site-header> — single source of truth for the site header
   (logo + Join button + tab rail). Edit this file to update the
   header everywhere it appears.

   Pages opt in by including:
     <site-header></site-header>                  <!-- home -->
     <site-header section="about"></site-header>  <!-- About pages -->
     <site-header section="research"></site-header>
     <site-header section="press"></site-header>
     <script src="assets/site-header.js"></script>

   Notes:
   - Renders into light DOM so existing nav CSS in styles.css and
     each page's overrides apply unchanged.
   - The 4 home tabs (Start, Home, The Thesis, How It Works) are
     always present. On standalone pages, a 5th section tab is
     added (About / Research / Press) showing where you are. The
     section tab opens a dropdown on hover listing the section's
     pages, mirroring the footer columns.
   - Inner home anchors use href="index.html#xxx". On the home
     page, clicks are intercepted and routed through showPage()
     so the SPA-style tab switcher fires instead of a full
     navigation. The component also syncs the active class to
     whichever inner page (.page.active) is currently showing.
   ═══════════════════════════════════════════════════════════════ */

const SECTIONS = {
  about: {
    label: 'About',
    pages: [
      { label: 'Our Story', href: 'index.html#story' },
      { label: 'Community Commitments', href: 'index.html#about' },
      { label: 'Regenerative Capital', href: 'manifesto.html' },
      { label: 'FAQs', href: 'faqs.html' },
    ],
  },
  research: {
    label: 'Research',
    pages: [
      { label: 'The Opportunity', href: 'opportunity.html' },
      { label: 'The Networks', href: 'networks.html' },
      { label: 'Utah Funding 2025', href: 'utah-funding-2025.html' },
      { label: 'Utah Capital Landscape', href: 'utah-funding-research.html' },
      { label: 'Accredited Investors', href: 'accredited-women-research.html' },
      { label: 'National Landscape Map', href: 'landscape-map.html' },
      { label: 'References', href: 'source-bible.html' },
      { label: 'Open Research', href: 'open-research.html' },
    ],
  },
  press: {
    label: 'Press',
    pages: [
      { label: 'Press Contact', href: 'https://forms.gle/dN1DJgWZs9X7Z8U8A', external: true },
      { label: 'Brand Assets', href: 'brand-assets.html' },
    ],
  },
};

class SiteHeader extends HTMLElement {
  connectedCallback() {
    const sectionKey = (this.getAttribute('section') || '').toLowerCase();
    const section = SECTIONS[sectionKey] || null;
    const currentFile = location.pathname.split('/').pop() || 'index.html';

    let sectionTabHTML = '';
    if (section) {
      const items = section.pages.map(p => {
        const isCurrent = !p.external && p.href === currentFile;
        const targetAttr = p.external ? ' target="_blank" rel="noopener"' : '';
        return `<a class="section-dd-link${isCurrent ? ' current' : ''}" href="${p.href}"${targetAttr}>${p.label}</a>`;
      }).join('');
      sectionTabHTML = `
      <div class="nav-tab section-tab active" aria-current="page">
        <span class="section-tab-label">${section.label}</span>
        <div class="section-dropdown" role="menu">${items}</div>
      </div>`;
    }

    this.innerHTML = `
<nav>
  <div class="nav-top">
    <a class="nav-mark" href="index.html" data-home-tab="welcome">
      <div class="split-circle"><div class="sc-left"></div><div class="sc-right"></div><div class="sc-amp">&amp;</div></div>
      <span class="wordmark">Silver <span class="wm-amp">&amp;</span> Salt Capital</span>
    </a>
    <a href="/join.html" target="_blank" rel="noopener" class="nav-apply">Join</a>
  </div>
  <div class="nav-rail">
    <div class="nav-tabs">
      <a class="nav-tab" href="index.html#start" data-home-tab="start" data-page="start">Start</a>
      <a class="nav-tab" href="index.html" data-home-tab="welcome" data-page="welcome">Home</a>
      <a class="nav-tab" href="index.html#thesis" data-home-tab="thesis" data-page="thesis">The Thesis</a>
      <a class="nav-tab" href="index.html#how" data-home-tab="how" data-page="how">How It Works</a>${sectionTabHTML}
    </div>
  </div>
</nav>
`;

    if (typeof window.showPage === 'function') {
      this.querySelectorAll('a[data-home-tab]').forEach(a => {
        a.addEventListener('click', (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          window.showPage(a.dataset.homeTab);
        });
      });
      // Reflect whichever inner page is currently active
      const activePage = document.querySelector('.page.active');
      if (activePage) {
        const id = activePage.id.replace(/^page-/, '');
        const tab = this.querySelector(`.nav-tab[data-page="${id}"]`);
        if (tab) tab.classList.add('active');
      }
    }
  }
}

customElements.define('site-header', SiteHeader);
