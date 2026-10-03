import { expect, it } from "vitest";
import { render } from "preact-render-to-string";
import { AdditionalMemberFields, AdditionalMemberEditor } from "@odla-ai/chapter/ui/member";
import { FAMILY_MEMBER_OPTIONS } from "../src/app/family-member.mjs";

it("uses the shared controls with family wording and the existing application field names", () => {
  const html = render(<AdditionalMemberFields {...FAMILY_MEMBER_OPTIONS} value={{ selected: true, name: "Sample Sister", email: "sister@example.com" }}
    onChange={() => {}} offer={{ amountCents: 0 }} />);
  expect(html).toContain("mother, daughter, or sister");
  expect(html).toContain("Yes, include my family member at no extra charge.");
  expect(html).toContain('name="giftSeatInterest"');
  expect(html).toContain('name="giftSeatRecipientName"');
  expect(html).toContain('name="giftSeatRecipientEmail"');
  const editor = render(<AdditionalMemberEditor {...FAMILY_MEMBER_OPTIONS} selection={null}
    offer={{ amountCents: 0, currency: "usd", interval: "year" }} save={() => {}} cancel={() => {}} />);
  expect(editor).toContain("Edit family member details");
  expect(editor).toContain("Save details");
});
