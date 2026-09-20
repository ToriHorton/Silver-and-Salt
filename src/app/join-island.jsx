// The join flow, adopted onto @odla-ai/chapter's packaged <JoinIsland/>.
//
// Resolves PM bug 019f9c67 (join page client contract differs from Chapter's
// join-config). chapter-follower v9: "JoinIsland obtains payment
// publishableKey and lineItems from the subscription route. Adopt the packaged
// flow end to end or keep a tested adapter." This is the end-to-end adoption,
// so the legacy /api/groups/:id/join-config host route is no longer the join
// page's contract.
//
// Host brand, fields and confirmation surround the verified Chapter journey.

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { JoinIsland, PaymentStep } from "@odla-ai/chapter/ui/member";
import { namedSeatClaimApi, giftSeatApi } from "./named-seat-api.mjs";
import { loadSiteJoinResume } from "./join-resume.mjs";
import ivyBakerPriest from "../../assets/ivy-baker-priest.jpg";

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

/** How each offered tier reads on the application form. The tier ids, list
 *  prices and availability come from the signup revision Built Not Found
 *  publishes (join-config); the WORDS come from the membership page, so the
 *  applicant sees the same name she clicked. The Standard tier is sold as
 *  "Founding Member" at the founding rate; the $100 founding discount is
 *  governed server-side and confirmed on the payment step, which is why the
 *  chooser says "confirmed at checkout" rather than promising it. Unknown
 *  tier ids fall back to the server's name and list price. */
const TIER_DISPLAY = {
  standard: {
    name: "Founding Member",
    price: "$900 a year",
    was: "$1,000",
    note: "The founding rate, held for as long as you stay. Confirmed at checkout.",
  },
  steward: { name: "Community Steward", price: "$5,000 a year" },
  associate: { name: "Associate Member", price: "Free" },
};

/** The invited path's words. The membership is a gift from a mother to a
 *  daughter or a daughter to a mother (Tori, 2026-09-19; honored, never
 *  verified), so the packaged "seat" and "invitation" vocabulary is replaced
 *  here. Keys mirror Chapter's join copy contract for namedSeat. */
const GIFT_COPY = {
  title: "Accept your gift",
  from: "{purchaserName} has given you a membership.",
  prepaid: "Your membership is already paid for.",
  body: "Accept the membership, then finish your own application and book your conversation. You will not be asked to pay.",
  consent: "I accept this membership for myself. It cannot be transferred, and it stays current while the membership of the person who gave it stays current.",
  accept: "Accept my membership",
  accepting: "Confirming…",
  loading: "Finding your gift…",
  unavailable: "Your gift could not be found. Sign in with the email address the gift was sent to, then try again.",
  retry: "Try again",
  failure: "We could not confirm your acceptance. Try again; you will not be asked to pay.",
};

function tierDisplay(tier) {
  const d = TIER_DISPLAY[tier.id];
  // Chapter 0.50.0: the authority says what a founding applicant pays today
  // (tier.founding), so the rate shown here is the rate the quote will confirm.
  if (tier.founding) {
    const held = tier.founding.discountDuration === "while_active";
    return {
      name: d?.name ?? tier.name,
      price: `${money(tier.founding.dueTodayCents)} a year`,
      was: money(tier.priceCents),
      note: held ? "The founding rate, held for as long as you stay. Confirmed at checkout."
        : "The founding rate for your first year. Confirmed at checkout.",
    };
  }
  return {
    name: d?.name ?? tier.name,
    price: d?.price ?? (tier.free ? "Free" : money(tier.priceCents)),
    was: d?.was,
    note: d?.note,
  };
}

/** The site's own step rail. Chapter owns the flow; these dots are site chrome,
 *  so they are driven from the packaged step rather than reimplemented. A free
 *  tier has no payment step, so its rail shows two steps instead of three. */
