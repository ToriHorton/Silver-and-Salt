// Membership application flow.
//
// chapter's JoinIsland owns the orchestration that used to be ~300 lines of
// inline page script: form submit, the Stripe payment step, the slot picker,
// the confirmation, and resume-after-redirect. Resume is the part worth
// calling out: the island asks GET /api/join/resume for canonical state rather
// than trusting a `redirect_status` or `reschedule` query parameter, so a
// bookmarked or forged URL cannot advance the flow.
//
// The site keeps its own form fields, headings, submit button, price lines,
// and confirmation card through the render slots, so the page CSS applies
// unchanged.

import { render } from "preact";
import { useState } from "preact/hooks";
import { JoinIsland } from "@odla-ai/chapter/ui/member";
import { chapter } from "../chapter.config.mjs";

const INTERESTS = [
  "Investing in line with my values",
  "Finding community with like-minded women",
  "Building financial confidence",
  "Planning for my family’s future",
  "Starting or growing a business",
  "Figuring out my next chapter",
  "Not sure yet, just exploring",
];

const WHO_YOU_ARE = [
  "Stay-at-home parent / homemaker",
  "Working professional",
  "Small business owner",
  "Freelancer or self-employed",
  "In a career transition",
  "Retired or semi-retired",
  "Something else",
];

const REFERRALS = [
  ["referred", "Referred by someone I know"],
  ["linkedin", "LinkedIn"],
  ["search", "Google / web search"],
  ["podcast", "Podcast or media"],
  ["event", "Event or conference"],
  ["other", "Other"],
];

/**
 * Multi-select interests.
 *
 * UPSTREAM WORKAROUND (@odla-ai/chapter 0.23.0): JoinIsland collects the form
 * with `for (const [k, v] of new FormData(form).entries()) fields[k] = v`, so
 * repeated names overwrite and only the LAST checked box would survive. Seven
 * checkboxes sharing name="focus" would post one string instead of an array.
 * `getAll` appears nowhere in the shipped bundle.
 *
 * So the visible checkboxes carry no `name` (FormData ignores them) and the
 * selection is mirrored into a single hidden `focus` input as a JSON array,
 * which src/worker.ts parses back into an array before chapter sees it.
 * Verified against the live dev tenant: an array posts and stores as an array,
 * a JSON string stores as a string, so the parse has to happen server-side.
 * Delete this component's hidden input and the worker's normalizer together
 * once JoinIsland uses `getAll`.
 */
function InterestsField() {
  const [picked, setPicked] = useState([]);
  const toggle = (value) =>
    setPicked((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );

  return (
    <div class="form-group">
      <label>Interests <span class="opt">(select all that apply)</span></label>
      <div class="checkbox-group">
        {INTERESTS.map((value) => (
          <label class="checkbox-option" key={value}>
            <input
              type="checkbox"
              checked={picked.includes(value)}
              onChange={() => toggle(value)}
            />{" "}
            {value}
          </label>
        ))}
      </div>
      <input type="hidden" name="focus" value={JSON.stringify(picked)} />
    </div>
  );
}

/** "Who should we thank?" appears only for a personal referral. */
function ReferralField() {
  const [source, setSource] = useState("");
  return (
    <div class="form-group">
      <label for="referral">How did you find Silver <span class="brand-amp">&amp;</span> Salt Capital?</label>
      <select
        id="referral"
        name="referral"
        required
        value={source}
        onChange={(e) => setSource(e.currentTarget.value)}
      >
        <option value="" disabled>Select one...</option>
        {REFERRALS.map(([value, label]) => (
          <option value={value} key={value}>{label}</option>
        ))}
      </select>
      <div class={"referral-reveal" + (source === "referred" ? " show" : "")} id="referral-reveal">
        <label for="referralName">Who should we thank?</label>
        <input type="text" id="referralName" name="referralName" placeholder="Their full name" />
      </div>
    </div>
  );
}

function ApplicationFields({ disclaimerText, onAck }) {
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

      <ReferralField />

      <div class="form-group">
        <label for="whoYouAre">How would you describe yourself?</label>
        <select id="whoYouAre" name="whoYouAre" required defaultValue="">
          <option value="" disabled>Select one...</option>
          {WHO_YOU_ARE.map((v) => <option key={v}>{v}</option>)}
        </select>
      </div>

      <InterestsField />

      <div class="form-group">
        <label for="linkedin">LinkedIn <span class="opt">(optional)</span></label>
        <input type="text" id="linkedin" name="linkedin" placeholder="linkedin.com/in/yourname" />
      </div>

      <div class="form-group">
        <label for="message">Why do you want to join Silver <span class="brand-amp">&amp;</span> Salt Capital?</label>
        <textarea id="message" name="message" placeholder="What brought you here, and what are you hoping to find?" required></textarea>
      </div>

      {/* Consent gate. chapter refuses a submit with no acknowledgement (400),
          and the button stays disabled until the box is checked. */}
      <div class="compliance-box" id="disclaimer-box">
        <p id="disclaimer-text">{disclaimerText}</p>
        <label class="compliance-check">
          <input
            type="checkbox"
            name="disclaimerAck"
            value="true"
            onChange={(e) => onAck(e.currentTarget.checked)}
          />
          <span>I have read and understand the statement above.</span>
        </label>
      </div>
    </>
  );
}

