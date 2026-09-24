// Tell Tori, by email, when nobody can buy a membership. And tell her when
// they can again.
//
// The 2026-09-22 outage ran for about 41 hours because every signal we had was
// a pull, not a push: a line in Workers Logs, an o11y event with no channel
// configured, and a dashboard that had to be opened. The break was found by
// trying to buy a membership. This closes that loop without depending on
// anyone else's platform work.
//
// This is an OPERATIONS alert, not applicant mail. It deliberately does not go
// through the signup email templates: those are Tori's configured applicant
// copy, deliberately sparse (no receipts, three stall notices), and an outage
// notice has no business living in that set or being switchable with it. It
// composes its own subject and body and sends straight through the transport.
//
// State and cooldown ride on the existing emailLog namespace, so nothing here
// needs a schema change. The most recent of the two templates IS the state:
// a `down` row on top means we are alerting, a `recovered` row means we are not.

import { resolveTransport, type SendEmailBinding } from "./email";
import type { CheckoutProbeResult } from "./checkout-probe";

export const CHECKOUT_DOWN_TEMPLATE = "checkoutDownAdmin";
export const CHECKOUT_RECOVERED_TEMPLATE = "checkoutRecoveredAdmin";

/** While checkout stays down, repeat at most this often. Often enough that it
 *  cannot be forgotten, rarely enough that it never becomes noise to filter. */
export const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const STATUS_URL = "https://silverandsaltcapital.com/join";

export interface CheckoutAlertRun {
  sent: "down" | "recovered" | null;
  reason?: string;
}

type Row = Record<string, unknown>;
type Db = {
  query: (q: unknown) => Promise<Record<string, unknown>>;
  transact: (input: unknown, opts?: { mutationId?: string }) => Promise<unknown>;
};

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const downBody = (detail: string, since: string) => `Nobody can buy a membership right now.

The checkout canary could not get a payment quote from the live site.

  What the canary saw: ${detail}
  First seen: ${since}

An applicant reaching the payment step sees "Payment could not be set up.
Please try again." and cannot pay. No charge is made, no receipt is sent, and
nothing is written down, so this will not show up anywhere else on its own.

What to do:

  1. Confirm it by hand:
     _scripts/verify-checkout-contract.sh https://silverandsaltcapital.com
  2. Check whether an @odla-ai package was upgraded or a deploy landed just
     before this started. That is what caused the 2026-09-22 outage.
  3. The join page: ${STATUS_URL}

You will get one more of these at most every six hours while it stays down,
and an all clear when it recovers.`;

const recoveredBody = (downSince: string) => `Checkout is working again.

The canary got a valid payment quote from the live site, so applicants can pay.

  Was down since: ${downSince}

Nothing else is needed. This note exists so that silence never has to mean
"probably fine".`;

/**
 * Send the outage note or the all clear, at most one per run.
 *
 * `result` is the canary's own verdict, so this never re-probes and never
 * disagrees with what the cron already measured.
 */
export async function alertOnCheckoutHealth(
  db: Db,
  env: Record<string, unknown>,
  chapterId: string,
  result: CheckoutProbeResult,
  now: number = Date.now(),
): Promise<CheckoutAlertRun> {
  const { groups, emailLog } = (await db.query({
    groups: { $: { where: { id: chapterId }, limit: 1 } },
    emailLog: { $: { where: { groupId: chapterId }, limit: 500 } },
  })) as { groups?: Row[]; emailLog?: Row[] };

  const group = groups?.[0];
  const notify = str(group?.notificationEmail);
  if (!group || !notify) return { sent: null, reason: group ? "notification-email-missing" : "group-missing" };

  // The newest of our two rows is the current alert state.
  const ours = (emailLog ?? [])
    .filter((row) => row.template === CHECKOUT_DOWN_TEMPLATE || row.template === CHECKOUT_RECOVERED_TEMPLATE)
    .filter((row) => !row.error)
    .sort((a, b) => num(b.sentAt) - num(a.sentAt));
  const last = ours[0];
  const alerting = last?.template === CHECKOUT_DOWN_TEMPLATE;

  let template: string;
  let subject: string;
  let body: string;

  if (!result.ok) {
    // Still down and we said so recently: stay quiet until the cooldown ends.
    if (alerting && now - num(last?.sentAt) < ALERT_COOLDOWN_MS) return { sent: null, reason: "cooldown" };
    const since = alerting ? new Date(num(last?.sentAt)).toISOString() : new Date(now).toISOString();
    template = CHECKOUT_DOWN_TEMPLATE;
    subject = "Checkout is down: nobody can buy a membership";
    body = downBody(result.detail, since);
  } else {
    // Healthy, and we never said otherwise: nothing to announce.
    if (!alerting) return { sent: null, reason: "healthy" };
    template = CHECKOUT_RECOVERED_TEMPLATE;
    subject = "Checkout is working again";
    body = recoveredBody(new Date(num(last?.sentAt)).toISOString());
  }

  const envName = str(env.ODLA_ENV);
  const debugEmail = str(env.ODLA_DEBUG_EMAIL);
  // Outside production this must never reach the real inbox.
  const to = envName === "prod" ? notify : debugEmail || notify;
  const redirected = to !== notify;

  const from = str(env.EMAIL_FROM);
  const transport = resolveTransport(env.SEND_EMAIL as SendEmailBinding | undefined, from || undefined);

  let messageId = "";
  let error = "";
  try {
    const receipt = await transport.sender.send({
      from: transport.fromEmail ?? from,
      to,
      subject,
      text: body,
    });
    messageId = receipt.messageId;
  } catch (err) {
    error = (err as Error).message.slice(0, 200);
  }

  const id = crypto.randomUUID();
  await db.transact(
    [{
      t: "update",
      ns: "emailLog",
      id,
      attrs: {
        id,
        groupId: chapterId,
        to,
        template,
        subject,
        body,
        transport: transport.name,
        sentAt: now,
        ...(messageId ? { messageId } : {}),
        ...(redirected ? { redirected: true } : {}),
        ...(error ? { error } : {}),
        dedupeKey: `${template}:${now}`,
      },
    }],
    { mutationId: `checkout-alert:${id}` },
  );

  if (error) return { sent: null, reason: `send-failed: ${error}` };
  return { sent: template === CHECKOUT_DOWN_TEMPLATE ? "down" : "recovered" };
}