function StepRail({ step, invited, free }) {
  const index = step === "form" ? 0 : step === "payment" || step === "paymentPending" ? 1 : 2;
  const cls = (i) => (i === index ? "step active" : i < index ? "step complete" : "step pending");
  const bookIndex = free ? 1 : 2;
  const bookState = index >= 2 ? cls(2) : cls(bookIndex);
  return (
    <div class="steps" id="steps">
      <div class={cls(0)} id="dot-1">
        <div class="step-dot">1</div>
        <div class="step-label">{invited ? "Your details" : "Apply"}</div>
      </div>
      {!free && (
        <div class={cls(1)} id="dot-pay">
          <div class="step-dot">2</div>
          <div class="step-label">{invited ? "Accept your gift" : "Secure your place"}</div>
        </div>
      )}
      <div class={bookState} id="dot-2">
        <div class="step-dot">{free ? 2 : 3}</div>
        <div class="step-label">Book your conversation</div>
      </div>
    </div>
  );
}

const GIFT_REFUND_POLICY =
  "Gift memberships are final: there is no refund once the gift is given. The membership is hers to use, " +
  "it carries full Founding Member benefits, and it renews alongside your own membership until you cancel renewal.";

/** The seat step, right after her own payment and before booking (Tori,
 *  2026-09-20): a paying member gives a membership to her mother or daughter.
 *  The offer, price and terms come from /api/named-seat (Built Not Found is
 *  the authority). Buying needs her signed in, because the seat is tied to her
 *  membership, so the first click opens sign-in; after it she lands back here
 *  with her answers kept (sessionStorage) and continues. */
function GiftSeatOffer({ gift, onGift }) {
  const [phase, setPhase] = useState("offer");
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState("");
  const [terms, setTerms] = useState(false);
  if (phase === "skipped") return null;
  const start = async () => {
    setError("");
    setPhase("loading");
    try {
      const o = await giftSeatApi("/api/named-seat");
      if (!o?.eligible) throw Error("Gift memberships are briefly unavailable here. You can add hers from your member area at any time.");
      setOffer(o);
      setPhase("review");
    } catch (e) {
      setError(e.message);
      setPhase("offer");
    }
  };
  const money = offer ? new Intl.NumberFormat("en-US", { style: "currency", currency: offer.currency }).format(offer.amountCents / 100) : "$500";
  const included = Boolean(offer) && (offer.included === true || offer.amountCents === 0);
  const ready = gift.name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gift.email.trim());
  const give = async () => {
    setError(""); setPhase("giving");
    try {
      const receipt = await giftSeatApi("/api/named-seat/checkout", { method: "POST",
        body: JSON.stringify({ recipientName: gift.name.trim(), recipientEmail: gift.email.trim(), quoteDigest: offer.digest, seatTermsAck: true, refundPolicyAck: true }) });
      if (receipt?.included !== true) throw Error("Her membership could not be confirmed. You can add it from your member area at any time.");
      setPhase("paid");
    } catch (e) { setError(e.message); setPhase("review"); }
  };
  if (phase === "paid") {
    return (
      <div class="gift-offer" id="gift-offer" role="status">
        <h3>Her membership is on its way.</h3>
        <p>We have emailed {gift.email.trim()} an invitation to accept it. Next, book your conversation below.</p>
      </div>
    );
  }
  return (
    <div class="gift-offer" id="gift-offer">
      <h3>Add a membership for your mother or daughter.</h3>
      <p>
        {included ? "Included with your Community Steward membership." : `${money} a year, included for Community Stewards.`}
        {" "}She gets a full membership of her own, active alongside yours, and completes her own short application.
      </p>
      <div class="gift-fields">
        <input type="text" placeholder="Her full name" aria-label="Her name" maxLength={160} value={gift.name} onInput={(e) => onGift((g) => ({ ...g, name: e.currentTarget.value }))} />
        <input type="email" placeholder="Her email" aria-label="Her email" maxLength={254} value={gift.email} onInput={(e) => onGift((g) => ({ ...g, email: e.currentTarget.value }))} />
      </div>
      {error && <p class="gift-error" role="alert">{error}</p>}
      {phase !== "review" && (
        <div class="gift-actions">
          <button type="button" class="submit-btn" disabled={phase === "loading" || !ready} onClick={start}>
            {phase === "loading" ? "One moment…" : "Add her membership"}
          </button>
          <button type="button" class="gift-skip" onClick={() => setPhase("skipped")}>Continue to booking</button>
        </div>
      )}
      {(phase === "review" || phase === "giving") && offer && (
        <>
          <label class="compliance-check">
            <input type="checkbox" checked={terms} disabled={phase === "giving"} onChange={(e) => setTerms(e.currentTarget.checked)} />
            <span>{included
              ? "I agree to the gift terms. Her membership is included with mine and renews alongside it; once given, it is hers."
              : offer.autoRenew
                ? "I agree to the full payment now and to automatic renewal alongside my own membership. I can cancel renewal at any time."
                : "I agree to the full payment now and to the end date shown, with no automatic renewal while my own renewal is canceled."}</span>
          </label>
          {terms && included && (
            <div class="gift-actions">
              <button type="button" class="submit-btn" disabled={phase === "giving"} onClick={give}>{phase === "giving" ? "One moment…" : "Send her invitation"}</button>
            </div>
          )}
          {terms && !included && (
            <PaymentStep
              applicationId={offer.membershipId}
              refundPolicyText={GIFT_REFUND_POLICY}
              merchantDisclosureText={offer.merchantDisclosureText}
              startCheckout={() => giftSeatApi("/api/named-seat/checkout", {
                method: "POST",
                body: JSON.stringify({ recipientName: gift.name.trim(), recipientEmail: gift.email.trim(), quoteDigest: offer.digest, seatTermsAck: true, refundPolicyAck: true }),
              })}
              onPaid={() => setPhase("paid")}
            />
          )}
          <div class="gift-actions">
            <button type="button" class="gift-skip" onClick={() => setPhase("skipped")}>Continue to booking</button>
          </div>
        </>
      )}
    </div>
  );
}

