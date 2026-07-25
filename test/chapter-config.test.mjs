// Locks the behavior decisions in src/chapter.config.mjs that chapter would
// otherwise default differently, and that change the product silently.
//
// Every assertion here corresponds to a documented default the conversion
// deliberately overrides. A chapter upgrade that flips one of these is a
// product change with no local diff, which is exactly what this catches.

import { describe, expect, it } from "vitest";
import { chapter } from "../src/chapter.config.mjs";

describe("send policy", () => {
  it("notifies the admin on payment, not on submit", () => {
    // Chapter defaults to "submit". This site has never emailed the admin for
    // an unpaid application; the notification fires on invoice.paid and the
    // console lists everything. Inheriting the default would start mailing on
    // every submit with nothing in the diff to show it.
    expect(chapter.sends.adminNotification).toBe("payment");
  });
});

describe("application intake", () => {
  it("refuses a submit that carries no disclaimer acknowledgement", () => {
    expect(chapter.application.requireDisclaimerAck).toBe(true);
  });

  it("requires the fields the join form marks required", () => {
    expect([...chapter.application.required].sort()).toEqual(
      ["email", "firstName", "lastName", "message", "referral", "whoYouAre"].sort(),
    );
  });

  it("only exposes the curated profile fields to the browser", () => {
    // Clerk public_metadata.profile is client-readable, so this list is a
    // disclosure decision. The intro message and referral chain stay db-only.
    expect([...chapter.application.profileFields].sort()).toEqual(
      ["focus", "linkedin", "phone", "state", "whoYouAre"].sort(),
    );
    expect(chapter.application.profileFields).not.toContain("message");
    expect(chapter.application.profileFields).not.toContain("referralName");
  });

  it("declares every CRM-projected field on the person type", () => {
    // defineChapter() throws on an undeclared crmField, but assert it so the
    // failure names the field rather than the whole config.
    const fields = Object.keys(chapter.crm.config.types.person.fields);
    for (const field of chapter.application.crmFields) {
      expect(fields).toContain(field);
    }
  });
});

describe("pipeline", () => {
  it("keeps the seven statuses the live tenants hold, in order", () => {
    expect(chapter.pipeline.stages).toEqual([
      "submitted",
      "paid_pending_vetting",
      "call_scheduled",
      "interviewed",
      "approved",
      "declined",
      "refunded",
    ]);
  });

  it("mirrors the pipeline onto the CRM person stages", () => {
    // crm_record.stage mirrors applications.status. A mismatch would make a
    // real status unrepresentable in the console.
    expect(chapter.crm.config.types.person.pipeline.stages.map((s) => s.id)).toEqual([
      ...chapter.pipeline.stages,
    ]);
  });

  it("allows approval only once money has arrived or a call has happened", () => {
    expect(chapter.pipeline.approvableFrom).toEqual([
      "paid_pending_vetting",
      "call_scheduled",
      "interviewed",
    ]);
    expect(chapter.pipeline.approvableFrom).not.toContain("submitted");
  });

  it("allows booking from a fresh submit and allows rebooking", () => {
    expect(chapter.pipeline.bookableFrom).toContain("submitted");
    expect(chapter.pipeline.bookableFrom).toContain("call_scheduled");
  });
});

describe("admin operations", () => {
  it("promotes to member and sends the onboarding invite on approve", () => {
    expect(chapter.operations.onApprove).toEqual({
      promoteTo: "member",
      send: "onboardingInvite",
    });
  });

  it("refuses a refund once a membership is approved", () => {
    // The current year is non-refundable after approval (refund policy), so
    // approve and refund are mutually exclusive end states.
    expect(chapter.operations.refund.allowedFrom).not.toContain("approved");
    expect(chapter.operations.refund.allowedFrom).not.toContain("refunded");
    expect(chapter.operations.refund.cancelSubscription).toBe(true);
  });
});

describe("roles", () => {
  it("runs the provisional/member/admin ladder with the super-admin tier", () => {
    expect(chapter.auth.ladder).toEqual(["provisional", "member", "admin"]);
    expect(chapter.auth.adminRole).toBe("admin");
    // superAdmins is the only tier that may create or modify admins, and it is
    // written only in odla Studio. Turning it off would let any admin mint
    // another admin.
    expect(chapter.auth.superAdmins).toBe(true);
  });

  it("creates the Clerk account at submit so the join flow can hand one over", () => {
    expect(chapter.account).toBe("create");
  });
});

describe("brand", () => {
  it("carries the app palette the pages already ship", () => {
    expect(chapter.brand.tokens.accent).toBe("#7CB83F");
    expect(chapter.brand.tokens.text).toBe("#2F3E34");
    expect(chapter.brand.tokens.background).toBe("#eef4ea");
    expect(chapter.brand.tokens.border).toBe("#d6e8d2");
  });

  it("pins the positive chart color to the one brand green", () => {
    // odla-ui defaults to accent-blue plus a separate good-green, which reads
    // as a second state in a single-green brand.
    expect(chapter.brand.tokens.chartPositive).toBe(chapter.brand.tokens.accent);
  });

  it("renders digits in Cormorant Infant", () => {
    // Garamond's "1" is an unflagged stem that misreads as I/l.
    expect(chapter.brand.fonts.numeral).toContain("Cormorant Infant");
    expect(chapter.brand.fonts.display).toContain("Cormorant Garamond");
  });
});

describe("copy", () => {
  it("uses no em dashes or en dashes anywhere", () => {
    // Brand rule 4. Chapter's own defaults fill every leaf we do not override,
    // so this walks the RESOLVED contract, not just our overrides.
    const offenders = [];
    const walk = (node, path) => {
      if (typeof node === "string") {
        if (node.includes("—") || node.includes("–")) offenders.push(path);
        return;
      }
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
      }
    };
    walk(chapter.copy, "copy");
    expect(offenders).toEqual([]);
  });

  it("writes the brand name in full wherever it appears", () => {
    const offenders = [];
    const walk = (node, path) => {
      if (typeof node === "string") {
        // "Silver & Salt" must always be followed by "Capital".
        if (/Silver\s*&\s*Salt(?!\s+Capital)/.test(node)) offenders.push(`${path}: ${node}`);
        if (/Silver\s+and\s+Salt/i.test(node)) offenders.push(`${path}: ${node}`);
        return;
      }
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
      }
    };
    walk(chapter.copy, "copy");
    walk(chapter.config.policy, "policy");
    walk(chapter.config.emails.templates, "emails.templates");
    expect(offenders).toEqual([]);
  });
});
