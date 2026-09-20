// Where Chapter's operator alerts go on this site.
//
// From @odla-ai/chapter 0.52.0 the Worker raises an error-level alert when a
// signed Stripe webhook enters quarantine or collides
// (stripe_webhook_quarantined: money captured at Stripe with no local effect
// until an operator drains /api/admin/payment-recovery) and when a network
// commercial exception becomes active. Chapter's own fallback is one
// structured console.error line, which Workers Logs keeps. This recorder keeps
// that line AND reports through @odla-ai/o11y: recordError alone is silent
// until the Worker carries the o11y ingest token (provision --push-secrets
// mints it), and an alert that says captured money has no local effect must
// never be silent.
//
// Reports carry counts and provider event ids only, never payloads or PII.

import { recordError } from "@odla-ai/o11y";
import type { chapterWorker } from "@odla-ai/chapter/worker";

/** The recorder shape `chapterWorker({ chapter, recordError })` accepts. */
export type ChapterAlertRecorder = NonNullable<Parameters<typeof chapterWorker>[0]["recordError"]>;

/** Workers Logs line first (Chapter's own shape), then the o11y report;
 *  returns o11y's artifact id for the report. */
export const recordChapterAlert: ChapterAlertRecorder = (error, report) => {
  console.error("chapter_alert", JSON.stringify({ message: error.message, ...report }));
  return recordError(error, report);
};
