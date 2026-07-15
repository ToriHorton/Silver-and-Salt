// Member area app. Renders the signed-in view (account header plus the
// provisional application card or the member material) into #members-root;
// the hero and sign-in mount stay page-owned DOM, updated here directly.
import { render } from "preact";

const $ = (id) => document.getElementById(id);
const linkStyle = "color: var(--lime-dark); font-weight: 700; text-decoration: none;";

function MembershipLine({ application }) {
  if (!application?.paid) return null;
  return (
    <div class="meeting-note" style="margin-top:16px;">
      Your founding membership is active
      {application.renewalAt
        ? " and renews " + new Date(application.renewalAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
        : ""}.
    </div>
  );
}

function ProvisionalCard({ application }) {
  const { fmtMeeting } = window.SSCAuth;
  let block;
  if (application && application.status === "refunded") {
    block = (
      <div class="meeting-block">
        <div class="meeting-kicker">Membership refunded</div>
        <div class="meeting-note">Your founding-member fee has been refunded in full and your membership is canceled. Thank you for your interest in Silver <span class="brand-amp">&amp;</span> Salt Capital.</div>
      </div>
    );
  } else if (application && application.meetingAt) {
    block = (
      <div class="meeting-block">
        <div class="meeting-kicker">Your introduction call</div>
        <div class="meeting-date">{fmtMeeting(application.meetingAt, application.timezone)}</div>
        <div class="meeting-note">A calendar invitation with the video call link is in your email. We look forward to meeting you.</div>
        {application.meetUrl && (
          <div class="meeting-note"><a href={application.meetUrl} target="_blank" rel="noopener" style={linkStyle}>Join the video call</a></div>
        )}
        <div class="meeting-note"><a href={"/join.html?reschedule=" + application.id} style="color: var(--sage); text-decoration: underline;">Change your time</a></div>
        <MembershipLine application={application} />
      </div>
    );
  } else if (application) {
    block = (
      <div class="meeting-block">
        <div class="meeting-kicker">Application received</div>
        <div class="meeting-note">Your application is in. Your introduction call details will appear here once your time is confirmed, and a calendar invitation will reach your email.</div>
        <MembershipLine application={application} />
      </div>
    );
  } else {
    block = (
      <div class="meeting-block">
        <div class="meeting-kicker">One step remains</div>
        <div class="meeting-note">Your account is ready, and the application that completes it takes a few minutes.</div>
        <a class="apply-link" href="/join.html">Apply for membership</a>
      </div>
    );
  }
  return (
    <div class="card">
      <div class="card-label">Your Application</div>
      {block}
    </div>
  );
}

function MemberView() {
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

function MembersApp({ me, email }) {
  const role = me.role || "provisional";
  const signOut = async () => {
    await window.Clerk.signOut();
    window.location.href = "/members/";
  };
  return (
    <>
      <div class="card">
        <div class="member-row">
          <span class="member-email">{email}</span>
          <span class={"role-badge " + role}>{role}</span>
        </div>
        <div class="account-actions">
          <button class="signout-btn" onClick={signOut}>Sign out</button>
          {role === "admin" && <a class="admin-console-link" href="/admin/">Admin console</a>}
        </div>
      </div>
      {role === "provisional" ? <ProvisionalCard application={me.application} /> : <MemberView />}
    </>
  );
}

function showSignIn() {
  $("status-card").classList.add("hidden");
  const mount = $("signin-mount");
  mount.classList.remove("hidden");

  const params = new URLSearchParams(location.search);
  // Membership starts with the application, and applying creates the
  // account automatically, so every "sign up" pathway routes to the
  // application form (including old ?view=sign-up links).
  if (params.get("view") === "sign-up") {
    window.location.replace("/join.html");
    return;
  }
  window.Clerk.mountSignIn(mount, {
    appearance: window.SSCAuth.APPEARANCE,
    signUpUrl: "/join.html",
    fallbackRedirectUrl: "/members/",
    initialValues: params.get("email") ? { emailAddress: params.get("email") } : undefined,
  });
}

async function showSignedIn() {
  $("status-card").classList.add("hidden");

  let me = { email: null, role: "provisional", application: null };
  try {
    me = await window.SSCAuth.api("/api/me");
  } catch (e) { console.error(e); }

  const email = me.email
    || window.Clerk.user.primaryEmailAddress?.emailAddress
    || window.Clerk.user.id;
  const role = me.role || "provisional";

  $("hero-title").textContent = "Member Area";
  $("hero-sub").textContent = role === "provisional"
    ? "Thank you for joining us. Full membership follows your introduction call."
    : "Welcome back.";

  render(<MembersApp me={me} email={email} />, $("members-root"));
}

async function boot() {
  try {
    const clerk = await window.SSCAuth.loadClerk();
    if (clerk.user) {
      await showSignedIn();
    } else {
      showSignIn();
    }
  } catch (err) {
    $("auth-loading").textContent = "Sign in is briefly unavailable. Please refresh, or return to the site and try again.";
    console.error(err);
  }
}

boot();
