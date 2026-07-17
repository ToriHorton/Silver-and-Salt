// Dashboard tab: the admin overview. Aggregate stat cards (application flow
// with total / last-7 / last-30 splits, live revenue, pipeline breakdown), the
// upcoming intro-call agenda with drift alerts (the folded-in Calendar), and
// the full billing table. Powered by GET /api/admin/dashboard plus the existing
// BillingTab.
import { useState, useEffect } from "preact/hooks";
import { api, STATUS_LABELS, fmtMoney, fmtTzTime } from "../lib.js";
import { BillingTab } from "./billing.jsx";

function DashboardStats() {
  const [d, setD] = useState(null);
  useEffect(() => { api("/api/admin/dashboard").then(setD).catch(console.error); }, []);

  const apps = d?.applications;
  const rev = d?.revenue;
  const pipe = d?.pipeline;
  const calls = d?.calls;

  return (
    <>
      <div class="card">
        <div class="card-label">Applications</div>
        <div class="stats-row">
          <div class="stat"><div class="stat-num">{apps ? apps.total : "–"}</div><div class="stat-label">Total</div></div>
          <div class="stat"><div class="stat-num">{apps ? apps.last7 : "–"}</div><div class="stat-label">Last 7 days</div></div>
          <div class="stat"><div class="stat-num">{apps ? apps.last30 : "–"}</div><div class="stat-label">Last 30 days</div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-label">Revenue <span class="brand-amp">&amp;</span> memberships{rev?.testMode ? " · test mode" : ""}</div>
        {rev && !rev.billingReady ? (
          <p class="muted">Revenue appears once Stripe is connected.</p>
        ) : (
          <div class="stats-row">
            <div class="stat"><div class="stat-num">{rev ? rev.activeCount : "–"}</div><div class="stat-label">Active</div></div>
            <div class="stat"><div class="stat-num">{rev ? fmtMoney(rev.annualRunRateCents) : "–"}</div><div class="stat-label">Annual run rate</div></div>
            <div class="stat"><div class="stat-num">{rev ? rev.newPaid7 : "–"}</div><div class="stat-label">New paid · 7d</div></div>
            <div class="stat"><div class="stat-num">{rev ? rev.newPaid30 : "–"}</div><div class="stat-label">New paid · 30d</div></div>
          </div>
        )}
      </div>

      <div class="card">
        <div class="card-label">Pipeline</div>
        <div class="stats-row">
          {Object.keys(STATUS_LABELS).map((s) => (
            <div class="stat"><div class="stat-num">{pipe ? (pipe[s] ?? 0) : "–"}</div><div class="stat-label">{STATUS_LABELS[s]}</div></div>
          ))}
        </div>
      </div>

      <div class="card">
        <div class="card-label">
          Upcoming intro calls{calls?.needsAttention ? ` · ${calls.needsAttention} need attention` : ""}
        </div>
        {!d ? (
          <p class="muted"><span class="spinner"></span> Loading…</p>
        ) : !d.agenda.length ? (
          <p class="muted">No upcoming calls.</p>
        ) : (
          <ul class="dash-agenda">
            {d.agenda.map((m) => (
              <li class="dash-agenda-row">
                <span class="dash-agenda-when">{fmtTzTime(m.startAt, d.timezone)}</span>
                <span class="dash-agenda-who">{m.name}{m.email ? ` · ${m.email}` : ""}</span>
                {m.drift && m.drift !== "none" && <span class="pay-badge refunded">drift</span>}
                {m.htmlLink && <a href={m.htmlLink} target="_blank" rel="noopener" class="dash-agenda-link">open</a>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function DashboardTab() {
  return (
    <>
      <DashboardStats />
      <BillingTab />
    </>
  );
}
