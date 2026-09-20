// Member area app. Renders the signed-in view (account header plus the
// provisional application card or the member material) into #members-root;
// the hero and sign-in mount stay page-owned DOM, updated here directly.
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { SlotPicker } from "./slot-picker.jsx";
import { PaymentStep, MemberRestart, JourneyFrame } from "@odla-ai/chapter/ui/member";

const $ = (id) => document.getElementById(id);
// Resolved at call time so components can render without a page.
const memberApi = (...args) => window.SSCAuth.api(...args);
// The join page keeps the in-progress application id here so a reload
// resumes it (src/app/join-island.jsx). Signing out ends that session too;
// otherwise the next visitor at this browser tab lands on the previous
// person's application state.
const JOIN_RESUME_KEY = "ssc-application-id";
const linkStyle = "color: var(--lime-dark); font-weight: 700; text-decoration: none;";
const secondaryLink = "color: var(--sage); text-decoration: underline;";

// In-page reschedule: pick a new slot and rebook via /api/schedule/book (the
// same capability the join flow uses; the application id is the credential).
function Rescheduler({ application, onReschedule, label = "Change your time" }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState(null);
  const [tz, setTz] = useState(application.timezone);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const start = async () => {
    setOpen(true); setSlots(null); setMsg(null);
    try {
      const r = await window.SSCAuth.api("/api/schedule/slots");
      setSlots(r.slots || []);
      if (r.timezone) setTz(r.timezone);
    } catch (e) { setSlots([]); setMsg("Times are briefly unavailable. Please try again."); }
  };
  const pick = async (slot) => {
    setBusy(true); setMsg(null);
    try {
      await window.SSCAuth.api("/api/schedule/book", {
        method: "POST",
        body: JSON.stringify({ applicationId: application.id, startAt: slot.startAt }),
      });
      setOpen(false);
      await onReschedule();
    } catch (e) {
      setMsg((e && e.message) || "That time is no longer available. Please pick another.");
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <div class="meeting-note">
        <a href="#" onClick={(e) => { e.preventDefault(); start(); }} style={secondaryLink}>{label}</a>
      </div>
    );
  }
  return (
    <div class="msched">
      {slots === null ? (
        <p class="meeting-note">Loading available times…</p>
      ) : !slots.length ? (
        <p class="meeting-note">No open times right now. Please check back soon.</p>
      ) : (
        <SlotPicker
          slots={slots}
          timezone={tz}
          classes={{ days: "msched-days", day: "msched-day", times: "msched-times", time: "msched-time" }}
          onPick={pick}
        />
      )}
      {busy && <p class="meeting-note">Rescheduling…</p>}
      {msg && <p class="meeting-note" style="color:#a4442c">{msg}</p>}
      <div class="meeting-note">
        <a href="#" onClick={(e) => { e.preventDefault(); setOpen(false); }} style={secondaryLink}>Keep my current time</a>
      </div>
    </div>
  );
}

const TIER_NAMES = { associate: "Associate", founding: "founding", steward: "Community Steward" };

