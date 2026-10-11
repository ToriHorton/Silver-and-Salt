import { expect, it, vi } from "vitest";
import { submitApplication } from "@odla-ai/chapter";
import { chapter } from "../src/chapter.config.mjs";

const applicant = { firstName: "Sample", lastName: "Buyer", email: "buyer@example.com", referral: "search",
  whoYouAre: "Working professional", message: "I would like to join.", linkedinOptOut: "yes",
  address1: "100 Main St", city: "Salt Lake City", state: "UT", postalCode: "84101", disclaimerAck: true };

it.each(["giftSeatRecipientName", "giftSeatRecipientEmail"])("requires %s before creating an application with a family member", async field => {
  const db = { query: vi.fn(async () => ({})), transact: vi.fn(), secrets: { get: vi.fn() } };
  const input = { ...applicant, giftSeatInterest: "yes", giftSeatRecipientName: "Sample Sister", giftSeatRecipientEmail: "sister@example.com" };
  delete input[field];
  const result = await submitApplication(db, chapter, input, { now: 1, newId: () => "app-test" });
  expect(result).toEqual({ ok: false, error: `${field} is required` });
  expect(db.transact).not.toHaveBeenCalled();
});
