// Transactional email for the Silver & Salt Capital worker.
//
// Construction is @odla-ai/email (buildMessage: RFC 5322/MIME with header
// injection protection). Transport sits behind the package's EmailSender
// seam so the Phase 5 production wiring (Cloudflare send_email binding on
// the zone) drops in without touching callers. Until a real transport
// exists, the logOnly sender records the send in emailLog and sends
// nothing; on the dev tenant every message is also REDIRECTED to the
// group's debug inbox with a "[dev]" subject prefix so test applicants
// never receive real mail.
//
// Templates live per group in groups.emailTemplates ({{placeholder}}
// substitution), owner-editable data rather than code (PAYMENT-SPEC.md).

import { buildMessage, type EmailPayload, type EmailSender } from "@odla-ai/email";
import { tx, uuidv7 } from "@odla-ai/db";

export type EmailTemplateName =
  | "adminNotification"
  | "paymentConfirmation"
  | "prepEmail"
  | "onboardingInvite";

export interface GroupRow {
  id: string;
  name: string;
  standardPriceCents: number;
  foundingDiscountCents: number;
  stripePriceId?: string;
  stripePublishableKey?: string;
  notificationEmail: string;
  replyTo: string;
  debugEmail?: string;
  calendarLink?: string;
  disclaimerText: string;
  refundPolicyText: string;
  trustCopy: string;
  commitmentText?: string;
  normsText?: string;
  emailTemplates: Record<string, { subject: string; text: string }>;
}

// Phase 5 swaps this for a send_email-binding sender (or an API adapter
// from the vault) behind the same interface.
const logOnlySender: EmailSender = {
  async send(_payload: EmailPayload) {
    // Intentionally nothing: the emailLog row is the record.
  },
};

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export async function sendTemplated(
  db: { transact: (input: unknown, opts?: { mutationId?: string }) => Promise<unknown> },
  envName: string,
  group: GroupRow,
  opts: {
    template: EmailTemplateName;
    to: string;
    vars: Record<string, string>;
    applicationId?: string;
    // Stable key so webhook retries do not double-log a send.
    dedupeKey?: string;
  },
): Promise<void> {
  const tpl = group.emailTemplates?.[opts.template];
  if (!tpl) {
    console.error("email template missing", opts.template, group.id);
    return;
  }

  const vars = {
    ...opts.vars,
    refundPolicyText: group.refundPolicyText,
    commitmentText: group.commitmentText ?? "",
    normsText: group.normsText ?? "",
  };

  const isProd = envName === "prod";
  const redirect = !isProd && !!group.debugEmail;
  const to = redirect ? group.debugEmail! : opts.to;
  const subject = (redirect ? "[dev] " : "") + render(tpl.subject, vars);
  const text = redirect
    ? `(dev redirect; original recipient: ${opts.to})\n\n` + render(tpl.text, vars)
    : render(tpl.text, vars);

  let payload: EmailPayload;
  try {
    payload = buildMessage({
      from: { name: group.name, email: group.replyTo },
      to,
      subject,
      text,
      headers: { "Reply-To": group.replyTo },
    });
  } catch (err) {
    console.error("email build failed", opts.template, err);
    return;
  }

  try {
    await logOnlySender.send(payload);
  } catch (err) {
    console.error("email send failed", opts.template, err);
    return;
  }

  const logId = uuidv7();
  await db.transact(
    tx.emailLog[logId].update({
      id: logId,
      groupId: group.id,
      ...(opts.applicationId ? { applicationId: opts.applicationId } : {}),
      to,
      template: opts.template,
      subject,
      transport: "log-only",
      redirected: redirect,
      sentAt: Date.now(),
    }),
    opts.dedupeKey ? { mutationId: `email:${opts.dedupeKey}` } : undefined,
  );
}