function MembershipLine({ application }) {
  if (!application?.paid) return null;
  const t = TIER_NAMES[application.tier] || "founding";
  return (
    <div class="meeting-note" style="margin-top:16px;">
      Your {t} membership is active
      {application.renewalAt
        ? " and renews " + new Date(application.renewalAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
        : ""}.
    </div>
  );
}

function ProvisionalCard({ application, onReschedule }) {
  const { fmtMeeting } = window.SSCAuth;
  let block;
  if (application && application.status === "refunded") {
    block = (
      <div class="meeting-block">
        <div class="meeting-kicker">Membership refunded</div>
        <div class="meeting-note">Your membership fee has been refunded in full and your membership is canceled. Thank you for your interest in Silver <span class="brand-amp">&amp;</span> Salt Capital.</div>
      </div>
    );
  } else if (application && application.status === "declined") {
    block = (
      <div class="meeting-block">
        <div class="meeting-kicker">Thank you for applying</div>
        <div class="meeting-note">After careful consideration, we are unable to offer membership at this time.{application.paid ? " Any membership fee has been refunded in full." : ""} Thank you for your interest in Silver <span class="brand-amp">&amp;</span> Salt Capital, and we wish you every success.</div>
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
        <Rescheduler application={application} onReschedule={onReschedule} />
        <MembershipLine application={application} />
      </div>
    );
  } else if (application) {
    block = (
      <div class="meeting-block">
        <div class="meeting-kicker">Book your introduction call</div>
        <div class="meeting-note">Your application is in. Choose a time below, and a calendar invitation with the video call link will reach your email.</div>
        <Rescheduler application={application} onReschedule={onReschedule} label="Choose a time" />
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

// The gift membership: a paying member gives one membership to her mother or
// her daughter, named at purchase, at any point during her own membership year;
// it is active for the full year alongside hers (Tori, 2026-09-19 and
// 2026-09-20: the seat exists so mothers and daughters talk about money; the
// relationship is honored, never verified; no deadline). The offer, price, term, and
// eligibility come from /api/named-seat (Built Not Found is the authority);
// this card only presents them and hands the checkout to the same
// PaymentStep the join flow uses. Chapter ships an equivalent card inside its
// MembersArea composite, which this page does not use.
const GIFT_REFUND_POLICY =
  "Gift memberships are final: there is no refund once the gift is given. The membership is hers to use, " +
  "it carries full Founding Member benefits, and it renews alongside your own membership until you cancel renewal.";

const SEAT_STATUS = {
  pending_acceptance: "waiting for her to accept",
  awaiting_acceptance: "waiting for her to accept",
  renewal_pending: "waiting for her to accept",
  accepted: "accepted",
  active: "active",
};

export function NamedSeatCard({ api, initial }) {
  const [data, setData] = useState(initial ?? null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [terms, setTerms] = useState(false);
  const [pending, setPending] = useState(false);
  const load = async () => {
    try {
      const value = await api("/api/named-seat");
      setData(value);
      if (value.seat) { setName(value.seat.recipientName); setEmail(value.seat.recipientEmail); }
    } catch (e) {
      setError("The gift is briefly unavailable. Please try again shortly.");
    }
  };
  useEffect(() => { if (!initial) void load(); }, [api]);
  const money = data ? new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency }).format(data.amountCents / 100) : "";
  const included = Boolean(data) && data.amountCents === 0;
  const seatStatus = data?.seat ? (SEAT_STATUS[data.seat.status] ?? String(data.seat.status).replaceAll("_", " ")) : "";
  return (
    <JourneyFrame><div class="card" id="named-seat-card">
      <div class="card-label">A gift for your mother or daughter</div>
      <h2>Give her a membership.</h2>
      {error && <p class="pay-error" role="alert">{error}</p>}
      {!data && !error && <p class="meeting-note">Loading…</p>}
      {data?.seat && (
        <div class="meeting-block">
          <div class="meeting-kicker">Your gift</div>
          <div class="meeting-note">{data.seat.recipientName} ({data.seat.recipientEmail}): {seatStatus}.</div>
          {pending && <div class="meeting-note" role="status">Your payment is being confirmed. Her membership begins once she accepts and is approved after her own conversation.</div>}
        </div>
      )}
      {data && !data.seat && !data.eligible && (
        <p class="meeting-note">Gift memberships are briefly unavailable here. Write to <a href="mailto:tori@silverandsaltcapital.com" style={linkStyle}>tori@silverandsaltcapital.com</a> and we will set yours up.</p>
      )}
      {data?.eligible && !data.seat && !reviewing && (
        <form class="seat-form" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2 && email.trim()) { setError(""); setReviewing(true); } }}>
          <p class="meeting-note" style="margin-top:0">
            We want it to be easy and normal for mothers and daughters to talk about money.{" "}
            {included
              ? <>Your Community Steward membership includes a membership for your mother or your daughter.</>
              : <>Gift your mother or your daughter a membership for {money} a year.</>}
            {" "}She accepts your gift, completes her own application, and joins as a member in her own right. Her membership is active for the full year alongside yours and renews with it. Your gift is final: once given, it is hers to use.
          </p>
          <label class="seat-field">Her name<input required maxLength={160} value={name} onInput={(e) => setName(e.currentTarget.value)} /></label>
          <label class="seat-field">Her email<input required type="email" maxLength={254} value={email} onInput={(e) => setEmail(e.currentTarget.value)} /></label>
          <button class="submit-btn" type="submit">Review the gift</button>
        </form>
      )}
      {data?.eligible && !data.seat && reviewing && (
        <div class="seat-review">
          <div class="meeting-block">
            <div class="meeting-kicker">A membership for {name}</div>
            <div class="meeting-note">{email}</div>
            <div class="meeting-note">{included ? "Included with your membership." : `${money} today.`} Your gift is final, and her membership renews alongside yours.</div>
            <div class="meeting-note"><a href="#" style={secondaryLink} onClick={(e) => { e.preventDefault(); setReviewing(false); setTerms(false); }}>Change the recipient</a></div>
          </div>
          <label class="compliance-check" style="margin-top:14px">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.currentTarget.checked)} />
            <span>{data.autoRenew
              ? "I agree to the full payment now and to automatic renewal alongside my own membership. I can cancel renewal at any time."
              : "I agree to the full payment now and to the end date shown, with no automatic renewal while my own renewal is canceled."}</span>
          </label>
          {terms && (
            <PaymentStep
              applicationId={data.membershipId}
              // The gift's own terms (Tori, 2026-09-19), in place of the
              // general membership refund policy the authority sends along.
              // Flagged for counsel with the rest of the refund wording.
              refundPolicyText={GIFT_REFUND_POLICY}
              merchantDisclosureText={data.merchantDisclosureText}
              startCheckout={() => api("/api/named-seat/checkout", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ recipientName: name, recipientEmail: email, quoteDigest: data.digest, seatTermsAck: true, refundPolicyAck: true }),
              })}
              onPaid={() => { setPending(true); setReviewing(false); void load(); }}
            />
          )}
        </div>
      )}
    </div></JourneyFrame>
  );
}

