// Dashboard tab: the admin overview, built on @odla-ai/ui display widgets.
// MetricWidget KPI+trend cards (Applications, New members) with week/month
// toggles, a StatBand for point-in-time revenue, a StepPipeline funnel of the
// stage counts, the upcoming intro-call agenda, and the full billing table.
// Data: GET /api/admin/dashboard.
import { useState, useEffect } from "preact/hooks";
import { MetricWidget, StatBand, StepPipeline } from "@odla-ai/ui/components";
import { api, STATUS_LABELS, fmtMoney, fmtTzTime } from "../lib.js";
import { BillingTab } from "./billing.jsx";

const num = (n) => Math.round(n).toLocaleString();

function DashboardStats() {
  const [d, setD] = useState(null);
  useEffect(() => { api("/api/admin/dashboard").then(setD).catch(console.error); }, []);

  const rev = d?.revenue;
  const pipe = d?.pipeline;
  const calls = d?.calls;

  const revStats = rev && rev.billingReady
    ? [
        { value: rev.activeCount, label: "Active memberships" },
        { value: fmtMoney(rev.annualRunRateCents), label: "Annual run rate" },
      ]
    : null;

  // Happy-path funnel; declined/refunded are shown as a footnote.
  const funnel = Object.keys(STATUS_LABELS)
    .filter((s) => s !== "declined" && s !== "refunded")
    .map((s) => ({ num: pipe ? String(pipe[s] ?? 0) : "–", title: STATUS_LABELS[s] }));

  return (
    <>
      <div class="dash-metrics">
        {!d ? (
          <div class="card"><p class="muted"><span class="spinner"></span> Loading…</p></div>
        ) : (
          <MetricWidget label="Applications" data={d.applicationsSeries} format={num} />
        )}
        {!d ? (
          <div class="card"><p class="muted"><span class="spinner"></span> Loading…</p></div>
        ) : d.membersSeries ? (
          <MetricWidget label="New members" data={d.membersSeries} format={num} />
        ) : (
          <div class="card"><div class="card-label">New members</div><p class="muted">Appears once Stripe is connected.</p></div>
        )}
      </div>

      {revStats && (
        <div class="card">
          <StatBand
            serif
            heading={<>Revenue <span class="brand-amp">&amp;</span> memberships{rev.testMode ? " · test mode" : ""}</>}
            stats={revStats}
          />
        </div>
      )}

      <div class="card">
        <div class="card-label">Pipeline</div>
        <StepPipeline ariaLabel="Membership pipeline" steps={funnel} />
        <p class="muted" style="margin-top:14px">
          Declined {pipe ? (pipe.declined ?? 0) : "–"} · Refunded {pipe ? (pipe.refunded ?? 0) : "–"}
        </p>
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
