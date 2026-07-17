// Admin console app. Auth bootstraps through /assets/member-auth.js
// (window.SSCAuth); once the admin role is confirmed the Preact app renders
// into #console-root. Markup and classes match the previous hand-rolled
// console exactly, so the page CSS applies unchanged.
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../lib.js";
import { DashboardTab } from "./dashboard.jsx";
import { PeopleTab } from "./people-crm.jsx";
import { SettingsTab } from "./settings.jsx";

// Tabs remember the active one across reloads via the hash. Deep links from
// emails arrive as ?tab=<name> (mail-client link rewriting drops #fragments
// more often than queries); the hash form also works. Switching tabs
// canonicalizes back to the hash.
const TAB_NAMES = ["dashboard", "people", "settings"];
const TAB_LABELS = {
  dashboard: "Dashboard",
  people: "People",
  settings: "Settings",
};
// Old tab names (billing/calendar/email/calls) folded into the three above.
const LEGACY_TABS = { billing: "dashboard", calendar: "dashboard", calls: "dashboard", email: "settings" };

function initialTab() {
  const fromUrl = new URLSearchParams(location.search).get("tab") || location.hash.replace("#", "");
  const name = fromUrl.split("/")[0];
  if (TAB_NAMES.includes(name)) return name;
  if (LEGACY_TABS[name]) return LEGACY_TABS[name];
  return "dashboard";
}

function AdminApp({ me }) {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    history.replaceState(null, "", location.pathname + "#" + tab);
  }, [tab]);

  const signOut = async () => {
    await window.Clerk.signOut();
    window.location.href = "/members/";
  };

  return (
    <>
      <div class="card">
        <div class="console-row">
          <span class="member-email">{me.email || me.userId}</span>
          <button class="signout-btn" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <div class="tabs-root">
        <div class="tabs" role="tablist">
          {TAB_NAMES.map((name) => (
            <button
              type="button"
              role="tab"
              aria-selected={String(name === tab)}
              onClick={() => setTab(name)}
            >
              {TAB_LABELS[name]}
            </button>
          ))}
        </div>
      </div>
      <div class="tabs-panels">
        {/* Every panel stays mounted (hidden when inactive) so all data
            loads once at sign-in, matching the old parallel boot. */}
        <div class="tabs-panel tab-panel" hidden={tab !== "dashboard"}><DashboardTab /></div>
        <div class="tabs-panel tab-panel" hidden={tab !== "people"}><PeopleTab myUserId={me.userId} superAdmin={me.superAdmin === true} /></div>
        <div class="tabs-panel tab-panel" hidden={tab !== "settings"}><SettingsTab /></div>
      </div>
    </>
  );
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
    const me = await api("/api/me");
    if (me.role !== "admin") {
      $("auth-loading").innerHTML =
        'This area is for administrators. Your member area is at <a href="/members/">silverandsaltcapital.com/members</a>.';
      return;
    }
    $("status-card").classList.add("hidden");
    const root = $("console-root");
    root.classList.remove("hidden");
    render(<AdminApp me={me} />, root);
  } catch (err) {
    $("auth-loading").textContent = "The console is briefly unavailable. Please refresh.";
    console.error(err);
  }
}

boot();
