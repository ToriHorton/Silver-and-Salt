// Transactional email for the Silver & Salt Capital worker.
//
// Messages are structured @odla-ai/email payloads (v0.3+: the shape
// Cloudflare Email Service's modern send() accepts), validated fail-closed
// by sendMessage. Transport sits behind the package's EmailSender seam so
// the Phase 5 production wiring (the Worker's send_email binding, adapter
// per @odla/email-router's cfSender) drops in without touching callers.
// Until a real transport exists, the logOnly sender records the send in
// emailLog with a synthesized receipt and delivers nothing; on the dev
// tenant every message is also REDIRECTED to the group's debug inbox with
// a "[dev]" subject prefix so test applicants never receive real mail.
//
// Templates live per group in groups.emailTemplates ({{placeholder}}
// substitution), owner-editable data rather than code (PAYMENT-SPEC.md).

import { sendMessage, type EmailPayload, type EmailSender, type EmailSendReceipt } from "@odla-ai/email";
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

// Phase 5 swaps this for the send_email-binding adapter behind the same
// interface: { send: async (p) => ({ messageId: (await env.EMAIL.send(p)).messageId }) }
const logOnlySender: EmailSender = {
  async send(_payload: EmailPayload): Promise<EmailSendReceipt> {
    // Intentionally no delivery: the emailLog row is the record.
    return { messageId: `log-only-${uuidv7()}` };
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

  const payload: EmailPayload = {
    from: { name: group.name, email: group.replyTo },
    to,
    subject,
    text,
    replyTo: group.replyTo,
  };

  let receipt: EmailSendReceipt;
  try {
    // sendMessage validates the payload fail-closed, then hands it to the
    // transport and returns its receipt.
    receipt = await sendMessage(logOnlySender, payload);
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
      messageId: receipt.messageId,
      redirected: redirect,
      sentAt: Date.now(),
    }),
    opts.dedupeKey ? { mutationId: `email:${opts.dedupeKey}` } : undefined,
  );
}
