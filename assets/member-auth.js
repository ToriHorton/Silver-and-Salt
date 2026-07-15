/* ═══════════════════════════════════════════════════════════════
   SSCAuth — shared auth bootstrap for the member and admin pages.
   Loads ClerkJS from the publishable key served by /api/auth/config,
   holds the session token, and provides an authenticated fetch helper
   plus shared formatting utilities.

   Pages opt in with:
     <script src="/assets/member-auth.js?v=1"></script>
   Bump the ?v= on every change (cached visitors keep old copies).

   Brand note: Clerk widgets are themed via APPEARANCE variables only.
   Element-level overrides fight Clerk's internal layout and break it
   (learned the hard way; see MIGRATION.md).
   ═══════════════════════════════════════════════════════════════ */
(function () {
  const APPEARANCE = {
    variables: {
      colorPrimary: '#7CB83F',
      colorText: '#2F3E34',
      colorTextSecondary: '#7E8E84',
      colorBackground: '#ffffff',
      fontFamily: "'Satoshi', 'Helvetica Neue', Arial, sans-serif",
      borderRadius: '4px',
    },
  };

  let sessionToken = null;

  // Start clerk-js immediately from a locally cached publishable key
  // (refreshing the cache in the background), so repeat visits skip the
  // config round trip that used to serialize in front of the ~300KB
  // clerk-js download. A stale cached key falls back to a fresh fetch.
  const CONFIG_CACHE_KEY = 'ssc-auth-config-v1';

  async function bootClerkWith(pk) {
    // The Clerk frontend API host is encoded in the publishable key.
    const frontendApi = atob(pk.split('_')[2]).replace(/\$$/, '');
    const pre = document.createElement('link');
    pre.rel = 'preconnect';
    pre.href = 'https://' + frontendApi;
    document.head.appendChild(pre);
    await new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = 'https://' + frontendApi + '/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
      s.setAttribute('data-clerk-publishable-key', pk);
      s.onload = resolve;
      s.onerror = function () { reject(new Error('clerk-js failed to load')); };
      document.head.appendChild(s);
    });
    await window.Clerk.load();
  }

  async function loadClerk() {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null'); } catch (e) { /* ignore */ }

    const freshPromise = fetch('/api/auth/config')
      .then(function (r) { return r.json(); })
      .then(function (c) {
        if (c && c.publishableKey) localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(c));
        return c;
      })
      .catch(function () { return null; });

    let pk = cached && cached.publishableKey;
    if (pk) {
      try {
        await bootClerkWith(pk);
      } catch (e) {
        // Stale cache (rotated key, retired instance): retry fresh once.
        localStorage.removeItem(CONFIG_CACHE_KEY);
        const fresh = await freshPromise;
        pk = fresh && fresh.publishableKey;
        if (!pk) throw new Error('no publishable key');
        await bootClerkWith(pk);
      }
    } else {
      const fresh = await freshPromise;
      pk = fresh && fresh.publishableKey;
      if (!pk) throw new Error('no publishable key');
      await bootClerkWith(pk);
    }

    if (window.Clerk.user) {
      sessionToken = await window.Clerk.session.getToken();
    }
    return window.Clerk;
  }

  // Authenticated JSON fetch; throws on any non-2xx status.
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    if (sessionToken) headers.authorization = 'Bearer ' + sessionToken;
    if (opts.body) headers['content-type'] = 'application/json';
    const res = await fetch(path, Object.assign({}, opts, { headers: headers }));
    if (!res.ok) throw new Error(path + ' -> ' + res.status);
    return res.json();
  }

  // Meeting times always carry an explicit timezone; when the group's
  // scheduling zone is known it anchors the rendering, so every viewer
  // reads the same labelled instant.
  function fmtMeeting(ms, tz) {
    return new Date(ms).toLocaleString(undefined, {
      ...(tz ? { timeZone: tz } : {}),
      weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  }

  function toLocalInputValue(ms) {
    const d = new Date(ms);
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  window.SSCAuth = {
    APPEARANCE: APPEARANCE,
    loadClerk: loadClerk,
    api: api,
    fmtMeeting: fmtMeeting,
    toLocalInputValue: toLocalInputValue,
  };
})();