/** The three-dot step tracker above the card. The payment step only exists
 *  when the backend reports Stripe is ready. */
function StepTracker({ step, paymentsReady }) {
  const steps = paymentsReady
    ? [["form", "Your details"], ["payment", "Secure your place"], ["booking", "Book your call"]]
    : [["form", "Your details"], ["booking", "Book your call"]];
  const order = steps.map(([id]) => id);
  const currentIndex = step === "done" ? order.length : order.indexOf(step);

  return (
    <div class="steps">
      {steps.map(([id, label], i) => (
        <>
          {i > 0 && <div class="step-line"></div>}
          <div class={"step " + (i < currentIndex ? "complete" : i === currentIndex ? "active" : "pending")} key={id}>
            <div class="step-dot">{i + 1}</div>
            <div class="step-label">{label}</div>
          </div>
        </>
      ))}
    </div>
  );
}

function ConfirmationCard({ membersHref, booked }) {
  return (
    <div class="card">
      <div class="step3-icon">✦</div>
      <h2 class="step3-heading">Thank you</h2>
      <p class="step3-body">
        Your application is in{booked ? ", and your introduction call is on the calendar" : ""}.
        {booked ? " A calendar invitation with the video call link is on its way to your inbox." : ""}
      </p>
      <p class="step3-body">
        Your member account is ready. Sign in any time to see your application status and your call details.
      </p>
      <a class="step3-account-btn" href={membersHref}>Sign in to your member area</a>

      <div class="quote-card">
        <div class="quote-card-top">
          <img src="/assets/ivy-baker-priest.jpg" alt="Ivy Baker Priest" />
          <div class="quote-card-identity">
            <div class="quote-name">Ivy Baker Priest</div>
            <div class="quote-title">30th Treasurer of the United States</div>
          </div>
        </div>
        <p class="quote-text">The world is round and the place which may seem like the end may also be only the beginning.</p>
      </div>
    </div>
  );
}

function PriceLines({ standardCents, discountCents, dueTodayCents }) {
  const money = (cents) => "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
  return (
    <div class="pay-lines">
      <div class="pay-line"><span>Annual membership</span><span class="amount">{money(standardCents)}</span></div>
      {discountCents > 0 && (
        <div class="pay-line"><span>Founding-member discount</span><span class="amount">-{money(discountCents)}</span></div>
      )}
      <div class="pay-line total"><span>Due today</span><span class="amount">{money(dueTodayCents)}</span></div>
      <p class="pay-renews">Renews annually at your locked-in founding-member rate.</p>
    </div>
  );
}

// Stripe's Payment Element is themed the same way Clerk is: variables only,
// plus a font source so the iframe can use Satoshi.
const STRIPE_APPEARANCE = {
  variables: {
    colorPrimary: "#7CB83F",
    colorText: "#2F3E34",
    colorTextSecondary: "#7E8E84",
    colorBackground: "#ffffff",
    fontFamily: "'Satoshi', 'Helvetica Neue', Arial, sans-serif",
    borderRadius: "8px",
  },
};
const STRIPE_FONTS = [
  { cssSrc: "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" },
];

function Join({ config }) {
  const [acked, setAcked] = useState(false);

  return (
    <JoinIsland
      config={config}
      copy={chapter.copy.join}
      membersHref="/members/"
      submitDisabled={!acked}
      renderStepHeader={({ state }) => (
        <StepTracker step={state.step} paymentsReady={config.paymentsReady} />
      )}
      renderSubmit={({ submitting }) => (
        <>
          <button type="submit" class="submit-btn" disabled={!acked || submitting}>
            {submitting ? chapter.copy.join.form.submitting : chapter.copy.join.form.submit}
          </button>
          <p class="privacy">
            Your privacy matters to us. Your information is never sold or shared with third parties.
          </p>
        </>
      )}
      renderDone={({ membersHref, booked }) => (
        <ConfirmationCard membersHref={membersHref} booked={booked} />
      )}
      payment={{
        appearance: STRIPE_APPEARANCE,
        fonts: STRIPE_FONTS,
        renderPriceLines: (lines) => <PriceLines {...lines} />,
      }}
    >
      <ApplicationFields disclaimerText={config.disclaimerText} onAck={setAcked} />
    </JoinIsland>
  );
}

async function boot() {
  const root = document.getElementById("join-root");
  if (!root) return;
  let config;
  try {
    config = await fetch("/api/join-config").then((r) => r.json());
  } catch (err) {
    console.error(err);
    root.innerHTML =
      '<div class="card"><p class="privacy">The application is briefly unavailable. Please refresh and try again.</p></div>';
    return;
  }
  render(<Join config={config} />, root);
}

void boot();
