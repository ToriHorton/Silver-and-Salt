// Newsletter broadcast core. The important assertions here are the ones that
// protect a real person: that a malformed list is reported rather than silently
// shortened, that a message cannot go out without a working unsubscribe path,
// and that the payload we build actually survives @odla-ai/email's fail-closed
// validation instead of only looking right.

import { describe, expect, it } from "vitest";
import { validatePayload, MAX_RECIPIENTS } from "@odla-ai/email";
import {
  render, normalizeEmail, parseRecipientCsv, mintToken, unsubscribeUrl,
  sendability, buildPayload, textFromHtml,
} from "../src/newsletter.mjs";

const ORIGIN = "https://silverandsaltcapital.com";

describe("address normalization", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Tori@SilverAndSaltCapital.com ")).toBe("tori@silverandsaltcapital.com");
  });
  it("strips angle brackets pasted from a mail client", () => {
    expect(normalizeEmail("<a@b.co>")).toBe("a@b.co");
  });
  it("rejects what cannot be an address", () => {
    for (const bad of ["", "  ", "not-an-email", "a@b", "a b@c.com", "a@b,c.com", null, 42]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe("CSV import", () => {
  it("reads a headered list with first names", () => {
    const { recipients, rejected, duplicates } = parseRecipientCsv(
      "Email,First Name\nA@Example.com,Millicent\nb@example.com,Lauren\n",
    );
    expect(recipients).toEqual([
      { email: "a@example.com", firstName: "Millicent" },
      { email: "b@example.com", firstName: "Lauren" },
    ]);
    expect(rejected).toEqual([]);
    expect(duplicates).toBe(0);
  });

  it("treats column 0 as the address when there is no header", () => {
    const { recipients } = parseRecipientCsv("a@example.com\nb@example.com\n");
    expect(recipients.map((r) => r.email)).toEqual(["a@example.com", "b@example.com"]);
  });

  it("handles quoted fields with commas", () => {
    const { recipients } = parseRecipientCsv('email,name\n"a@example.com","Cannon, Martha"\n');
    expect(recipients[0].email).toBe("a@example.com");
  });

  it("counts duplicates instead of sending twice", () => {
    const { recipients, duplicates } = parseRecipientCsv("email\na@example.com\nA@EXAMPLE.COM\n");
    expect(recipients).toHaveLength(1);
    expect(duplicates).toBe(1);
  });

  // The point of the whole function: a bad row is REPORTED, never dropped.
  it("reports rejects rather than silently shortening the list", () => {
    const { recipients, rejected } = parseRecipientCsv("email\ngood@example.com\nnope\n");
    expect(recipients).toHaveLength(1);
    expect(rejected).toEqual([{ value: "nope", reason: "not a valid address" }]);
  });
});

describe("consent gating", () => {
  it("sends to an active subscriber", () => {
    expect(sendability({ status: "active" }).ok).toBe(true);
  });
  it("blocks unsubscribed, bounced, and complained", () => {
    expect(sendability({ status: "unsubscribed" }).ok).toBe(false);
    expect(sendability({ status: "active", deliveryStatus: "bounced" }).ok).toBe(false);
    expect(sendability({ status: "active", deliveryStatus: "complained" }).ok).toBe(false);
  });
  it("blocks an address with no subscriber record at all", () => {
    expect(sendability(undefined).ok).toBe(false);
  });
});

describe("message building", () => {
  const base = {
    fromEmail: "newsletter@silverandsaltcapital.com",
    fromName: "Silver & Salt Capital",
    replyTo: "tori@silverandsaltcapital.com",
    to: "member@example.com",
    subject: "Letter No. 1",
    html: "<p>Hello {{firstName}}</p><a href=\"{{unsubscribe_url}}\">Unsubscribe</a>",
    text: "Hello {{firstName}}\n\nUnsubscribe: {{unsubscribe_url}}",
    unsubscribeUrl: unsubscribeUrl(ORIGIN, "abc123"),
    unsubscribeMailto: "newsletter@silverandsaltcapital.com",
    vars: { firstName: "Millicent" },
  };

  it("passes @odla-ai/email fail-closed validation", () => {
    expect(() => validatePayload(buildPayload(base))).not.toThrow();
  });

  it("carries RFC 8058 one-click headers", () => {
    const p = buildPayload(base);
    expect(p.headers["List-Unsubscribe"]).toBe(
      `<${ORIGIN}/api/newsletter/unsubscribe?t=abc123>, <mailto:newsletter@silverandsaltcapital.com?subject=unsubscribe>`,
    );
    expect(p.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("substitutes the unsubscribe link into BOTH bodies", () => {
    const p = buildPayload(base);
    expect(p.html).toContain(`${ORIGIN}/api/newsletter/unsubscribe?t=abc123`);
    expect(p.text).toContain(`${ORIGIN}/api/newsletter/unsubscribe?t=abc123`);
    expect(p.html).not.toContain("{{");
    expect(p.text).not.toContain("{{");
  });

  it("always carries a plaintext part alongside the html", () => {
    const p = buildPayload(base);
    expect(p.html).toBeTruthy();
    expect(p.text).toBeTruthy();
  });

  it("addresses exactly one recipient per message", () => {
    const p = buildPayload(base);
    expect(typeof p.to).toBe("string");
    expect(p.cc).toBeUndefined();
    expect(p.bcc).toBeUndefined();
    expect(MAX_RECIPIENTS).toBeGreaterThan(0);
  });

  it("renders a name-free greeting rather than an empty word", () => {
    const p = buildPayload({ ...base, vars: {}, html: "<p>Hello{{firstName}}</p>" });
    expect(p.html).toBe("<p>Hello</p>");
  });
});

describe("tokens", () => {
  it("mints distinct, url-safe tokens", () => {
    const a = mintToken();
    const b = mintToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(encodeURIComponent(a)).toBe(a);
  });
});

describe("plaintext fallback", () => {
  it("keeps link targets visible and drops markup", () => {
    const out = textFromHtml('<p>Read <a href="https://x.co/y">the memo</a></p><p>Soon</p>');
    expect(out).toContain("the memo (https://x.co/y)");
    expect(out).not.toContain("<");
  });
});

describe("render", () => {
  it("leaves no unreplaced braces in someone's inbox", () => {
    expect(render("Hi {{a}} {{missing}}", { a: "there" })).toBe("Hi there ");
  });
});
