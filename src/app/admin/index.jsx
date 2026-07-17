// Admin console app. Auth bootstraps through /assets/member-auth.js
// (window.SSCAuth); once the admin role is confirmed the Preact app renders
// into #console-root. Markup and classes match the previous hand-rolled
// console exactly, so the page CSS applies unchanged.
import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { api } from "../lib.js";
import { PeopleTab } from "./people-crm.jsx";
import { BillingTab } from "./billing.jsx";
import { CalendarTab } from "./calendar.jsx";
import { AvailabilityTab } from "./availability.jsx";
import { EmailTab } from "./email.jsx";

// Tabs remember the active one across reloads via the hash. Deep links from
// emails arrive as ?tab=<name> (mail-client link rewriting drops #fragments
// more often than queries); the hash form also works. Switching tabs
// canonicalizes back to the hash.
const TAB_NAMES = ["people", "billing", "calendar", "settings", "email"];
const TAB_LABELS = {
  people: "People",
  billing: "Billing",
  calendar: "Calendar",
  settings: "Call Settings",
  email: "Email Settings",
};

function initialTab() {
  const fromUrl = new URLSearchParams(location.search).get("tab") || location.hash.replace("#", "");
  // The calendar tab deep-links its subview: #calendar/month/2026-08.
  const name = fromUrl.split("/")[0];
  // The Introduction Calls tab folded into Calendar (2026-07-15); old
  // bookmarks land on the agenda and the hash canonicalizes itself.
  if (name === "calls") return "calendar";
  return TAB_NAMES.includes(name) ? name : "people";
}

function AdminApp({ me }) {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    // CalendarTab owns the hash while active (it carries view + period).
    if (tab === "calendar") return;
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
        <div class="tabs-panel tab-panel" hidden={tab !== "people"}><PeopleTab myUserId={me.userId} superAdmin={me.superAdmin === true} /></div>
        <div class="tabs-panel tab-panel" hidden={tab !== "billing"}><BillingTab /></div>
        <div class="tabs-panel tab-panel" hidden={tab !== "calendar"}><CalendarTab active={tab === "calendar"} /></div>
        <div class="tabs-panel tab-panel" hidden={tab !== "settings"}><AvailabilityTab /></div>
        <div class="tabs-panel tab-panel" hidden={tab !== "email"}><EmailTab /></div>
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
