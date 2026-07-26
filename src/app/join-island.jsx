// The join flow, adopted onto @odla-ai/chapter's packaged <JoinIsland/>.
//
// Resolves PM bug 019f9c67 (join page client contract differs from Chapter's
// join-config). chapter-follower v9: "JoinIsland obtains payment
// publishableKey and lineItems from the subscription route. Adopt the packaged
// flow end to end or keep a tested adapter." This is the end-to-end adoption,
// so the legacy /api/groups/:id/join-config host route is no longer the join
// page's contract.
//
// PRESERVING THE APPROVED EXPERIENCE. The form markup below is a faithful
// transcription of the markup that was in join.html: same element order, same
// classes, same labels, same placeholders, same option lists, same helper copy.
// join.html's stylesheet is unchanged, so the rendered result is the same page.
// What moved is orchestration only — submit, payment, and booking are now the
// package's state machine instead of 307 lines of inline script.
//
// ONE DELIBERATE MARKUP CHANGE: the input `name` attributes are the API
// contract now. JoinIsland's collectFormFields posts FormData keys VERBATIM
// with no transformation, so the legacy snake_case names (first_name,
// last_name, referral_name, who_you_are) are renamed to the camelCase the
// applications endpoint requires. `name` is invisible to the applicant, so the
// experience is unchanged; the legacy inline script did this same mapping by
// hand at post time. The `for`/`id` pairs are renamed with them to keep every
// label association intact.

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { JoinIsland, loadJoinResume } from "@odla-ai/chapter/ui/member";

// Same key the legacy page used, so an in-flight applicant keeps their place
// across this deploy.
const RESUME_KEY = "ssc-application-id";

const FOCUS_OPTIONS = [
  "Investing in line with my values",
  "Finding community with like-minded women",
  "Building financial confidence",
  "Planning for my family’s future",
  "Starting or growing a business",
  "Figuring out my next chapter",
  "Not sure yet, just exploring",
];

const WHO_YOU_ARE_OPTIONS = [
  "Stay-at-home parent / homemaker",
  "Working professional",
  "Small business owner",
  "Freelancer or self-employed",
  "In a career transition",
  "Retired or semi-retired",
  "Something else",
];

/** The site's own step rail. Chapter owns the flow; these dots are site chrome,
 *  so they are driven from the packaged step rather than reimplemented. */
function StepRail({ step }) {
  const index = step === "form" ? 0 : step === "payment" || step === "paymentPending" ? 1 : 2;
  const cls = (i) => (i === index ? "step active" : i < index ? "step done" : "step pending");
  return (
    <div class="steps" id="steps">
      <div class={cls(0)} id="dot-1">
        <div class="step-dot">1</div>
        <div class="step-label">Apply</div>
      </div>
      <div class={cls(1)} id="dot-pay">
        <div class="step-dot">2</div>
        <div class="step-label">Secure your place</div>
      </div>
      <div class={cls(2)} id="dot-2">
        <div class="step-dot">3</div>
        <div class="step-label">Book your conversation</div>
      </div>
    </div>
  );
}

