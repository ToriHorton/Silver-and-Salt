// Admin console app — Phase 5: the packaged <ChapterAdmin/> replaces the
// hand-rolled three-tab console.
//
// What is PRESERVED (owner decision 2026-07-25: public and member surfaces stay
// exactly as they are; only the admin console adopts Chapter's):
//   - the host page's own header, sign-in shell, and status card (admin/index.html)
//   - the Clerk bootstrap through window.SSCAuth, including the sign-in
//     containment and the deep-link round trip
//   - the /api/me role check and the non-admin redirect copy
//   - the #console-root mount point and the page's CSS
//
// What CHANGES: the tab UI and its three panels are replaced by ChapterAdmin,
// which supplies the same Dashboard / People / Settings grammar from the
// resolved chapter config. The old dashboard.jsx / people-crm.jsx /
// settings.jsx panels are no longer imported. They stay in the tree until the
// deployed console is signed off, then get deleted in one reviewed change.
//
// chrome="embedded" (the default) is REQUIRED here: the site header already
// exists on the page, and "standalone" would render a second masthead.

// Theme layer first, then the shared component sheet, then the CRM layout.
// ChapterAdmin renders a loud red banner if the theme layer is missing, so this
// import order is load-bearing rather than cosmetic. "salt" is the packaged
// theme that already carries this brand's palette and font pairing.
import "@odla-ai/ui/themes/salt/scope.css";
import "@odla-ai/ui/index.css";
import "@odla-ai/crm/ui.css";

import { render } from "preact";
import { ChapterAdmin } from "@odla-ai/chapter/ui/admin";
import { chapter } from "../../chapter.config.mjs";

// Inbound compatibility: the admin notification email links with ?tab=people,
// and older links used ?tab=billing / calendar / calls / email, which the
// previous console folded into three tabs. Chapter's canonical form is a
// fragment (/admin/#people/...), so translate on arrival and let Chapter own
// routing from then on. Dropping this would break links already sitting in the
// owner's inbox.
const LEGACY_TAB_TO_WORKSPACE = {
  dashboard: "dashboard",
  people: "people",
  settings: "settings",
  billing: "dashboard",
  calendar: "dashboard",
  calls: "dashboard",
  email: "settings",
};

function adoptLegacyDeepLink() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get("tab");
  if (!fromQuery) return;
  const workspace = LEGACY_TAB_TO_WORKSPACE[fromQuery.split("/")[0]];
  if (!workspace) return;
  // Canonicalize to the fragment form and drop the query, so a refresh or a
  // copied URL uses Chapter's routing rather than re-entering this branch.
  params.delete("tab");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + "#" + workspace);
}

const $ = (id) => document.getElementById(id);

function showSignIn() {
  $("status-card").classList.add("hidden");
  const mount = $("signin-mount");
  mount.classList.remove("hidden");
  window.Clerk.mountSignIn(mount, {
    appearance: window.SSCAuth.APPEARANCE,
    signUpUrl: "/join.html",
    // Keep the ?tab= or #tab deep link through the sign-in round trip.
    fallbackRedirectUrl: location.pathname + location.search + location.hash,
  });
}

async function boot() {
  try {
    const clerk = await window.SSCAuth.loadClerk();
    if (!clerk.user) {
      showSignIn();
      return;
    }
    const me = await window.SSCAuth.api("/api/me");
    if (me.role !== "admin") {
      $("auth-loading").innerHTML =
        'This area is for administrators. Your member area is at <a href="/members/">silverandsaltcapital.com/members</a>.';
      return;
    }

    adoptLegacyDeepLink();

    $("status-card").classList.add("hidden");
    const root = $("console-root");
    root.classList.remove("hidden");

    render(
      <ChapterAdmin
        chapter={chapter}
        chrome="embedded"
        basePath="/admin/"
        crmBasePath="/api/crm"
        // Reuse the Clerk session this page already established instead of
        // letting the console run a second auth flow. The adapter hands
        // Chapter the token getter and the already-fetched user, so there is
        // exactly one sign-in and one /api/me round trip.
        auth={{
          currentUserPath: "/api/me",
          loadCurrentUser: async () => me,
          isAuthorized: (u) => u?.role === "admin",
        }}
      />,
      root,
    );
  } catch (err) {
    console.error(err);
    $("auth-loading").textContent = "The console is briefly unavailable. Please refresh.";
  }
}

boot();
