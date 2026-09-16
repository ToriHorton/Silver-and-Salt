// Billing tab: live Stripe subscription state joined with our applications,
// on the @odla-ai/ui DataTable (sortable by renewal/amount, filterable by
// person). Stripe is the source of truth for money; refunds stay on the
// People tab.
import { useState, useEffect } from "preact/hooks";
import { DataTable } from "@odla-ai/ui/components";
import { PaymentRecoveryQueue } from "@odla-ai/chapter/ui/admin";
import { api, STATUS_LABELS, SUB_BADGE, SUB_LABELS, fmtMoney, fmtDate } from "../lib.js";

const stripeLinkStyle =
  "font-size:12px;color:var(--lime-dark);font-weight:700;text-decoration:none;margin-right:10px;";

const COLUMNS = [
  {
    key: "person",
    header: "Person",
    sortAs: "string",
    sortValue: (r) => r.name,
    filterText: (r) => r.name + " " + r.email,
    cell: (r) => (
      <span class="cell-person">
        {r.name}
        <span class="cell-sub">{r.email}</span>
      </span>
    ),
  },
  {
    key: "membership",
    header: "Membership",
    sortAs: "string",
    sortValue: (r) => STATUS_LABELS[r.applicationStatus] || r.applicationStatus,
    cell: (r) => STATUS_LABELS[r.applicationStatus] || r.applicationStatus,
  },
  {
    key: "subscription",
    header: "Subscription",
    sortAs: "string",
    sortValue: (r) => r.subscriptionStatus ?? "",
    cell: (r) => (
      <>
        <span class={"pay-badge " + (SUB_BADGE[r.subscriptionStatus] || "unpaid")}>
          {r.subscriptionStatus ? (SUB_LABELS[r.subscriptionStatus] || r.subscriptionStatus) : "None"}
        </span>
        {r.cancelAtPeriodEnd && r.subscriptionStatus === "active" && (
          <span class="pay-renewal">ends at renewal</span>
        )}
      </>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    sortAs: "number",
    sortValue: (r) => r.amountCents ?? 0,
    cell: (r) => (r.amountCents ? fmtMoney(r.amountCents) + "/" + (r.interval === "month" ? "mo" : "yr") : ""),
  },
  {
    key: "renews",
    header: "Renews",
    sortAs: "date",
    sortValue: (r) => r.renewalAt ?? 0,
    cell: (r) => (r.renewalAt ? fmtDate(r.renewalAt) : ""),
  },
  {
    key: "stripe",
    header: "Stripe",
    cell: (r) => (
      <>
        {r.customerUrl && <a href={r.customerUrl} target="_blank" rel="noopener" style={stripeLinkStyle}>Customer</a>}
        {r.subscriptionUrl && <a href={r.subscriptionUrl} target="_blank" rel="noopener" style={stripeLinkStyle}>Subscription</a>}
      </>
    ),
  },
];

export function BillingTab() {
  const [billing, setBilling] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    api("/api/admin/billing")
      .then((b) => {
        setBilling(b);
        if (b.truncated) console.warn("billing: subscription list truncated at 100");
      })
      .catch((e) => { console.error(e); setFailed(true); });
  }, [revision]);

  const cancel = async (id) => {
    if (!window.confirm("Cancel future renewals? Access continues through the paid term. No refund will be issued.")) return;
    setBusy(id); setMessage("");
    try {
      await api(`/api/admin/applications/${id}/cancel-renewal`, { method: "POST" });
      setMessage("Renewal canceled. Paid access continues through the current term.");
      setRevision(value => value + 1);
    } catch (error) { setMessage(error.message || "Cancellation could not be confirmed. Please retry."); }
    finally { setBusy(""); }
  };
  const columns = [...COLUMNS, { key: "cancelRenewal", header: "Renewal", cell: row =>
    row.cancelAtPeriodEnd ? "Ends after paid term" : ["active", "trialing", "past_due", "unpaid"].includes(row.subscriptionStatus)
      ? <button type="button" class="btn-action" disabled={Boolean(busy)} onClick={() => void cancel(row.id)}>
        {busy === row.id ? "Canceling…" : "Cancel renewal"}</button> : "—" }];

  const ready = billing?.billingReady;
  const s = billing?.summary;

  return (
    <>
      {message && <p role="status">{message}</p>}
      <PaymentRecoveryQueue getToken={getToken} />
      <div class="card">
        <div class="card-label">
          Billing {ready && billing.testMode && <span class="pay-badge unpaid" style="margin-left:8px;">Test mode</span>}
        </div>
        <div class="stats-row">
          <div class="stat"><div class="stat-num">{s ? s.activeCount : "–"}</div><div class="stat-label">Active memberships</div></div>
          <div class="stat"><div class="stat-num">{s ? fmtMoney(s.annualRunRateCents) : "–"}</div><div class="stat-label">Annual run rate</div></div>
          <div class="stat"><div class="stat-num">{s ? s.renewingSoonCount : "–"}</div><div class="stat-label">Renewing in 60 days</div></div>
          <div class="stat"><div class="stat-num">{s ? s.pastDueCount : "–"}</div><div class="stat-label">Past due</div></div>
          <div class="stat"><div class="stat-num">{s ? s.refundedCount : "–"}</div><div class="stat-label">Refunded</div></div>
        </div>
        <p class="empty-note" style="font-size:12px;">Live from Stripe. Amounts and renewal dates come from each subscription; the run rate counts only memberships that will renew. Refunds live on the People tab; deeper detail is one click away in Stripe.</p>
      </div>

      <div class="card">
        <div class="card-label">Memberships</div>
        {failed || (billing && !ready) ? (
          <p class="empty-note">Billing appears once Stripe is connected (publishable key, price, and secret key).</p>
        ) : (
          <DataTable
            rows={billing?.rows ?? []}
            columns={columns}
            rowKey={(r) => r.id}
            filterable
            filterPlaceholder="Filter by name or email…"
            defaultSort={{ key: "renews", dir: "asc" }}
            loading={billing === null}
            loadingState={<div class="loading-note"><span class="spinner"></span> Loading billing…</div>}
            emptyState={<p class="empty-note">Paid memberships appear here once applicants complete payment.</p>}
            ariaLabel="Memberships"
          />
        )}
      </div>
    </>
  );
}

const getToken = async () => window.Clerk?.session?.getToken() ?? null;
