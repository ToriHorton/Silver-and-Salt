// Dashboard tab: the admin overview, built on @odla-ai/ui display widgets.
// MetricWidget KPI+trend cards (Applications, New members, and a full-width
// Revenue trend), a StepPipeline funnel of the stage counts with weekly deltas,
// the upcoming intro-call agenda, and the full billing table.
// Data: GET /api/admin/dashboard.
import { useState, useEffect } from "preact/hooks";
import { MetricWidget, StepPipeline } from "@odla-ai/ui/components";
import { api, STATUS_LABELS, fmtMoney, fmtTzTime } from "../lib.js";
import { BillingTab } from "./billing.jsx";

const num = (n) => Math.round(n).toLocaleString();

function DashboardStats() {
  const [d, setD] = useState(null);
  useEffect(() => { api("/api/admin/dashboard").then(setD).catch(console.error); }, []);

  const rev = d?.revenue;
  const pipe = d?.pipeline;
  const delta = d?.pipelineDelta;
  const calls = d?.calls;

  // Happy-path funnel; declined/refunded are shown as a footnote. Big count in
  // the circle, weekly inflow as the delta beneath the label.
  const funnel = Object.keys(STATUS_LABELS)
    .filter((s) => s !== "declined" && s !== "refunded")
    .map((s) => {
      const n = pipe ? (pipe[s] ?? 0) : null;
      const dv = delta ? (delta[s] ?? 0) : 0;
      return {
        icon: <span class="pipe-count">{n === null ? "–" : n}</span>,
        title: STATUS_LABELS[s],
        description: <span class={dv > 0 ? "pipe-delta" : "pipe-delta-zero"}>{dv > 0 ? `+${dv} this week` : "no change"}</span>,
      };
    });

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

      {d && d.revenueSeries && rev?.billingReady ? (
        <div class="dash-revenue">
          <MetricWidget label="Revenue · annual run rate added" data={d.revenueSeries} format={fmtMoney} size="large" />
          <p class="muted dash-revenue-note">
            Active memberships: {rev.activeCount} · Annual run rate: {fmtMoney(rev.annualRunRateCents)}{rev.testMode ? " · test mode" : ""}
          </p>
        </div>
      ) : (
        <div class="card"><div class="card-label">Revenue</div><p class="muted">{d ? "Appears once Stripe is connected." : "Loading…"}</p></div>
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
