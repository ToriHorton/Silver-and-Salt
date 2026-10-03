import { useState } from "preact/hooks";

const money = (cents, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
const Req = () => <span class="req" aria-hidden="true">*</span>;

/** The single family-member field set, shared by Apply and Edit details. */
export function FamilyMemberFields({ gift, onGift, seatOffer }) {
  return <div class="form-group" id="gift-seat-interest">
    <label for="giftSeatInterest">A membership for your mother, daughter, or sister</label>
    <p class="hint">{seatOffer?.amountCents === 0 ? "Included with your membership at no extra charge."
      : seatOffer ? `${money(seatOffer.amountCents, seatOffer.currency)} per ${seatOffer.interval ?? "year"}, paid with your membership.`
        : "Your family-member rate will be confirmed at checkout."}</p>
    <label class="checkbox-option">
      <input type="checkbox" id="giftSeatInterest" name="giftSeatInterest" value="yes" checked={gift.interest}
        onChange={event => { const interest = event.currentTarget.checked; onGift(current => ({ ...current, interest })); }} />{" "}
      {seatOffer?.amountCents === 0 ? "Yes, include my family member at no extra charge." : "Yes, I would like to add one family member."}
    </label>
    <div class={gift.interest ? "referral-reveal show" : "referral-reveal"} id="gift-seat-reveal">
      <label for="giftSeatRecipientName">Full name <Req /></label>
      <input type="text" id="giftSeatRecipientName" name="giftSeatRecipientName" placeholder="Full name"
        required={gift.interest} minLength={2} disabled={!gift.interest} maxLength={160} value={gift.name}
        onInput={event => {
          const input = event.currentTarget;
          input.setCustomValidity(input.value.trim().length < 2 ? "Enter her full name." : "");
          onGift(current => ({ ...current, name: input.value }));
        }} />
      <label for="giftSeatRecipientEmail">Email <Req /></label>
      <input type="email" id="giftSeatRecipientEmail" name="giftSeatRecipientEmail" placeholder="her@example.com"
        required={gift.interest} disabled={!gift.interest} maxLength={254} value={gift.email}
        onInput={event => { const email = event.currentTarget.value; onGift(current => ({ ...current, email })); }} />
    </div>
  </div>;
}

/** Return to the same fields while retaining the existing application and quote. */
export function FamilyMemberEditor({ selection, offer, save, cancel, onSaved }) {
  const [gift, setGift] = useState({ interest: Boolean(selection), name: selection?.recipientName ?? "", email: selection?.recipientEmail ?? "" });
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  return <form class="join-form family-member-editor" onSubmit={async event => {
    event.preventDefault();
    if (saving || !event.currentTarget.reportValidity()) return;
    setSaving(true); setError("");
    try {
      await save(gift.interest ? { recipientName: gift.name.trim(), recipientEmail: gift.email.trim() } : null);
      onSaved(gift);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save your changes. Try again."); }
    finally { setSaving(false); }
  }}>
    <h2>Edit family member details</h2>
    <fieldset disabled={saving}>
      <FamilyMemberFields gift={gift} onGift={setGift} seatOffer={offer} />
      {error ? <p role="alert">{error}</p> : null}
      <button class="submit-btn" type="submit">{saving ? "Saving…" : "Save and return to payment"}</button>
      <button type="button" onClick={cancel}>Cancel</button>
    </fieldset>
  </form>;
}
