// Transactional email for the Silver & Salt Capital worker.
//
// Messages are structured @odla-ai/email payloads (v0.3+: the shape
// Cloudflare Email Service's modern send() accepts), validated fail-closed
// by sendMessage. Transport sits behind the package's EmailSender seam:
// when the Worker has a send_email binding (wrangler.jsonc) AND a verified
// EMAIL_FROM address, sends go out through Cloudflare Email Service; without
// either, the logOnly sender records the send in emailLog and delivers
// nothing. On the dev tenant every message is REDIRECTED to the group's
// debug inbox with a "[dev]" subject prefix so test applicants never receive
// real mail; a dev tenant with no debug inbox falls back to log-only for the
// same reason.
//
// Templates live per group in groups.emailTemplates ({{placeholder}}
// substitution), owner-editable data rather than code (PAYMENT-SPEC.md).
// Each template carries an owner-editable `enabled` flag (absent = enabled);
// a disabled template skips the send unless the caller forces it (the admin
// test route).

import { sendMessage, type EmailPayload, type EmailSender, type EmailSendReceipt } from "@odla-ai/email";
import { tx, uuidv7 } from "@odla-ai/db";

export type EmailTemplateName =
  | "adminNotification"
  | "paymentConfirmation"
  | "prepEmail"
  | "onboardingInvite";

export const EMAIL_TEMPLATE_NAMES: readonly EmailTemplateName[] = [
  "adminNotification",
  "paymentConfirmation",
  "prepEmail",
  "onboardingInvite",
];

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
  emailTemplates: Record<string, { subject: string; text: string; enabled?: boolean }>;
}

// The Worker's send_email binding (Cloudflare Email Service). The structured
// send() accepts the EmailPayload shape directly and returns a messageId.
export interface SendEmailBinding {
  send(payload: EmailPayload): Promise<{ messageId: string }>;
}

export interface EmailTransport {
  sender: EmailSender;
  name: "cloudflare" | "log-only";
  // The verified sender address (must be on a domain onboarded to Email
  // Service in this Cloudflare account). Dev: an odla.ai address until the
  // Phase 5 cutover onboards silverandsaltcapital.com.
  fromEmail?: string;
}

const logOnlySender: EmailSender = {
  async send(_payload: EmailPayload): Promise<EmailSendReceipt> {
    // Intentionally no delivery: the emailLog row is the record.
    return { messageId: `log-only-${uuidv7()}` };
  },
};

// Pick the real transport when both halves of the wiring exist; the seam
// means callers never know the difference.
export function resolveTransport(
  binding: SendEmailBinding | undefined,
  fromEmail: string | undefined,
): EmailTransport {
  if (binding && fromEmail) {
    return {
      name: "cloudflare",
      fromEmail,
      sender: {
        async send(payload: EmailPayload): Promise<EmailSendReceipt> {
          const { messageId } = await binding.send(payload);
          return { messageId };
        },
      },
    };
  }
  return { name: "log-only", sender: logOnlySender };
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

export interface SendResult {
  sent: boolean;
  // "disabled" | "template-missing" | "already-sent" | a transport error code
  reason?: string;
}

export async function sendTemplated(
  db: {
    transact: (input: unknown, opts?: { mutationId?: string }) => Promise<unknown>;
    query: (q: unknown) => Promise<Record<string, unknown>>;
  },
  envName: string,
  transport: EmailTransport,
  group: GroupRow,
  opts: {
    template: EmailTemplateName;
    to: string;
    vars: Record<string, string>;
    applicationId?: string;
    // Stable key so webhook retries do not deliver (or double-log) twice.
    dedupeKey?: string;
    // The admin test route sends even when the template is disabled.
    force?: boolean;
  },
): Promise<SendResult> {
  const tpl = group.emailTemplates?.[opts.template];
  if (!tpl) {
    console.error("email template missing", opts.template, group.id);
    return { sent: false, reason: "template-missing" };
  }
  if (tpl.enabled === false && !opts.force) {
    return { sent: false, reason: "disabled" };
  }

  // Real transports deliver, so a retried webhook must not send twice: a
  // prior successful row with this dedupeKey means the mail already went out.
  if (opts.dedupeKey) {
    const { emailLog } = (await db.query({
      emailLog: { $: { where: { dedupeKey: opts.dedupeKey }, limit: 10 } },
    })) as { emailLog?: Array<Record<string, unknown>> };
    if (emailLog?.some((row) => !row.error)) {
      return { sent: true, reason: "already-sent" };
    }
  }

  const vars = {
    ...opts.vars,
    refundPolicyText: group.refundPolicyText,
    commitmentText: group.commitmentText ?? "",
    normsText: group.normsText ?? "",
  };

  const isProd = envName === "prod";
  const redirect = !isProd && !!group.debugEmail;
  // Fail-safe: outside prod, no debug inbox means no delivery at all.
  const effective: EmailTransport =
    !isProd && !redirect ? { name: "log-only", sender: logOnlySender } : transport;
  const to = redirect ? group.debugEmail! : opts.to;
  const subject = (redirect ? "[dev] " : "") + render(tpl.subject, vars);
  const text = redirect
    ? `(dev redirect; original recipient: ${opts.to})\n\n` + render(tpl.text, vars)
    : render(tpl.text, vars);

  const payload: EmailPayload = {
    from: {
      name: group.name,
      // log-only never delivers, so its unverified from address is harmless.
      email: effective.fromEmail ?? group.replyTo,
    },
    to,
    subject,
    text,
    replyTo: group.replyTo,
  };

  const logBase = {
    groupId: group.id,
    ...(opts.applicationId ? { applicationId: opts.applicationId } : {}),
    ...(opts.dedupeKey ? { dedupeKey: opts.dedupeKey } : {}),
    to,
    template: opts.template,
    subject,
    transport: effective.name,
    redirected: redirect,
    sentAt: Date.now(),
  };

  let receipt: EmailSendReceipt;
  try {
    // sendMessage validates the payload fail-closed, then hands it to the
    // transport and returns its receipt.
    receipt = await sendMessage(effective.sender, payload);
  } catch (err) {
    const code =
      (err as { code?: string })?.code ?? (err instanceof Error ? err.message : "send-failed");
    console.error("email send failed", opts.template, code);
    // Failure rows are written unconditionally (no mutationId) so a later
    // retry's success row is never swallowed by the dedupe.
    const failId = uuidv7();
    await db.transact(
      tx.emailLog[failId].update({ id: failId, ...logBase, error: code.slice(0, 200) }),
    );
    return { sent: false, reason: code };
  }

  const logId = uuidv7();
  await db.transact(
    tx.emailLog[logId].update({ id: logId, ...logBase, messageId: receipt.messageId }),
    opts.dedupeKey ? { mutationId: `email:${opts.dedupeKey}` } : undefined,
  );
  return { sent: true };
}
