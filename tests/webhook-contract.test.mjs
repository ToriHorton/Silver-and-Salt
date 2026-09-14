import { expect, it } from "vitest";
import config from "../odla.config.mjs";

it("reconciliation preserves the complete membership billing event contract", () => {
  // Independent expectation: omission would restore the CLI's four-event
  // fallback and silently disable paid-invoice/renewal processing.
  expect(config.stripe.webhookPath).toBe("/api/webhooks/stripe");
  expect(config.stripe.enabledEvents).toEqual([
    "charge.refunded",
    "customer.subscription.deleted",
    "customer.subscription.updated",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
    "payment_intent.canceled",
    "payment_intent.succeeded",
  ]);
  expect(new Set(config.stripe.enabledEvents).size).toBe(8);
  expect(config.envs).toEqual(["dev"]);
  expect(config.runtimes.cory.dataEnvironment).toBe("dev");
  expect(config.runtimes.tori.dataEnvironment).toBe("dev");
});
