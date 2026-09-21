import { describe, expect, it, vi } from "vitest";
import { chapterEmailEvents, validateEmailReadiness } from "@odla-ai/chapter";
import { chapterFor } from "../src/chapter.config.mjs";
import { remindUnbooked } from "../src/signup-paths.ts";

const now = 1_800_000_000_000;
function fixture(name = "Standard Member", template = { subject: "Your application", text: "Hi {{firstName}}, continue here: {{membersUrl}}", enabled: true }) {
  const chapter = chapterFor("prod"), send = vi.fn(async () => ({ messageId: "test-receipt" }));
  const rows = {
    groups: [{ id: chapter.id, name: chapter.name, replyTo: "team@example.com", emailTemplates: template ? { paymentReminder: template } : {} }],
    applications: [{ id: "app", groupId: chapter.id, tierId: "standard", stripeRuntime: "live", firstName: "Ada", email: "ada@example.com", status: "submitted", createdAt: now - 25 * 3_600_000 }],
    tiers: [{ id: "standard", groupId: chapter.id, name, priceCents: 100000, active: true }], emailLog: [],
  };
  const db = {
    async query(query) {
      return Object.fromEntries(Object.entries(query).map(([ns, spec]) => [ns, (rows[ns] ?? []).filter(row => Object.entries(spec.$?.where ?? {}).every(([key, value]) => row[key] === value))]));
    },
    async transact(ops) {
      for (const op of ops) { const list = rows[op.ns] ??= []; let row = list.find(row => row.id === op.id); if (!row) list.push(row = { id: op.id }); Object.assign(row, op.attrs); }
      return { txId: 1, duplicate: false };
    },
  };
  const run = () => remindUnbooked({ chapter, makeDb: () => db }, { ODLA_ENV: "prod", ODLA_RUNTIME: "live", SEND_EMAIL: { send }, EMAIL_FROM: "team@example.com" }, { now });
  return { chapter, send, rows, run };
}

describe("Silver email readiness", () => {
  it("includes all real reminder and gift events and identifies missing copy without sending", () => {
    const f = fixture(), events = chapterEmailEvents(f.chapter);
    expect(Object.keys(events)).toEqual(expect.arrayContaining(["bookingReminder", "bookingReminderFree", "paymentReminder", "bookingReminderAdmin", "callBookedAdmin", "paidApprovedAdmin", "seatAccepted", "namedSeatInvitation"]));
    const audit = validateEmailReadiness({ events, templates: {}, groupValues: {}, tiers: f.rows.tiers });
    expect(audit.events.every(event => event.status === "blocked")).toBe(true);
    expect(f.send).not.toHaveBeenCalled();
  });
  it.each(["", "standard", "sku_internal"])("blocks an actual scheduled reminder when its tier name is %j", async name => {
    const f = fixture(name); await f.run(); expect(f.send).not.toHaveBeenCalled(); expect(f.rows.emailLog).toEqual([]);
  });
  it("blocks absent copy and delivers a configured reminder once", async () => {
    const missing = fixture("Standard Member", null); await missing.run(); expect(missing.send).not.toHaveBeenCalled();
    const f = fixture(); expect((await f.run()).sent).toBe(1); await f.run(); expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.send.mock.calls[0][0].text).toContain("Hi Ada");
  });
});
