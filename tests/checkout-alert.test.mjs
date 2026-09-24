// The outage email (src/checkout-alert.ts).
//
// Everything else we have is a pull: a Workers Logs line, an o11y event with
// no channel configured, a dashboard someone has to open. This is the only
// thing that reaches an inbox, so its state machine is worth pinning: it must
// speak when checkout breaks, stay quiet while it stays broken, and say so
// when it recovers.
import { describe, expect, it } from "vitest";
import {
  alertOnCheckoutHealth,
  ALERT_COOLDOWN_MS,
  CHECKOUT_DOWN_TEMPLATE,
  CHECKOUT_RECOVERED_TEMPLATE,
} from "../src/checkout-alert.ts";

const CHAPTER = "silver-and-salt-capital";
const NOTIFY = "tori@silverandsaltcapital.com";
const down = { ok: false, status: 400, detail: "quote route refused the payment step's request: invalid seat selection" };
const healthy = { ok: true, status: 404, detail: "quote route accepted the payment step's request" };

function harness({ log = [], notificationEmail = NOTIFY } = {}) {
  const sent = [];
  const written = [];
  const db = {
    async query() {
      return { groups: notificationEmail ? [{ id: CHAPTER, notificationEmail }] : [], emailLog: log };
    },
    async transact(ops) {
      written.push(ops[0].attrs);
      log.push(ops[0].attrs);
    },
  };
  const env = {
    ODLA_ENV: "prod",
    EMAIL_FROM: NOTIFY,
    SEND_EMAIL: { async send(p) { sent.push(p); return { messageId: "msg_1" }; } },
  };
  return { db, env, sent, written, log };
}

describe("checkout outage email", () => {
  it("emails when checkout breaks, and says what was seen", async () => {
    const h = harness();
    const run = await alertOnCheckoutHealth(h.db, h.env, CHAPTER, down);
    expect(run.sent).toBe("down");
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].to).toBe(NOTIFY);
    expect(h.sent[0].subject).toBe("Checkout is down: nobody can buy a membership");
    expect(h.sent[0].text).toContain("invalid seat selection");
    expect(h.sent[0].text).toContain("verify-checkout-contract.sh");
    expect(h.written[0].template).toBe(CHECKOUT_DOWN_TEMPLATE);
  });

  it("stays quiet while it stays broken, so it never becomes noise", async () => {
    const now = Date.now();
    const h = harness({ log: [{ template: CHECKOUT_DOWN_TEMPLATE, sentAt: now - 60_000 }] });
    const run = await alertOnCheckoutHealth(h.db, h.env, CHAPTER, down, now);
    expect(run.sent).toBe(null);
    expect(run.reason).toBe("cooldown");
    expect(h.sent).toHaveLength(0);
  });

  it("speaks again once the cooldown has passed", async () => {
    const now = Date.now();
    const h = harness({ log: [{ template: CHECKOUT_DOWN_TEMPLATE, sentAt: now - ALERT_COOLDOWN_MS - 1 }] });
    expect((await alertOnCheckoutHealth(h.db, h.env, CHAPTER, down, now)).sent).toBe("down");
  });

  it("sends the all clear on recovery, so silence can mean fine", async () => {
    const now = Date.now();
    const h = harness({ log: [{ template: CHECKOUT_DOWN_TEMPLATE, sentAt: now - 1000 }] });
    const run = await alertOnCheckoutHealth(h.db, h.env, CHAPTER, healthy, now);
    expect(run.sent).toBe("recovered");
    expect(h.sent[0].subject).toBe("Checkout is working again");
    expect(h.written[0].template).toBe(CHECKOUT_RECOVERED_TEMPLATE);
  });

  it("says nothing at all when checkout was never reported down", async () => {
    const h = harness();
    const run = await alertOnCheckoutHealth(h.db, h.env, CHAPTER, healthy);
    expect(run.sent).toBe(null);
    expect(run.reason).toBe("healthy");
    expect(h.sent).toHaveLength(0);
  });

  it("does not announce recovery twice", async () => {
    const now = Date.now();
    const h = harness({ log: [
      { template: CHECKOUT_DOWN_TEMPLATE, sentAt: now - 2000 },
      { template: CHECKOUT_RECOVERED_TEMPLATE, sentAt: now - 1000 },
    ] });
    expect((await alertOnCheckoutHealth(h.db, h.env, CHAPTER, healthy, now)).sent).toBe(null);
  });

  it("treats a full down and up cycle as two emails, then quiet", async () => {
    const h = harness();
    let t = Date.now();
    expect((await alertOnCheckoutHealth(h.db, h.env, CHAPTER, down, t)).sent).toBe("down");
    expect((await alertOnCheckoutHealth(h.db, h.env, CHAPTER, down, t += 1000)).sent).toBe(null);
    expect((await alertOnCheckoutHealth(h.db, h.env, CHAPTER, healthy, t += 1000)).sent).toBe("recovered");
    expect((await alertOnCheckoutHealth(h.db, h.env, CHAPTER, healthy, t += 1000)).sent).toBe(null);
    expect(h.sent).toHaveLength(2);
  });

  it("never reaches the real inbox outside production", async () => {
    const h = harness();
    h.env.ODLA_ENV = "dev";
    h.env.ODLA_DEBUG_EMAIL = "cory.ondrejka+debug@gmail.com";
    await alertOnCheckoutHealth(h.db, h.env, CHAPTER, down);
    expect(h.sent[0].to).toBe("cory.ondrejka+debug@gmail.com");
    expect(h.written[0].redirected).toBe(true);
  });

  it("records a failed send rather than pretending it went out", async () => {
    const h = harness();
    h.env.SEND_EMAIL = { async send() { throw new Error("transport exploded"); } };
    const run = await alertOnCheckoutHealth(h.db, h.env, CHAPTER, down);
    expect(run.sent).toBe(null);
    expect(run.reason).toContain("transport exploded");
    expect(h.written[0].error).toContain("transport exploded");
  });

  it("reports a missing notification address instead of throwing", async () => {
    const h = harness({ notificationEmail: "" });
    expect((await alertOnCheckoutHealth(h.db, h.env, CHAPTER, down)).reason).toBe("group-missing");
  });
});
