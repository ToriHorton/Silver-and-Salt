/* Landscape Map · interactive logic
   Reads ORG_DATA from org-data.js + US_STATE_PATHS from us-state-paths.js  */
(function(){
  'use strict';

  const STATE_ABBR = {
    Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA',
    Colorado:'CO', Connecticut:'CT', Delaware:'DE', Florida:'FL', Georgia:'GA',
    Hawaii:'HI', Idaho:'ID', Illinois:'IL', Indiana:'IN', Iowa:'IA',
    Kansas:'KS', Kentucky:'KY', Louisiana:'LA', Maine:'ME', Maryland:'MD',
    Massachusetts:'MA', Michigan:'MI', Minnesota:'MN', Mississippi:'MS',
    Missouri:'MO', Montana:'MT', Nebraska:'NE', Nevada:'NV',
    'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY',
    'North Carolina':'NC', 'North Dakota':'ND', Ohio:'OH', Oklahoma:'OK',
    Oregon:'OR', Pennsylvania:'PA', 'Rhode Island':'RI', 'South Carolina':'SC',
    'South Dakota':'SD', Tennessee:'TN', Texas:'TX', Utah:'UT',
    Vermont:'VT', Virginia:'VA', Washington:'WA', 'Washington DC':'DC',
    'West Virginia':'WV', Wisconsin:'WI', Wyoming:'WY'
  };

  // Category derivation from raw "c" field e.g. "3) Venture Fund"
  function catKey(c){
    if (!c) return 'other';
    if (/Education/i.test(c)) return 'education';
    if (/Angel/i.test(c)) return 'angels';
    if (/Venture/i.test(c)) return 'funds';
    if (/Syndicate/i.test(c)) return 'syndicates';
    return 'other';
  }
  const CAT_LABEL = {
    education:'Education', angels:'Angels',
    funds:'Venture Funds', syndicates:'Syndicates'
  };
  const BADGE_CLASS = {
    education:'b-edu', angels:'b-ang', funds:'b-vc', syndicates:'b-syn'
  };

  // Parse cost / extract first sentence (founder side) and a numeric estimate
  function parseCost(s){
    if (!s) return {founder:'—', lp:'—', founderClass:'free'};
    const parts = s.split('|').map(x=>x.trim());
    const founderSide = parts[0] || s;
    const lpSide = parts[1] || '';

    // Extract a representative price tag
    let founderClass = 'free';
    if (/free/i.test(founderSide) && !/\$/.test(founderSide)) founderClass = 'free';
    else if (/\$\s*(\d{1,3}(?:,\d{3})*|\d+(?:k|K))/.test(founderSide)) {
      const m = founderSide.match(/\$\s*(\d{1,3}(?:,\d{3})*)/);
      if (m){
        const n = parseInt(m[1].replace(/,/g,''),10);
        founderClass = n < 100 ? 'low' : n < 1000 ? 'mid' : 'high';
      }
    }
    return {founder:founderSide, lp:lpSide, founderClass};
  }

  // Estimate a check-size summary from text
  function extractCheckSize(text){
    const m = (text||'').match(/Checks?:\s*([^.]+?)\./i) ||
              (text||'').match(/\$[\d,KMk\.\-\s]+(?:to|-|–)\s*\$[\d,KMk\.\-\s]+/);
    return m ? m[0].replace(/^Checks?:\s*/i,'').trim() : '—';
  }
  function extractStage(text){
    const m = (text||'').match(/Stage:\s*([^.]+?)\./i);
    return m ? m[1].trim() : '—';
  }
  function extractSectors(text){
    const m = (text||'').match(/Sectors?:\s*([^.]+?)\./i);
    return m ? m[1].trim() : '—';
  }

  // Confidence rating heuristic per record.
  // Tiered against the explicit promise: a "Verified" record must have a live URL,
  // a named lead with a role, AND a concrete cost figure (a dollar amount or "free")
  // that is NOT hedged by "not disclosed / assumed / industry-standard".
  function confidence(o){
    const costRaw = o.cost || '';
    const cost = costRaw.toLowerCase();
    const summary = (o.f || o.t || '').toLowerCase();
    const hasUrl = !!(o.w && /^https?:/.test(o.w));
    const hasLeadFull = !!(o.l1 && o.l1[0] && o.l1[1]);
    const hasLeadName = !!(o.l1 && o.l1[0]);
    const hedged = /not publicly|not disclosed|not listed|not specified|undisclosed|assumed|industry-standard|industry standard|estimated|specific amounts not|fund-level economics|fund level economics|not public/i.test(cost+' '+summary);
    // Verified requires a concrete dollar figure (not just "free"). "Free" alone
    // is usually one side of a two-sided cost — the LP side is what hedges.
    const hasDollarFigure = /\$\s*\d/.test(costRaw);
    const hasFree = /\bfree\b/i.test(costRaw);

    if (hedged) return 'low';
    if (hasUrl && hasLeadFull && hasDollarFigure) return 'high';
    if (hasUrl && (hasLeadName || hasDollarFigure || hasFree)) return 'medium';
    return 'low';
  }
  const CONF_LABEL = { high:'Verified', medium:'Sourced', low:'Estimated' };
  const CONF_CLASS = { high:'conf-h', medium:'conf-m', low:'conf-l' };

  // ─── enrich data ───────────────────────────────────────────
  const RAW = (window.ORG_DATA || []).map((o,i)=>{
    const cat = catKey(o.c);
    const cost = parseCost(o.cost);
    return {
      id:i,
      state: o.s,
      name: o.n,
      url: o.w,
      cat,
      catLabel: CAT_LABEL[cat] || o.c,
      summary: (o.f || o.t || '').replace(/\s*Stage:.*$/,'').trim(),
      full: o.f || o.t || '',
      lead: (o.l1 && o.l1[0]) ? o.l1[0] : '',
      leadRole: (o.l1 && o.l1[1]) ? o.l1[1] : '',
      city: (o.l2 && o.l2[0]) ? o.l2[0] : '',
      cost,
      stage: extractStage(o.f || o.t || ''),
      checks: extractCheckSize(o.f || o.t || ''),
      sectors: extractSectors(o.f || o.t || ''),
      conf: confidence(o)
    };
  });

  const STATE_LIST = Object.keys(STATE_ABBR);

  // ─── elements ──────────────────────────────────────────────
  const svgWrap = document.getElementById('lm-svg-wrap');
  const tooltip = document.getElementById('lm-tooltip');
  const drawerHead = document.getElementById('lm-drawer-head');
  const drawerList = document.getElementById('lm-drawer-list');
  const dirGrid = document.getElementById('lm-dir-grid');
  const dirTable = document.getElementById('lm-dir-table');
  const dirCount = document.getElementById('lm-dir-count');
  const dirSearch = document.getElementById('lm-dir-search');
  const dirCatSelect = document.getElementById('lm-dir-cat');
  const dirStateSelect = document.getElementById('lm-dir-state');
  const dirViewBtns = document.querySelectorAll('.lm-view-toggle button');

  // ─── state ─────────────────────────────────────────────────
  let activeCats = new Set(); // empty = all
  let selectedState = null; // null = National view
  let dirView = 'grid';

  function catMatch(o){
    return activeCats.size === 0 || activeCats.has(o.cat);
  }

  // ─── build SVG map ─────────────────────────────────────────
  function buildMap(){
    const paths = window.US_STATE_PATHS || [];
    const vb = window.US_VIEWBOX || '192 9 1028 746';
    const svg = `<svg class="lm-us-map" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      ${paths.map(p=>`<path class="lm-state" data-state="${p.state}" d="${p.d}"></path>`).join('')}
    </svg>`;
    svgWrap.innerHTML = svg;
    svgWrap.querySelectorAll('.lm-state').forEach(node=>{
      const st = node.getAttribute('data-state');
      node.addEventListener('click', e=>{
        e.stopPropagation();
        selectedState = (selectedState === st) ? null : st;
        render();
      });
      node.addEventListener('mouseenter', e=>{
        const c = countFor(st);
        tooltip.innerHTML = `<div class="name">${st}</div><div class="count">${c} ${c===1?'organization':'organizations'}</div>`;
        tooltip.style.display = 'block';
        positionTip(e);
      });
      node.addEventListener('mousemove', positionTip);
      node.addEventListener('mouseleave', ()=>{ tooltip.style.display = 'none'; });
    });
  }
  function positionTip(e){
    const rect = svgWrap.getBoundingClientRect();
    tooltip.style.left = (e.clientX - rect.left) + 'px';
    tooltip.style.top = (e.clientY - rect.top) + 'px';
  }

  function countFor(state){
    return RAW.filter(o => o.state === state && catMatch(o)).length;
  }
  function densityClass(n){
    if (n === 0) return 'lm-d0';
    if (n <= 1) return 'lm-d1';
    if (n <= 3) return 'lm-d2';
    if (n <= 6) return 'lm-d3';
    if (n <= 12) return 'lm-d4';
    return 'lm-d5';
  }

  function colorMap(){
    svgWrap.querySelectorAll('.lm-state').forEach(node=>{
      const st = node.getAttribute('data-state');
      const n = countFor(st);
      node.classList.remove('lm-d0','lm-d1','lm-d2','lm-d3','lm-d4','lm-d5','selected');
      node.classList.add(densityClass(n));
      if (st === selectedState) node.classList.add('selected');
    });
  }

  // ─── drawer ────────────────────────────────────────────────
  function renderDrawer(){
    const isNational = !selectedState;
    const orgs = RAW.filter(o=>{
      if (!catMatch(o)) return false;
      if (selectedState && o.state !== selectedState) return false;
      return true;
    });

    // header
    if (isNational){
      const labels = activeCats.size === 0 ? 'National Landscape' :
                     activeCats.size === 1 ? `All ${CAT_LABEL[[...activeCats][0]]||[...activeCats][0]}` :
                     [...activeCats].map(c=>CAT_LABEL[c]).join(' + ');
      const title = labels;
      drawerHead.innerHTML = `
        <div class="lm-drawer-eyebrow">Selection</div>
        <div class="lm-drawer-title">${title}</div>
        <div class="lm-drawer-meta">
          <span><b>${orgs.length}</b> organizations</span>
          <span><b>${new Set(orgs.map(o=>o.state)).size}</b> regions</span>
          <span style="color:var(--sage)">Click any state to focus</span>
        </div>`;
    } else {
      const stateOrgs = RAW.filter(o=>o.state===selectedState);
      const breakdown = ['funds','angels','syndicates','education']
        .map(k=>{ const n = stateOrgs.filter(o=>o.cat===k).length; return n? `<span><b>${n}</b> ${CAT_LABEL[k].toLowerCase()}</span>`:''; })
        .filter(Boolean).join('');
      drawerHead.innerHTML = `
        <div class="lm-drawer-eyebrow">${STATE_ABBR[selectedState]||''} · State view</div>
        <div class="lm-drawer-title">${selectedState}</div>
        <div class="lm-drawer-meta">${breakdown || `<span style="color:var(--sage)">No organizations recorded yet</span>`}</div>`;
    }

    // list
    if (orgs.length === 0){
      drawerList.innerHTML = `
        <div class="lm-drawer-empty">
          <b>Coverage gap detected.</b>
          We have no organizations recorded in this slice. If you know of one,
          <a href="mailto:tori@silverandsaltcapital.com?subject=Landscape%20Map%20—%20Addition%20(${encodeURIComponent(selectedState||'National')})" style="color:var(--rust)">tell us</a>
          and we'll add it.
        </div>`;
      return;
    }

    drawerList.innerHTML = orgs.map(o => orgRowHTML(o)).join('');
    drawerList.querySelectorAll('.lm-org-row').forEach(row=>{
      row.addEventListener('click', e=>{
        if (e.target.tagName === 'A') return;
        row.classList.toggle('expanded');
      });
    });
  }

  function orgRowHTML(o){
    const badge = BADGE_CLASS[o.cat] || 'b-syn';
    const conf = CONF_CLASS[o.conf];
    const confLabel = CONF_LABEL[o.conf];
    const domain = o.url ? o.url.replace(/^https?:\/\//,'').replace(/\/$/,'') : '';
    return `<div class="lm-org-row" data-id="${o.id}">
      <div class="lm-org-top">
        <div class="lm-org-name">${escapeHTML(o.name)}</div>
        <span class="lm-org-badge ${badge}">${o.catLabel}</span>
      </div>
      <div class="lm-org-tag-row">
        ${o.city ? `<span><b>${escapeHTML(o.city)}</b></span>` : `<span><b>${escapeHTML(o.state)}</b></span>`}
        ${o.checks && o.checks!=='—' ? `<span>· ${escapeHTML(o.checks)}</span>` : ''}
        <span class="lm-conf ${conf}">${confLabel}</span>
      </div>
      <div class="lm-org-summary">${escapeHTML(o.summary)}</div>
      <div class="lm-org-detail">
        <dl class="lm-detail-grid">
          ${o.lead ? `<dt>Lead</dt><dd>${escapeHTML(o.lead)}${o.leadRole?`, ${escapeHTML(o.leadRole)}`:''}</dd>` : ''}
          ${o.stage && o.stage!=='—' ? `<dt>Stage</dt><dd>${escapeHTML(o.stage)}</dd>` : ''}
          ${o.checks && o.checks!=='—' ? `<dt>Check size</dt><dd>${escapeHTML(o.checks)}</dd>` : ''}
          ${o.sectors && o.sectors!=='—' ? `<dt>Sectors</dt><dd>${escapeHTML(o.sectors)}</dd>` : ''}
          <dt>Cost · founder</dt><dd>${escapeHTML(o.cost.founder)}</dd>
          ${o.cost.lp ? `<dt>Cost · LP</dt><dd>${escapeHTML(o.cost.lp)}</dd>` : ''}
          <dt>Confidence</dt><dd>${confLabel} <span class="lm-conf ${conf}">${o.conf}</span></dd>
        </dl>
        <div class="lm-detail-actions">
          ${domain ? `<a class="lm-detail-link" href="${o.url}" target="_blank" rel="noopener">Visit ${domain} →</a>` : ''}
          <a class="lm-detail-link" href="mailto:tori@silverandsaltcapital.com?subject=${encodeURIComponent('Correction: '+o.name)}">Suggest a correction →</a>
        </div>
      </div>
    </div>`;
  }

  // ─── category pills ────────────────────────────────────────
  function buildCatPills(){
    const counts = { all:RAW.length, funds:0, angels:0, syndicates:0, education:0 };
    RAW.forEach(o => counts[o.cat] = (counts[o.cat]||0)+1);
    const wrap = document.getElementById('lm-cat-pills');
    wrap.innerHTML = `
      <span class="label">Filter ·</span>
      <button class="lm-cat-pill active" data-cat="all">All <span class="count">${counts.all}</span></button>
      <button class="lm-cat-pill" data-cat="funds">Venture Funds <span class="count">${counts.funds}</span></button>
      <button class="lm-cat-pill" data-cat="angels">Angels <span class="count">${counts.angels}</span></button>
      <button class="lm-cat-pill" data-cat="syndicates">Syndicates <span class="count">${counts.syndicates}</span></button>
      <button class="lm-cat-pill" data-cat="education">Education <span class="count">${counts.education}</span></button>
      <span class="lm-cat-hint">Tip · click multiple to combine</span>`;
    wrap.querySelectorAll('.lm-cat-pill').forEach(b=>{
      b.addEventListener('click', ()=>{
        const cat = b.getAttribute('data-cat');
        if (cat === 'all'){
          activeCats.clear();
        } else {
          if (activeCats.has(cat)) activeCats.delete(cat);
          else activeCats.add(cat);
        }
        // sync visual state
        wrap.querySelectorAll('.lm-cat-pill').forEach(x=>{
          const xc = x.getAttribute('data-cat');
          if (xc === 'all') x.classList.toggle('active', activeCats.size === 0);
          else x.classList.toggle('active', activeCats.has(xc));
        });
        render();
      });
    });
  }

  // ─── timeline + cost charts ────────────────────────────────
  function buildCharts(){
    drawTimelineChart();
    drawCostChart();
  }

  // Timeline: counts by category, bar chart showing cumulative over founding-decade buckets.
  // We don't have founding years per record, so we render a category-distribution bar chart instead
  // (clearly labeled) — this keeps the visual but is honest about the data we have.
  function drawTimelineChart(){
    const svg = document.getElementById('lm-timeline-svg');
    const W = 560, H = 280, P = {l:48, r:16, t:16, b:48};
    const data = [
      {k:'funds',     label:'Venture Funds', n: RAW.filter(o=>o.cat==='funds').length},
      {k:'angels',    label:'Angels',    n: RAW.filter(o=>o.cat==='angels').length},
      {k:'syndicates',label:'Syndicates',n: RAW.filter(o=>o.cat==='syndicates').length},
      {k:'education', label:'Education', n: RAW.filter(o=>o.cat==='education').length}
    ];
    const max = Math.max(...data.map(d=>d.n));
    const bw = (W - P.l - P.r) / data.length - 16;
    const chartH = H - P.t - P.b;
    const yTicks = 5;
    const colors = { education:'#C4A47E', angels:'#D16B4F', funds:'#1A8F7D', syndicates:'#3D5A99' };
    let html = '';
    // gridlines
    for (let i=0;i<=yTicks;i++){
      const y = P.t + chartH * (i/yTicks);
      const v = Math.round(max * (1 - i/yTicks));
      html += `<line class="lm-chart-grid" x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}"/>`;
      html += `<text class="lm-chart-axis" x="${P.l-8}" y="${y+3}" text-anchor="end">${v}</text>`;
    }
    // bars
    data.forEach((d,i)=>{
      const x = P.l + i*((W-P.l-P.r)/data.length) + 8;
      const h = (d.n / max) * chartH;
      const y = P.t + chartH - h;
      html += `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${colors[d.k]}" opacity="0.9"/>`;
      html += `<text class="lm-chart-axis" x="${x+bw/2}" y="${y-6}" text-anchor="middle" style="font-size:14px;fill:var(--moss);font-weight:700;font-family:'Cormorant Garamond',serif;">${d.n}</text>`;
      html += `<text class="lm-chart-axis" x="${x+bw/2}" y="${H-P.b+18}" text-anchor="middle">${d.label.toUpperCase()}</text>`;
    });
    svg.innerHTML = html;
  }

  // Cost-to-participate distribution: bucketed by the cost an INVESTOR (or member,
  // or LP) actually faces. Venture funds always carry economics (industry standard
  // 2% mgmt + 20% carry where undisclosed), so they never sit in the "free" bucket.
  function drawCostChart(){
    const buckets = [
      {k:'free',   label:'Free to participate',     color:'#1A8F7D', n:0},
      {k:'low',    label:'Under $500 / year',       color:'#7E8E84', n:0},
      {k:'mid',    label:'$500–$3,000 / year',      color:'#C4A47E', n:0},
      {k:'high',   label:'$3,000+ or LP minimums',  color:'#D16B4F', n:0},
      {k:'fund',   label:'Fund economics (2 & 20)', color:'#3D5A99', n:0},
      {k:'unknown',label:'Not publicly disclosed',  color:'#3A4A3F', n:0}
    ];
    RAW.forEach(o=>{
      let k;
      const founder = (o.cost.founder || '').toLowerCase();
      const lp = (o.cost.lp || '').toLowerCase();
      const combined = founder + ' ' + lp;

      // Funds always carry 2&20 economics; never "free"
      if (o.cat === 'funds'){
        k = 'fund';
      } else if (/not publicly|not disclosed|undisclosed|not listed|not specified/i.test(combined)) {
        k = 'unknown';
      } else {
        // angels / education / syndicates → bucket by founder-side dollar amount
        const dollar = combined.match(/\$\s*([\d,]+)/);
        if (dollar){
          const n = parseInt(dollar[1].replace(/,/g,''),10);
          if (n < 500) k = 'low';
          else if (n < 3000) k = 'mid';
          else k = 'high';
        } else if (/\bfree\b/i.test(combined)) {
          k = 'free';
        } else {
          k = 'unknown';
        }
      }
      const b = buckets.find(x=>x.k===k) || buckets[5];
      b.n++;
    });

    const svg = document.getElementById('lm-cost-svg');
    const W = 560, H = 320, P = {l:210, r:36, t:8, b:24};
    const max = Math.max(...buckets.map(b=>b.n));
    const rowH = (H - P.t - P.b) / buckets.length;
    let html = '';
    buckets.forEach((b,i)=>{
      const y = P.t + i*rowH + 6;
      const w = (b.n / max) * (W - P.l - P.r);
      html += `<text class="lm-chart-axis" x="${P.l-10}" y="${y+rowH/2}" text-anchor="end" style="font-size:11px;fill:var(--moss);font-weight:600;text-transform:none;letter-spacing:0;">${b.label}</text>`;
      html += `<rect x="${P.l}" y="${y}" width="${w}" height="${rowH-12}" fill="${b.color}" opacity="0.9"/>`;
      html += `<text x="${P.l+w+8}" y="${y+(rowH-12)/2+4}" style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;fill:var(--moss);">${b.n}</text>`;
    });
    svg.innerHTML = html;
  }

  // ─── directory ─────────────────────────────────────────────
  function buildDirControls(){
    // populate state select
    dirStateSelect.innerHTML = `<option value="all">All states</option>` +
      STATE_LIST.map(s=>`<option value="${s}">${s} (${RAW.filter(o=>o.state===s).length})</option>`).join('') +
      `<option value="National">National (${RAW.filter(o=>o.state==='National').length})</option>`;
    dirCatSelect.innerHTML = `<option value="all">All categories</option>
      <option value="funds">Venture Funds (${RAW.filter(o=>o.cat==='funds').length})</option>
      <option value="angels">Angels (${RAW.filter(o=>o.cat==='angels').length})</option>
      <option value="syndicates">Syndicates (${RAW.filter(o=>o.cat==='syndicates').length})</option>
      <option value="education">Education (${RAW.filter(o=>o.cat==='education').length})</option>`;

    [dirSearch, dirCatSelect, dirStateSelect].forEach(el=> el.addEventListener('input', renderDir));

    dirViewBtns.forEach(b=>{
      b.addEventListener('click', ()=>{
        dirView = b.getAttribute('data-view');
        dirViewBtns.forEach(x=>x.classList.toggle('active', x===b));
        renderDir();
      });
    });
  }

  function renderDir(){
    const q = (dirSearch.value || '').toLowerCase().trim();
    const cat = dirCatSelect.value;
    const state = dirStateSelect.value;
    const orgs = RAW.filter(o=>{
      if (cat !== 'all' && o.cat !== cat) return false;
      if (state !== 'all' && o.state !== state) return false;
      if (q && !((o.name+' '+o.summary+' '+o.state+' '+o.lead+' '+o.city).toLowerCase().includes(q))) return false;
      return true;
    });
    dirCount.textContent = `${orgs.length} of ${RAW.length} organizations`;

    if (orgs.length === 0){
      dirGrid.style.display='none';
      dirTable.style.display='none';
      const empty = document.getElementById('lm-dir-empty');
      empty.style.display = 'block';
      empty.innerHTML = `<div class="lm-dir-empty">No organizations match. Try clearing a filter.</div>`;
      return;
    }
    document.getElementById('lm-dir-empty').style.display = 'none';

    if (dirView === 'grid'){
      dirGrid.style.display = 'grid';
      dirTable.style.display = 'none';
      dirGrid.innerHTML = orgs.map(o=>{
        const badge = BADGE_CLASS[o.cat] || 'b-syn';
        return `<div class="lm-dir-card" data-id="${o.id}">
          <div class="lm-dir-card-top">
            <div class="lm-dir-state">${o.city || o.state}</div>
            <span class="lm-org-badge ${badge}">${o.catLabel}</span>
          </div>
          <div class="lm-dir-name">${escapeHTML(o.name)}</div>
          <div class="lm-dir-summary">${escapeHTML(o.summary)}</div>
          <div class="lm-dir-foot">
            <span><b>Checks</b> ${escapeHTML(o.checks||'—')}</span>
            <span class="lm-conf ${CONF_CLASS[o.conf]}">${CONF_LABEL[o.conf]}</span>
          </div>
        </div>`;
      }).join('');
      dirGrid.querySelectorAll('.lm-dir-card').forEach(card=>{
        card.addEventListener('click', ()=>{
          const id = +card.getAttribute('data-id');
          // scroll to map and select state
          const o = RAW.find(x=>x.id===id);
          if (o){
            selectedState = o.state === 'National' ? null : o.state;
            activeCats.clear();
            document.querySelectorAll('.lm-cat-pill').forEach(p=>p.classList.toggle('active', p.getAttribute('data-cat')==='all'));
            render();
            document.getElementById('explore').scrollIntoView({behavior:'smooth', block:'start'});
            // expand the right row in the drawer
            setTimeout(()=>{
              const row = drawerList.querySelector(`.lm-org-row[data-id="${o.id}"]`);
              if (row){ row.classList.add('expanded'); row.scrollIntoView({behavior:'smooth', block:'center'}); }
            }, 600);
          }
        });
      });
    } else {
      dirGrid.style.display = 'none';
      dirTable.style.display = 'table';
      dirTable.innerHTML = `
        <thead><tr>
          <th>Organization</th><th>Type</th><th>Location</th>
          <th>Stage</th><th>Check size</th><th>Cost</th><th>Confidence</th>
        </tr></thead>
        <tbody>
        ${orgs.map(o=>{
          const badge = BADGE_CLASS[o.cat] || 'b-syn';
          const domain = o.url ? o.url.replace(/^https?:\/\//,'').replace(/\/$/,'') : '';
          return `
          <tr data-id="${o.id}">
            <td class="name-cell"><b>${escapeHTML(o.name)}</b><div class="domain">${escapeHTML(domain)}</div></td>
            <td><span class="lm-org-badge ${badge}">${o.catLabel}</span></td>
            <td>${escapeHTML(o.city || o.state)}</td>
            <td>${escapeHTML(o.stage||'—')}</td>
            <td>${escapeHTML(o.checks||'—')}</td>
            <td style="max-width:240px;font-size:11px;color:var(--moss-light);">${escapeHTML(truncate(o.cost.founder, 80))}</td>
            <td><span class="lm-conf ${CONF_CLASS[o.conf]}">${CONF_LABEL[o.conf]}</span></td>
          </tr>
          <tr class="lm-dir-table-detail" data-detail-for="${o.id}" style="display:none">
            <td colspan="7"><div class="inner">
              <div>
                <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--sage);margin-bottom:8px;">Description</div>
                <div style="font-size:13px;color:var(--moss-light);line-height:1.65;">${escapeHTML(o.full)}</div>
              </div>
              <div>
                <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--sage);margin-bottom:8px;">Cost &amp; access</div>
                <div style="font-size:12px;color:var(--moss);line-height:1.65;margin-bottom:10px;"><b>Founders</b> · ${escapeHTML(o.cost.founder)}</div>
                ${o.cost.lp ? `<div style="font-size:12px;color:var(--moss);line-height:1.65;margin-bottom:10px;"><b>LPs / Members</b> · ${escapeHTML(o.cost.lp)}</div>` : ''}
                ${o.lead ? `<div style="font-size:12px;color:var(--moss);"><b>Lead</b> · ${escapeHTML(o.lead)}${o.leadRole?', '+escapeHTML(o.leadRole):''}</div>` : ''}
                <div style="margin-top:14px;display:flex;gap:14px;">
                  ${domain ? `<a class="lm-detail-link" href="${o.url}" target="_blank" rel="noopener">${domain} →</a>`:''}
                  <a class="lm-detail-link" href="mailto:tori@silverandsaltcapital.com?subject=${encodeURIComponent('Correction: '+o.name)}">Correction →</a>
                </div>
              </div>
            </div></td>
          </tr>`;
        }).join('')}
        </tbody>`;
      dirTable.querySelectorAll('tbody tr[data-id]').forEach(row=>{
        row.addEventListener('click', ()=>{
          const id = row.getAttribute('data-id');
          const detail = dirTable.querySelector(`tr[data-detail-for="${id}"]`);
          const open = row.classList.toggle('expanded');
          if (detail) detail.style.display = open ? 'table-row' : 'none';
        });
      });
    }
  }

  function escapeHTML(s){
    return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function truncate(s,n){ s=String(s||''); return s.length>n ? s.slice(0,n-1)+'…' : s; }

  function render(){
    colorMap();
    renderDrawer();
  }

  // ─── init ──────────────────────────────────────────────────
  function init(){
    if (!window.ORG_DATA || !window.US_STATE_PATHS){
      console.error('Missing ORG_DATA or US_STATE_PATHS');
      return;
    }
    buildMap();
    buildCatPills();
    buildCharts();
    buildDirControls();
    render();
    renderDir();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
