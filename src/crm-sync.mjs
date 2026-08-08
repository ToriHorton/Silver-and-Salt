// One-way projection: operational `applications` + `$users` -> CRM `person`.
//
// The pipeline stays authoritative in `applications.status`; this only mirrors
// it into `crm_record` so the admin has one relationship surface (tags, notes,
// tasks, consent, email) over the person. Everything here is fired AFTER the
// authoritative operational write, and callers swallow its errors: a CRM
// hiccup must never 5xx a webhook, a join, or an approve.
//
// Idempotent by construction: every sync resolves the person's existing
// record by lowercased primary email first, so re-running (including the
// backfill route) updates in place instead of duplicating.

import { createRecord, updateRecord, setStage, linkIdentity } from "@odla-ai/crm";
import { tx } from "@odla-ai/db";
import { crm, PERSON_STAGES } from "./crm.mjs";

const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

// NOTE (2026-07-17): the earlier `wrapCrmDb` compatibility shim (null-strip +
// id-stamp) was removed once @odla-ai/crm 0.1.2 + @odla-ai/db 0.6.6 shipped:
// crm 0.1.2 mirrors the entity id as an attr itself and no longer writes null
// slots, and its CRM_SCHEMA now declares that `id` attr. The injected AdminDb
// is passed straight through.

// The person type's custom-field input, mapped from an application row (or a
// synthetic {email, firstName} for an account with no application). The email
// field backs the consent-bearing primary channel; name is required.
function personInputFromApp(app) {
  const first = str(app.firstName);
  const last = str(app.lastName);
  const name = `${first} ${last}`.trim() || str(app.email);
  return {
    name,
    email: str(app.email),
    firstName: first,
    lastName: last,
    phone: str(app.phone),
    state: str(app.state),
    whoYouAre: str(app.whoYouAre),
    referral: str(app.referral),
    referralName: str(app.referralName),
    linkedin: str(app.linkedin),
    focus: Array.isArray(app.focus) ? app.focus : [],
    message: str(app.message),
    applicationId: str(app.id),
    // "associate" | "founding" | "steward"; legacy rows read as founding.
    tier: str(app.tier) || "founding",
  };
}

// The billing-facet snapshot columns, derived from the application's Stripe
// fields + pipeline status. These are promoted `crm_record` columns (not
// custom fields), so they are written directly with the tx builder — the CRM
// write path (createRecord/updateRecord) never touches them, so there is no
// clobber as long as this runs after those.
function billingColumnsFromApp(app) {
  const status = str(app.status);
  const paid = Boolean(app.stripeSubscriptionId) && status !== "refunded";
  let billingStatus = "none";
  if (status === "refunded") billingStatus = "refunded";
  else if (app.canceled === true) billingStatus = "canceled";
  else if (paid) billingStatus = "active";
  const cols = { billingStatus };
  if (app.stripeCustomerId) cols.stripeCustomerId = str(app.stripeCustomerId);
  if (app.stripeSubscriptionId) cols.subscriptionId = str(app.stripeSubscriptionId);
  if (typeof app.renewalAt === "number") cols.renewalAt = app.renewalAt;
  return cols;
}

// Upsert the person record for one application (or synthetic account row) and
// mirror its stage, billing snapshot, and Clerk identity. `stage` is the
// applications.status to mirror; omit it for account-only rows that aren't in
// the pipeline. Throws on failure (the backfill route counts; the operational
// call sites wrap in .catch).
export async function syncPersonToCrm(db, { app, stage }) {
  const emailKey = str(app.email).toLowerCase();
  if (!emailKey) return null;
  const deps = { crm, db };

  const { crm_record } = await db.query({
    crm_record: { $: { where: { type: "person", primaryEmail: emailKey }, limit: 1 } },
  });
  const existing = crm_record?.[0] ?? null;
  const input = personInputFromApp(app);
  const desiredStage = stage && PERSON_STAGES.includes(stage) ? stage : undefined;

  let recordId;
  if (existing) {
    recordId = existing.id;
    await updateRecord(deps, { id: recordId, input });
  } else {
    const created = await createRecord(deps, {
      type: "person",
      input,
      ...(desiredStage ? { stage: desiredStage } : {}),
    });
    recordId = created.id;
  }

  // Stage mirror: only move when it actually changed, and stamp a stable
  // mutationId so a replay never piles up duplicate stage_change activities.
  if (existing && desiredStage && existing.stage !== desiredStage) {
    await setStage(deps, {
      id: recordId,
      to: desiredStage,
      authorId: "system",
      mutationId: `crm:stage:${recordId}:${desiredStage}`,
    });
  }

  // Billing snapshot: promoted columns, written directly (see note above).
  await db.transact(tx.crm_record[recordId].update(billingColumnsFromApp(app)));

  // Clerk identity: stamps clerkUserId when a $users row matches the email;
  // a no-op (linked:false) until the person has an account. Best-effort and
  // non-fatal: right after a create the record read can briefly lag, and the
  // link is re-attempted on the next sync (e.g. approve) anyway — never fail
  // the whole person sync over it.
  try {
    await linkIdentity(deps, {
      recordId,
      email: emailKey,
      mutationId: `crm:link:${recordId}:${emailKey}`,
    });
  } catch (err) {
    console.error("crm linkIdentity failed (non-fatal)", emailKey, err instanceof Error ? err.message : err);
  }

  return recordId;
}

// Backfill / migration: project every existing application (newest per person)
// and every account-only user into the CRM. Idempotent (safe to re-run). Dev
// volumes fit one 1000-row page; a production backfill would page through.
export async function backfillCrm(db) {
  const [{ applications }, { $users }] = await Promise.all([
    db.query({ applications: { $: { order: { createdAt: "desc" }, limit: 1000 } } }),
    db.query({ $users: { $: { limit: 1000 } } }),
  ]);

  const seen = new Set();
  let synced = 0;
  const errors = [];

  for (const a of applications ?? []) {
    const key = str(a.email).toLowerCase();
    if (!key || seen.has(key)) continue; // newest-first: one record per person
    seen.add(key);
    try {
      await syncPersonToCrm(db, { app: a, stage: str(a.status) });
      synced++;
    } catch (err) {
      errors.push({ email: key, error: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const u of $users ?? []) {
    if (u.deleted === true) continue;
    const key = str(u.email).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      await syncPersonToCrm(db, { app: { email: u.email, firstName: str(u.name) } });
      synced++;
    } catch (err) {
      errors.push({ email: key, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { synced, errors };
}