export function MembersApp({ me: initialMe, email }) {
  const [me, setMe] = useState(initialMe);
  const reload = async () => { try { setMe(await window.SSCAuth.api("/api/me")); } catch (e) { console.error(e); } };
  const role = me.role || "provisional";
  const signOut = async () => {
    try { sessionStorage.removeItem(JOIN_RESUME_KEY); } catch {}
    await window.Clerk.signOut();
    window.location.href = "/members/";
  };
  return (
    <>
      <div class="card">
        <div class="member-row">
          <span class="member-email">{email}</span>
          <span class={"role-badge " + role}>{role === "member" && me.memberAccess !== true ? "Inactive membership" : role}</span>
        </div>
        <div class="account-actions">
          <button class="signout-btn" onClick={signOut}>Sign out</button>
          {/* authorized covers the admin role and odla superadmins alike; the
              role string alone hides the console from a superadmin member. */}
          {me.authorized && <a class="admin-console-link" href="/admin/">Admin console</a>}
        </div>
      </div>
      {me.memberAccess === true ? <MemberView /> : me.membershipRestart?.eligible && me.application ?
        <MemberRestart api={memberApi} application={me.application} applicationId={me.membershipRestart.applicationId} onComplete={reload} /> :
        <JourneyFrame><ProvisionalCard application={me.application} onReschedule={reload} /></JourneyFrame>}
      {me.namedSeatsEnabled && <NamedSeatCard api={memberApi} />}
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
  $("hero-sub").textContent = me.membershipRestart?.eligible ? "Welcome back. Your membership is ready to restart." : me.memberAccess !== true
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

// Tests import the components above without a page; only a real page boots.
if (typeof document !== "undefined") boot();
