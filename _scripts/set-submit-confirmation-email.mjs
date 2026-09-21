#!/usr/bin/env node
// Retired installer. Submit-time receipts are intentionally disabled on this
// site. The command refuses before opening credentials or reading/writing data.
// Email events and readiness are managed in Settings -> Email.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SUBMIT_CONFIRMATION = {
  subject: "We received your application to Silver & Salt Capital",
  text:
    "Hi {{firstName}},\n\n" +
    "Thank you for applying to Silver & Salt Capital. We have your {{tierName}} application. {{submitNextStep}}\n\n" +
    "Your member area, with your application and its next step, is here:\n" +
    "{{membersUrl}}\n\n" +
    "Warmly,\nSilver & Salt Capital",
  enabled: false,
};

async function main() {
  throw new Error("Submit receipts are retired. Use the email settings page to review configured events; this installer no longer writes templates.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
