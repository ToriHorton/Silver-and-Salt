import { expect, it } from "vitest";
import { render } from "preact-render-to-string";
import { FamilyMemberFields, FamilyMemberEditor } from "../src/app/family-member.jsx";

it.each([0, 50000])("requires full name and email for the selected family member at price %i", amountCents => {
  const html = render(<FamilyMemberFields gift={{ interest: true, name: "", email: "" }} onGift={() => {}} seatOffer={{ amountCents }} />);
  expect(html).toMatch(/name="giftSeatRecipientName"[^>]*required/);
  expect(html).toMatch(/type="email"[^>]*name="giftSeatRecipientEmail"[^>]*required/);
  expect(html).toContain(amountCents ? "$500.00 per year" : "at no extra charge");
});

it("disables recipient fields when the family member is skipped", () => {
  const html = render(<FamilyMemberFields gift={{ interest: false, name: "", email: "" }} onGift={() => {}} seatOffer={{ amountCents: 0 }} />);
  expect(html).toMatch(/name="giftSeatRecipientName"[^>]*disabled/);
  expect(html).toMatch(/name="giftSeatRecipientEmail"[^>]*disabled/);
  expect(html).not.toContain("required");
});

it("returns to the same field set with the saved details and one save action", () => {
  const html = render(<FamilyMemberEditor selection={{ recipientName: "Recipient One", recipientEmail: "recipient@example.com" }}
    offer={{ amountCents: 50000, currency: "usd", interval: "year" }} save={() => {}} cancel={() => {}} onSaved={() => {}} />);
  expect(html).toContain('id="gift-seat-interest"');
  expect(html).toContain('value="Recipient One"');
  expect(html).toContain('value="recipient@example.com"');
  expect(html).toContain("Save and return to payment");
});