// The confirm-email field is a browser-side check only: it has no `name`, so
// it is never posted, and a mismatch blocks submit through the browser's own
// constraint validation (the form is a real <form>, so `required` and
// setCustomValidity run before Chapter's submit handler).
function syncConfirmEmail() {
  const email = document.getElementById("email");
  const confirm = document.getElementById("confirmEmail");
  if (!email || !confirm) return;
  const same = confirm.value.trim().toLowerCase() === email.value.trim().toLowerCase();
  confirm.setCustomValidity(confirm.value && !same ? "The two email addresses do not match." : "");
}

function ApplicationFields({ invitation, config, referral, onReferral, referralName, onReferralName, whoYouAre, onWhoYouAre, gift, onGift, ack, onAck }) {
  return (
    <>
      <div class="two-col">
        <div class="form-group">
          <label for="firstName">First Name</label>
          <input type="text" id="firstName" name="firstName" placeholder="Martha" defaultValue={invitation?.recipientName.split(" ")[0] ?? ""} required />
        </div>
        <div class="form-group">
          <label for="lastName">Last Name</label>
          <input type="text" id="lastName" name="lastName" placeholder="Cannon" defaultValue={invitation?.recipientName.split(" ").slice(1).join(" ") ?? ""} required />
        </div>
      </div>

      <div class="form-group">
        <label for="preferredName">Preferred Name <span class="opt">(if different)</span></label>
        <input type="text" id="preferredName" name="preferredName" placeholder="What you go by" maxLength={200} />
      </div>

      <div class={invitation ? "form-group" : "two-col"}>
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="martha@example.com" value={invitation?.recipientEmail} readOnly={Boolean(invitation)} required onInput={syncConfirmEmail} />
        </div>
        {!invitation && (
          <div class="form-group">
            <label for="confirmEmail">Confirm Email</label>
            <input type="email" id="confirmEmail" placeholder="Type it once more" autoComplete="off" required onInput={syncConfirmEmail} />
          </div>
        )}
      </div>

      <div class="form-group">
        <label for="phone">Phone</label>
        <input type="tel" id="phone" name="phone" placeholder="(801) 555-0100" required />
      </div>

      {/* The full US mailing address (Tori, 2026-09-20). Membership is
          US-only, so the country is fixed and posted as a hidden field. */}
      <div class="form-group">
        <label for="address1">Mailing Address <span class="opt">(United States)</span></label>
        <input type="text" id="address1" name="address1" placeholder="Street address" autoComplete="address-line1" maxLength={200} required />
        <input type="text" id="address2" name="address2" placeholder="Apartment, suite, or unit (optional)" aria-label="Address line 2" autoComplete="address-line2" maxLength={200} />
      </div>
      <div class="three-col">
        <div class="form-group">
          <label for="city">City</label>
          <input type="text" id="city" name="city" placeholder="Salt Lake City" autoComplete="address-level2" maxLength={120} required />
        </div>
        <div class="form-group">
          <label for="state">State</label>
          <input type="text" id="state" name="state" placeholder="Utah" autoComplete="address-level1" maxLength={60} required />
        </div>
        <div class="form-group">
          <label for="postalCode">ZIP</label>
          <input type="text" id="postalCode" name="postalCode" placeholder="84101" inputMode="numeric" pattern="\d{5}(-\d{4})?" title="A five-digit ZIP code" autoComplete="postal-code" maxLength={20} required />
        </div>
      </div>
      <input type="hidden" name="country" value="United States" />

      {invitation ? <><input type="hidden" name="referral" value="referred" /><input type="hidden" name="referralName" value={invitation.purchaserName} /></> : <div class="form-group">
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
        {/* "Other" opens a free-text answer, required only then. The server
            drops it again if the choice changes (visibleWhen in chapter.config). */}
        <div class={referral === "other" ? "referral-reveal show" : "referral-reveal"} id="referral-other-reveal">
          <label for="referralOther">Tell us how you found us</label>
          <input
            type="text"
            id="referralOther"
            name="referralOther"
            placeholder="A newsletter, a podcast episode, a friend of a friend…"
            maxLength={200}
            required={referral === "other"}
          />
        </div>
      </div>}

      <div class="form-group">
        <label for="whoYouAre">How would you describe yourself?</label>
        <select id="whoYouAre" name="whoYouAre" required value={whoYouAre} onChange={(e) => onWhoYouAre(e.currentTarget.value)}>
          <option value="" disabled>Select one…</option>
          {WHO_YOU_ARE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <div class={whoYouAre === "Something else" ? "referral-reveal show" : "referral-reveal"} id="who-other-reveal">
          <label for="whoYouAreOther">Tell us a little about what you do</label>
          <input
            type="text"
            id="whoYouAreOther"
            name="whoYouAreOther"
            placeholder="In your own words"
            maxLength={200}
            required={whoYouAre === "Something else"}
          />
        </div>
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
        <label for="linkedin">LinkedIn Profile</label>
        <input type="text" id="linkedin" name="linkedin" placeholder="linkedin.com/in/yourname" autoComplete="url" maxLength={500} required />
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

      {/* The gift-seat upsell (Tori, 2026-09-20). Asked here so the answer is
          on the application, then offered for purchase right after payment.
          Applies to the paid tiers; the free tier has no seat to give. A gift
          recipient never sees it. */}
      {!invitation && (
        <div class="form-group" id="gift-seat-interest">
          <label for="giftSeatInterest">A membership for your mother or daughter <span class="opt">($500 a year, included for Community Stewards)</span></label>
          <label class="checkbox-option">
            <input
              type="checkbox"
              id="giftSeatInterest"
              name="giftSeatInterest"
              value="yes"
              checked={gift.interest}
              onChange={(e) => onGift((g) => ({ ...g, interest: e.currentTarget.checked }))}
            />{" "}
            Yes, I would like to add one right after my payment.
          </label>
          <div class={gift.interest ? "referral-reveal show" : "referral-reveal"} id="gift-seat-reveal">
            <label for="giftSeatRecipientName">Her name <span class="opt">(you can add this later)</span></label>
            <input type="text" id="giftSeatRecipientName" name="giftSeatRecipientName" placeholder="Her full name" maxLength={160} value={gift.name} onInput={(e) => onGift((g) => ({ ...g, name: e.currentTarget.value }))} />
            <label for="giftSeatRecipientEmail">Her email</label>
            <input type="email" id="giftSeatRecipientEmail" name="giftSeatRecipientEmail" placeholder="her@example.com" maxLength={254} value={gift.email} onInput={(e) => onGift((g) => ({ ...g, email: e.currentTarget.value }))} />
          </div>
        </div>
      )}

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

/** The join page. `initialState` is trusted state the server produced (the
 *  same contract as Chapter's own prop), never the URL; the page boot leaves it
 *  unset and resumes through loadSiteJoinResume instead. */
export function Join({ config, initialTierId, initialState }) {
  const seatId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("seat");
  const resumeKey = seatId ? `${RESUME_KEY}:seat:${seatId}` : RESUME_KEY;
  const [referral, setReferral] = useState("");
  const [referralName, setReferralName] = useState("");
  const [whoYouAre, setWhoYouAre] = useState("");
  // The gift-seat upsell answer, kept so the seat step after payment opens
  // with her mother's or daughter's details already filled in. Kept in
  // sessionStorage too, because the seat purchase signs her in and that
  // round trip reloads the page.
  const [gift, setGiftState] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("ssc-gift") ?? "null");
      if (saved && typeof saved === "object") return { interest: Boolean(saved.interest), name: String(saved.name ?? ""), email: String(saved.email ?? "") };
    } catch {}
    return { interest: false, name: "", email: "" };
  });
  const setGift = (next) => {
    setGiftState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try { sessionStorage.setItem("ssc-gift", JSON.stringify(value)); } catch {}
      return value;
    });
  };
  const [ack, setAck] = useState(false);
  // Whether the chosen tier is free, mirrored from the packaged tier selection
  // so the step rail can drop the payment step. Preset from the URL so the
  // first paint is already right; the chooser keeps it current after that.
  // This is the applicant's CHOICE, before submit. Once an application exists
  // the server's verified tier on the resumed state wins (see StepRail below):
  // a reload without ?tier= must not turn a free membership into a paid one.
  const [freeTier, setFreeTier] = useState(() =>
    Boolean((config.tiers ?? []).find((t) => t.id === initialTierId)?.free));
  // Seeded from sessionStorage so a reload resumes; the id is a capability the
  // server re-validates, and the step itself always comes from the server.
  const [resumeId, setResumeId] = useState(() => {
    try { return sessionStorage.getItem(resumeKey) ?? null; } catch { return null; }
  });

  return (
    <>
      <div class="join-surface">
        <JoinIsland
          config={config}
          initialState={initialState}
          // Server copy for everything except the invited path's words.
          copy={{ ...(config.copy ?? {}), namedSeat: { ...(config.copy?.namedSeat ?? {}), ...GIFT_COPY } }}
          initialNamedSeatId={seatId ?? undefined}
          namedSeatClaimApi={namedSeatClaimApi}
          initialTierId={initialTierId}
          renderTiers={({ tiers, selectedTierId, selectTier }) => {
            const isFree = Boolean(tiers.find((t) => t.id === selectedTierId)?.free);
            if (isFree !== freeTier) queueMicrotask(() => setFreeTier(isFree));
            return (
              <fieldset class="membership-choice">
                <legend>Choose your membership</legend>
                {tiers.map((tier) => {
                  const d = tierDisplay(tier);
                  return (
                    <label class="membership-option" key={tier.id}>
                      <input type="radio" name="__chapterTier" value={tier.id}
                        checked={selectedTierId === tier.id} onChange={() => selectTier(tier.id)} />
                      <span>
                        <strong>{d.name}</strong>
                        <span class="membership-price">
                          {d.was && <s class="membership-was">{d.was}</s>}
                          {d.price}
                        </span>
                        {d.note && <small class="membership-note">{d.note}</small>}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            );
          }}
          membersHref="/members/"
          // The legacy page gated submit on the consent box; preserve that
          // exactly rather than relying on the server's 400.
          submitDisabled={!ack}
          // Resume a journey interrupted by a reload or a redirect-based
          // payment method. chapter-follower: resume through the canonical
          // GET /api/join/resume state, never by letting raw query flags pick a
          // UI step. loadSiteJoinResume calls exactly that endpoint, so the
          // SERVER decides which step the applicant belongs on, and then asks
          // the site's own route which membership the application holds.
          loadResume={resumeId ? () => loadSiteJoinResume(resumeId) : undefined}
          renderStepHeader={({ state }) => {
            // Keep the site's step rail in sync with the packaged flow, and
            // remember the application id so a reload can resume instead of
            // dropping the applicant back onto an empty form.
            if (state.applicationId && state.applicationId !== resumeId) {
              queueMicrotask(() => {
                try { sessionStorage.setItem(resumeKey, state.applicationId); } catch {}
                setResumeId(state.applicationId);
              });
            }
            // A resumed state carries the tier the server verified for the
            // application; only a journey that has not been submitted yet
            // reads the chooser. Browser input never overrides the server.
            const free = state.tier ? state.tier.free : freeTier;
            // Right after her payment, before booking: the gift seat for her
            // mother or daughter (paid tiers only; a gift recipient never sees it).
            const showGift = state.step === "booking" && !seatId && !free;
            return (
              <>
                <StepRail step={state.step} invited={Boolean(seatId)} free={free && !seatId} />
                {showGift && <GiftSeatOffer gift={gift} onGift={setGift} />}
              </>
            );
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
                    src={ivyBakerPriest}
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
            // The shared quote shows these server-owned amounts before consent.
            // Chapter 0.52.1 says where a difference comes from: lines.founding
            // is a policy-backed founding discount from Built Not Found; a bare
            // lines.presentation is only the catalog's comparison, so it is shown
            // as two rates and never called a discount. An older Chapter sends
            // neither field, and its discount lines keep the founding label.
            renderPriceLines: (lines) => {
              const comparisonOnly = lines.discountCents > 0 && !lines.founding && Boolean(lines.presentation);
              return (
              <div class="pay-lines" id="pay-lines">
                <div class="pay-line">
                  <span>{comparisonOnly ? "Standard rate" : "Membership price"}</span>
                  <span>{money(lines.standardCents)}</span>
                </div>
                {lines.discountCents > 0 && !comparisonOnly && (
                  <div class="pay-line discount">
                    <span>Founding-member discount</span>
                    <span>-{money(lines.discountCents)}</span>
                  </div>
                )}
                {comparisonOnly && (
                  <div class="pay-line">
                    <span>Your rate</span>
                    <span>{money(lines.dueTodayCents)}</span>
                  </div>
                )}
                <div class="pay-line total">
                  <span>Due today</span>
                  <span>{money(lines.dueTodayCents)}</span>
                </div>
              </div>
              );
            },
          }}
        >
          {({ invitation }) => <ApplicationFields
            invitation={invitation}
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
            whoYouAre={whoYouAre}
            onWhoYouAre={setWhoYouAre}
            gift={gift}
            onGift={setGift}
            ack={ack}
            onAck={setAck}
          />}
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
    const initialTierId = new URLSearchParams(window.location.search).get("tier") ?? undefined;
    // Preact owns the island after loading; remove the static loading status.
    root.replaceChildren();
    render(<Join config={config} initialTierId={initialTierId} />, root);
  } catch (err) {
    console.error(err);
    root.innerHTML =
      '<div class="card"><p class="auth-status">The application form is briefly unavailable. ' +
      'Please refresh, or email <a href="mailto:tori@silverandsaltcapital.com">tori@silverandsaltcapital.com</a>.</p></div>';
  }
}

if (typeof document !== "undefined") boot();
