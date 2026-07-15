// Billing tab: live Stripe subscription state joined with our applications.
// Stripe is the source of truth for money; refunds stay on the People tab.
import { useState, useEffect } from "preact/hooks";
import { api, STATUS_LABELS, SUB_BADGE, SUB_LABELS, fmtMoney, fmtDate } from "../lib.js";

const stripeLinkStyle =
  "font-size:12px;color:var(--lime-dark);font-weight:700;text-decoration:none;margin-right:10px;";

export function BillingTab() {
  const [billing, setBilling] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api("/api/admin/billing")
      .then((b) => {
        setBilling(b);
        if (b.truncated) console.warn("billing: subscription list truncated at 100");
      })
      .catch((e) => { console.error(e); setFailed(true); });
  }, []);

  const ready = billing?.billingReady;
  const s = billing?.summary;

  return (
    <>
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
        <div class="table-wrap">
          <table id="billing-table">
            <thead>
              <tr><th>Person</th><th>Membership</th><th>Subscription</th><th>Amount</th><th>Renews</th><th>Stripe</th></tr>
            </thead>
            <tbody>
              {billing === null && !failed && (
                <tr><td colSpan={6}><div class="loading-note"><span class="spinner"></span> Loading billing…</div></td></tr>
              )}
              {ready && billing.rows.map((r) => (
                <tr>
                  <td>{r.name}<span class="cell-sub">{r.email}</span></td>
                  <td>{STATUS_LABELS[r.applicationStatus] || r.applicationStatus}</td>
                  <td>
                    <span class={"pay-badge " + (SUB_BADGE[r.subscriptionStatus] || "unpaid")}>
                      {r.subscriptionStatus ? (SUB_LABELS[r.subscriptionStatus] || r.subscriptionStatus) : "None"}
                    </span>
                    {r.cancelAtPeriodEnd && r.subscriptionStatus === "active" && (
                      <span class="pay-renewal">ends at renewal</span>
                    )}
                  </td>
                  <td>{r.amountCents ? fmtMoney(r.amountCents) + "/" + (r.interval === "month" ? "mo" : "yr") : ""}</td>
                  <td>{r.renewalAt ? fmtDate(r.renewalAt) : ""}</td>
                  <td>
                    {r.customerUrl && <a href={r.customerUrl} target="_blank" rel="noopener" style={stripeLinkStyle}>Customer</a>}
                    {r.subscriptionUrl && <a href={r.subscriptionUrl} target="_blank" rel="noopener" style={stripeLinkStyle}>Subscription</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ready && !billing.rows.length && (
          <p class="empty-note">Paid memberships appear here once applicants complete payment.</p>
        )}
        {(failed || (billing && !ready)) && (
          <p class="empty-note">Billing appears once Stripe is connected (publishable key, price, and secret key).</p>
        )}
      </div>
    </>
  );
}
