// What silverandsaltcapital.com pages actually load, by CSP directive. Keep
// in step with the pages; the policy is report-only until reviewed.
import type { HardeningConfig } from "./hardening";

export const SILVER_HARDENING: HardeningConfig = {
  clerkOrigin: "https://clerk.silverandsaltcapital.com",
  script: ["https://js.stripe.com", "https://www.googletagmanager.com"],
  style: ["https://fonts.googleapis.com", "https://api.fontshare.com"],
  font: ["https://fonts.gstatic.com", "https://cdn.fontshare.com", "https://api.fontshare.com"],
  connect: ["https://api.stripe.com", "https://www.googletagmanager.com", "https://www.google-analytics.com", "https://*.google-analytics.com", "https://clerk-telemetry.com"],
  frame: ["https://js.stripe.com", "https://hooks.stripe.com"],
};
