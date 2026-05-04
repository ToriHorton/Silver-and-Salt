/* ═══════════════════════════════════════════════════════════════
   <site-header> — single source of truth for the site header
   (logo + Join button + tab rail). Edit this file to update the
   header everywhere it appears.

   Pages opt in by including:
     <site-header></site-header>
     <script src="assets/site-header.js"></script>

   Notes:
   - Renders into light DOM so existing nav CSS in styles.css and
     each page's overrides apply unchanged.
   - Every page shows the same 4 tabs (Start, Home, The Thesis,
     How It Works). Per-page personality comes from the palette
     (logo right-half and Join button pick up that page's --pop).
   - Inner home anchors use href="index.html#xxx". On the home
     page, clicks are intercepted and routed through showPage()
     so the SPA-style tab switcher fires instead of a full
     navigation. The component also syncs the active class to
     whichever inner page (.page.active) is currently showing.
   ═══════════════════════════════════════════════════════════════ */

class SiteHeader extends HTMLElement {
  connectedCallback() {
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
      <a class="nav-tab" href="index.html#how" data-home-tab="how" data-page="how">How It Works</a>
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
