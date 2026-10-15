import { describe, expect, it } from "vitest";
import { decide } from "../_scripts/opt-in-contacts.mjs";

describe("opt-in decision", () => {
  it("opts in the default opt-out from the upload or the call ingest, or no answer", () => {
    expect(decide({ consent: "unsubscribed", consentSource: "upload-contacts" })).toBe("optin");
    expect(decide({ consent: "unsubscribed", consentSource: "crm-ingest:auto-created" })).toBe("optin");
    expect(decide({ consent: "unsubscribed" })).toBe("optin");
    expect(decide({ consent: null })).toBe("optin");
  });

  it("never overrides the person's own unsubscribe, a bounce or a suppression", () => {
    expect(decide({ consent: "unsubscribed", consentSource: "unsubscribe.oneclick" })).toMatch(/^left alone/);
    expect(decide({ consent: "unsubscribed", consentSource: "unsubscribe.token" })).toMatch(/^left alone/);
    expect(decide({ consent: "bounced", consentSource: "bounce.hard" })).toMatch(/^left alone/);
    expect(decide({ consent: "suppressed", consentSource: "admin.suppress" })).toMatch(/^left alone/);
  });

  it("leaves someone already subscribed, and reports a record with no email", () => {
    expect(decide({ consent: "subscribed" })).toBe("already");
    expect(decide(null)).toBe("no email on the record");
  });
});
