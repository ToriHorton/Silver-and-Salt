// Member area.
//
// chapter's MembersArea renders the account header, the provisional
// application card (including the booking and reschedule flow), and the member
// content, using the same class names this page's CSS already targets
// (card, card-label, member-row, member-email, role-badge, account-actions,
// admin-console-link, meeting-block/kicker/date/note, apply-link, msched-*).
// So the packaged component drops into the existing stylesheet unchanged.
//
// The hero and the sign-in mount stay page-owned DOM, updated here directly,
// because they sit above the island.

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  ClerkGate,
  SignedIn,
  SignedOut,
  SignIn,
  useClerkAuth,
} from "@odla-ai/auth-clerk";
import { MembersArea } from "@odla-ai/chapter/ui/member";
import { chapter } from "../chapter.config.mjs";

const $ = (id) => document.getElementById(id);

// Clerk is themed with appearance VARIABLES only. Element-level overrides fight
// the widget's internal layout and broke it once; the fix was to carry brand
// through variables and let Clerk render its own card on the page field.
const APPEARANCE = {
  variables: {
    colorPrimary: "#7CB83F",
    colorText: "#2F3E34",
    colorTextSecondary: "#7E8E84",
    colorBackground: "#ffffff",
    fontFamily: "'Satoshi', 'Helvetica Neue', Arial, sans-serif",
    borderRadius: "4px",
  },
};

/** What a fully approved member sees below the account header. */
function MemberContent() {
  return (
    <>
      <div class="card">
        <div class="card-label">Training Material</div>
        <ul class="section-list">
          <li><span class="item-mark">✦</span> Foundations of angel investing <span class="soon">Coming soon</span></li>
          <li><span class="item-mark">✦</span> Reading a term sheet with confidence <span class="soon">Coming soon</span></li>
          <li><span class="item-mark">✦</span> How Silver <span class="brand-amp">&amp;</span> Salt Capital evaluates opportunities <span class="soon">Coming soon</span></li>
        </ul>
      </div>
      <div class="card">
        <div class="card-label">Upcoming Events</div>
        <p class="empty-note">Member gatherings and salon evenings will be announced here. Watch this space and your inbox.</p>
      </div>
    </>
  );
}

function SignedInView() {
  const { getToken, signOut, user } = useClerkAuth();
  const [role, setRole] = useState("provisional");

  // Every request carries a FRESH session token; Clerk's are short-lived, so a
  // token captured once goes stale on a page left open.
  const api = async (path, opts = {}) => {
    const token = await getToken();
    const res = await fetch(path, {
      ...opts,
      headers: {
        "content-type": "application/json",
        ...(opts.headers || {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  // The hero copy differs for a provisional member, and the hero is page DOM.
  useEffect(() => {
    let live = true;
    void api("/api/me")
      .then((me) => live && setRole(me.role || "provisional"))
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    $("status-card")?.classList.add("hidden");
    $("hero-title").textContent = "Member Area";
    $("hero-sub").textContent = role === "provisional"
      ? "Thank you for joining us. Full membership follows your introduction call."
      : "Welcome back.";
  }, [role]);

  return (
    <MembersArea
      api={api}
      signOut={() => { void signOut().then(() => { window.location.href = "/members/"; }); }}
      adminHref="/admin/"
      applyHref="/join.html"
      memberContent={<MemberContent />}
      copy={chapter.copy.members}
      key={user?.id}
    />
  );
}

function SignInView() {
  const params = new URLSearchParams(location.search);

  useEffect(() => { $("status-card")?.classList.add("hidden"); }, []);

  // Clerk renders its own card, so the host wrapper only centers it and keeps
  // overflow visible (the widget's labels sit outside its box).
  return (
    <div class="signin-mount">
      <SignIn
        appearance={APPEARANCE}
        signUpUrl="/join.html"
        fallbackRedirectUrl="/members/"
        initialValues={params.get("email") ? { emailAddress: params.get("email") } : undefined}
      />
    </div>
  );
}

async function boot() {
  // Membership starts with the application, and applying creates the account,
  // so every sign-up pathway routes to the form (including old ?view=sign-up
  // links that used to open Clerk's hosted, off-brand sign-up page).
  if (new URLSearchParams(location.search).get("view") === "sign-up") {
    window.location.replace("/join.html");
    return;
  }

  let publishableKey;
  try {
    ({ clerkPublishableKey: publishableKey } = await fetch("/api/config").then((r) => r.json()));
  } catch (err) {
    console.error(err);
  }
  if (!publishableKey) {
    $("auth-loading").textContent =
      "Sign in is briefly unavailable. Please refresh, or return to the site and try again.";
    return;
  }

  render(
    <ClerkGate publishableKey={publishableKey} appearance={APPEARANCE} afterSignOutUrl="/members/">
      <SignedIn><SignedInView /></SignedIn>
      <SignedOut><SignInView /></SignedOut>
    </ClerkGate>,
    $("members-root"),
  );
}

void boot();