function ApplicationFields({ config, referral, onReferral, referralName, onReferralName, ack, onAck }) {
  return (
    <>
      <div class="two-col">
        <div class="form-group">
          <label for="firstName">First Name</label>
          <input type="text" id="firstName" name="firstName" placeholder="Martha" required />
        </div>
        <div class="form-group">
          <label for="lastName">Last Name</label>
          <input type="text" id="lastName" name="lastName" placeholder="Cannon" required />
        </div>
      </div>

      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" placeholder="martha@example.com" required />
      </div>

      <div class="two-col">
        <div class="form-group">
          <label for="phone">Phone</label>
          <input type="tel" id="phone" name="phone" placeholder="(801) 555-0100" required />
        </div>
        <div class="form-group">
          <label for="state">State</label>
          <input type="text" id="state" name="state" placeholder="Utah" required />
        </div>
      </div>

      <div class="form-group">
        <label for="referral">How did you find Silver &amp; Salt Capital?</label>
        <select
          id="referral"
          name="referral"
          required
          value={referral}
          onChange={(e) => onReferral(e.currentTarget.value)}
        >
          <option value="" disabled>Select one…</option>
          <option value="referred">Referred by someone I know</option>
          <option value="linkedin">LinkedIn</option>
          <option value="search">Google / web search</option>
          <option value="podcast">Podcast or media</option>
          <option value="event">Event or conference</option>
          <option value="other">Other</option>
        </select>
        {/* Same reveal the legacy script drove: the thank-you field appears,
            and becomes required, only for a referral.
            The page's CSS owns this: `.referral-reveal { display: none }` with
            `.referral-reveal.show { display: flex }`. It must be toggled by
            CLASS, not by an inline style — an inline `style=""` loses to the
            class rule and the field stays invisible. */}
        <div class={referral === "referred" ? "referral-reveal show" : "referral-reveal"} id="referral-reveal">
          <label for="referralName">Who should we thank?</label>
          <input
            type="text"
            id="referralName"
            name="referralName"
            placeholder="Their full name"
            required={referral === "referred"}
            value={referralName}
            onInput={(e) => onReferralName(e.currentTarget.value)}
          />
        </div>
      </div>

      <div class="form-group">
        <label for="whoYouAre">How would you describe yourself?</label>
        <select id="whoYouAre" name="whoYouAre" required>
          <option value="" disabled selected>Select one…</option>
          {WHO_YOU_ARE_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>

      <div class="form-group">
        <label>Interests <span class="opt">(select all that apply)</span></label>
        <div class="checkbox-group">
          {/* Repeated `name="focus"` gives FormData multiple values, which
              collectFormFields turns into the array the API expects. */}
          {FOCUS_OPTIONS.map((o) => (
            <label class="checkbox-option" key={o}>
              <input type="checkbox" name="focus" value={o} /> {o}
            </label>
          ))}
        </div>
      </div>

      <div class="form-group">
        <label for="linkedin">LinkedIn <span class="opt">(optional)</span></label>
        <input type="text" id="linkedin" name="linkedin" placeholder="linkedin.com/in/yourname" />
      </div>

      <div class="form-group">
        <label for="message">Why do you want to join Silver &amp; Salt Capital?</label>
        <textarea
          id="message"
          name="message"
          placeholder="What brought you here, and what are you hoping to find?"
          required
        ></textarea>
      </div>

      <div class="compliance-box" id="disclaimer-box">
        {/* Copy comes from the group row via join-config, never from code, so an
            owner edit in the admin console reaches this page. */}
        <p id="disclaimer-text">{config.disclaimerText}</p>
        <label class="compliance-check">
          {/* value="true" matters: Chapter's hasDisclaimerAck accepts true or
              the string "true", and a bare checkbox would post "on". */}
          <input
            type="checkbox"
            id="disclaimer-check"
            name="disclaimerAck"
            value="true"
            checked={ack}
            onChange={(e) => onAck(e.currentTarget.checked)}
          />
          <span>I have read and understand the statement above.</span>
        </label>
      </div>
    </>
  );
}

function Join({ config }) {
  const [referral, setReferral] = useState("");
  const [referralName, setReferralName] = useState("");
  const [ack, setAck] = useState(false);
  const [step, setStep] = useState("form");
  // Seeded from sessionStorage so a reload resumes; the id is a capability the
  // server re-validates, and the step itself always comes from the server.
  const [resumeId, setResumeId] = useState(() => {
    try { return sessionStorage.getItem(RESUME_KEY) ?? null; } catch { return null; }
  });

  return (
    <>
      <StepRail step={step} />
      <div class="card">
        <div class="card-label">Before we meet</div>
        <JoinIsland
          config={config}
          membersHref="/members/"
          // The legacy page gated submit on the consent box; preserve that
          // exactly rather than relying on the server's 400.
          submitDisabled={!ack}
          // Resume a journey interrupted by a reload or a redirect-based
          // payment method. chapter-follower: resume through the canonical
          // GET /api/join/resume state, never by letting raw query flags pick a
          // UI step. loadJoinResume calls exactly that endpoint, so the SERVER
          // decides which step the applicant belongs on.
          loadResume={resumeId ? () => loadJoinResume(resumeId) : undefined}
          renderStepHeader={({ state }) => {
            // Keep the site's step rail in sync with the packaged flow, and
            // remember the application id so a reload can resume instead of
            // dropping the applicant back onto an empty form.
            if (state.step !== step) queueMicrotask(() => setStep(state.step));
            if (state.applicationId && state.applicationId !== resumeId) {
              queueMicrotask(() => {
                try { sessionStorage.setItem(RESUME_KEY, state.applicationId); } catch {}
                setResumeId(state.applicationId);
              });
            }
            return null;
          }}
          // The confirmation screen is site-owned copy and imagery (the Ivy
          // Baker Priest quote card). Preserved verbatim from join.html's
          // step-3 so the applicant sees the same page they always did;
          // Chapter keeps the flow orchestration behind it.
          renderDone={({ booked, membersHref }) => (
            // `#step-3 { display: none }` (join.html) is the page's default —
            // the legacy script revealed this panel imperatively with
            // `step3.style.display = 'block'`. Rendering the id alone leaves the
            // confirmation invisible, so the booking looks like it hung even
            // though POST /api/schedule/book returned 200 and the meeting was
            // written. The inline style beats the id rule while keeping that
            // rule's text-align and padding. Same class of bug as the referral
            // reveal above; these are the only two default-hidden selectors this
            // island renders (audited: display:none appears three times in
            // join.html, and #step-2 is not rendered here).
            <div id="step-3" style="display:block;">
              <div class="step3-icon">✦</div>
              <h2 class="step3-heading">You’re confirmed.</h2>
              <p class="step3-body">
                Thank you for applying to Silver <span class="brand-amp">&amp;</span> Salt Capital.
              </p>
              {booked && (
                <p class="step3-body" id="confirmed-when">
                  {new Date(booked.startAt).toLocaleString("en-US", {
                    dateStyle: "full",
                    timeStyle: "short",
                    timeZone: booked.timezone,
                  })}
                </p>
              )}
              <p class="step3-body">
                A calendar invitation with your video call link has been sent to your email.
              </p>
              <p class="step3-body step3-body-final">We’ll see you soon.</p>
              <p class="step3-body">
                Your member account is ready. Sign in with your email to see your application status
                and call details.
              </p>
              <a href={membersHref} class="step3-account-btn" id="account-cta">
                Sign in to your member area
              </a>
              <br />
              <a href="/" class="step3-link">
                Return to Silver <span class="brand-amp">&amp;</span> Salt Capital
              </a>
              <div class="quote-card">
                <p class="quote-text">
                  “We women don’t care too much about getting our pictures on money as long as we can
                  get our hands on it.”
                </p>
                <div class="quote-card-top">
                  <img
                    src="/assets/ivy-baker-priest.jpg"
                    alt="Ivy Baker Priest"
                    loading="lazy"
                    decoding="async"
                    width="200"
                    height="200"
                  />
                  <div class="quote-card-identity">
                    <p class="quote-name">Ivy Baker Priest (1905–1975)</p>
                    <p class="quote-title">
                      30th Treasurer of the United States
                      <br />
                      Appointed by President Dwight D. Eisenhower (R), 1953
                      <br />
                      Utah’s first woman to hold a Cabinet-level federal office
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          renderSubmit={({ submitting, disabled }) => (
            <>
              <button
                type="submit"
                class="submit-btn"
                id="submit-btn"
                disabled={disabled || submitting || !ack}
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
              <p class="privacy">
                Your privacy matters to us. Your information is never sold or shared with third
                parties.
              </p>
            </>
          )}
          payment={{
            // Site-owned price presentation, fed by the server's own line items
            // from the subscription route (the contract v9 points at).
            renderPriceLines: (lines) => (
              <div class="pay-lines" id="pay-lines">
                <div class="pay-line">
                  <span>Annual membership</span>
                  <span>{money(lines.standardCents)}</span>
                </div>
                {lines.discountCents > 0 && (
                  <div class="pay-line discount">
                    <span>Founding-member discount</span>
                    <span>-{money(lines.discountCents)}</span>
                  </div>
                )}
                <div class="pay-line total">
                  <span>Due today</span>
                  <span>{money(lines.dueTodayCents)}</span>
                </div>
              </div>
            ),
            children: config.trustCopy ? <p class="pay-trust">{config.trustCopy}</p> : null,
          }}
        >
          <ApplicationFields
            config={config}
            referral={referral}
            onReferral={(v) => {
              setReferral(v);
              // Legacy behaviour: switching away clears the field so a stale
              // hidden value is never posted.
              if (v !== "referred") setReferralName("");
            }}
            referralName={referralName}
            onReferralName={setReferralName}
            ack={ack}
            onAck={setAck}
          />
        </JoinIsland>
      </div>
    </>
  );
}

const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "usd" });

async function boot() {
  const root = document.getElementById("join-root");
  if (!root) return;
  try {
    const res = await fetch("/api/join-config");
    if (!res.ok) throw new Error(`join-config ${res.status}`);
    const config = await res.json();
    render(<Join config={config} />, root);
  } catch (err) {
    console.error(err);
    root.innerHTML =
      '<div class="card"><p class="auth-status">The application form is briefly unavailable. ' +
      'Please refresh, or email <a href="mailto:tori@silverandsaltcapital.com">tori@silverandsaltcapital.com</a>.</p></div>';
  }
}

boot();
