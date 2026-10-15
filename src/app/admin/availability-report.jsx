// Open time for onboarding calls over the next 14 days (Tori, 2026-10-15),
// shown under the hours form in Admin > Settings > Calendar
// (settings-workspace.jsx). The numbers come from
// GET /api/admin/availability-report (src/availability-report.mjs): the live
// 14 days plus one snapshot per day for the trend.

import { useEffect, useState } from "preact/hooks";
import { fmtTzTime } from "../lib.js";

export const AVAILABILITY_REPORT_PATH = "/api/admin/availability-report";

async function request(path) {
  const headers = {};
  try {
    const token = await window.Clerk?.session?.getToken();
    if (token) headers.authorization = "Bearer " + token;
  } catch { /* answered as 401 below */ }
  const res = await fetch(path, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

/** Minutes as hours: "7.5 hours", "1 hour", "0 hours". */
export const hours = (minutes) => {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} ${h === 1 ? "hour" : "hours"}`;
};
/** Minutes as an hour count used before a noun: "10-hour". */
const hourCount = (minutes) => `${Math.round((minutes / 60) * 10) / 10}-hour`;
const shortHours = (minutes) => `${Math.round((minutes / 60) * 10) / 10}h`;
const dayLabel = (date) => new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** The note beside each day's bar. */
export function dayNote(d, index) {
  if (d.offeredMinutes) return `${shortHours(d.openMinutes)} of ${shortHours(d.offeredMinutes)}`;
  if (!d.workday) return "Not offered";
  if (d.noticeMinutes) return "Inside notice";
  return index === 0 ? "Done for today" : "Not offered";
}

const CSS = `
.avr { margin-top: 24px; }
.avr .avr-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.avr .avr-big { font-size: 34px; font-weight: 700; line-height: 1.1; }
.avr .avr-pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 13px; font-weight: 600; }
.avr .avr-pill.ok { background: #DCEBDD; color: #2F5D3A; }
.avr .avr-pill.low { background: #F6E3C8; color: #7A4B12; }
.avr .avr-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 18px 0 22px; }
.avr .avr-stat { border: 1px solid var(--ui-border); border-radius: 10px; padding: 10px 12px; }
.avr .avr-stat b { display: block; font-size: 18px; }
.avr .avr-stat span { color: var(--ui-text-faint); font-size: 13px; }
.avr h3 { font-size: 15px; margin: 18px 0 8px; }
.avr .avr-days { display: grid; gap: 6px; }
.avr .avr-day { display: grid; grid-template-columns: 110px 1fr 90px; gap: 10px; align-items: center; font-size: 14px; }
.avr .avr-track { position: relative; height: 12px; border-radius: 6px; background: var(--ui-surface-sunken, #EEF0EC); overflow: hidden; }
.avr .avr-offer { position: absolute; inset: 0 auto 0 0; background: #D9DED6; }
.avr .avr-open { position: absolute; inset: 0 auto 0 0; background: #4F7A28; }
.avr .avr-note { color: var(--ui-text-faint); font-size: 13px; text-align: right; }
.avr .avr-trend { display: flex; align-items: flex-end; gap: 3px; height: 90px; position: relative; border-bottom: 1px solid var(--ui-border); }
.avr .avr-trend .bar { flex: 1 1 0; min-width: 4px; max-width: 18px; background: #4F7A28; border-radius: 2px 2px 0 0; }
.avr .avr-trend .bar.low { background: #C98A3B; }
.avr .avr-target { position: absolute; left: 0; right: 0; border-top: 1px dashed #7A4B12; }
.avr .avr-legend { display: flex; gap: 16px; color: var(--ui-text-faint); font-size: 13px; margin-top: 8px; flex-wrap: wrap; }
.avr .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
@media (max-width: 560px) { .avr .avr-day { grid-template-columns: 84px 1fr 64px; } }
`;

export function AvailabilityReport() {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    request(AVAILABILITY_REPORT_PATH)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  }, []);
  if (state.loading) return <div class="card avr"><p class="muted">Loading your open time…</p></div>;
  if (state.error) return <div class="card avr"><p class="muted">The open time report could not be loaded. {state.error.message}</p></div>;
  return <AvailabilityView live={state.data.live} history={state.data.history ?? []} error={state.data.error} />;
}

// The view itself, given the numbers. Exported for tests.
export function AvailabilityView({ live, history, error }) {
  return (
    <section class="card avr" aria-label="Open time for calls">
      <style>{CSS}</style>
      <div class="card-label">Open time for calls, next 14 days</div>
      {live ? <Live live={live} /> : <p class="muted">{error || "The live numbers are not available right now."}</p>}
      <Trend history={history} target={live?.targetMinutes ?? history.at(-1)?.targetMinutes ?? 600} />
    </section>
  );
}

function Live({ live }) {
  const met = live.openMinutes >= live.targetMinutes;
  const maxDay = Math.max(...live.days.map((d) => d.offeredMinutes), 1);
  return (
    <>
      <div class="avr-head">
        <span class="avr-big">{hours(live.openMinutes)} open</span>
        <span class="muted">of a {hourCount(live.targetMinutes)} target</span>
        <span class={"avr-pill " + (met ? "ok" : "low")}>{met ? "On target" : `${hours(live.targetMinutes - live.openMinutes)} short`}</span>
      </div>
      <p class="muted">That is {live.openSlots} open {live.slotMinutes}-minute {live.openSlots === 1 ? "slot" : "slots"} an applicant can book right now.</p>
      <div class="avr-stats">
        <div class="avr-stat"><b>{hours(live.offeredMinutes)}</b><span>inside your set hours</span></div>
        <div class="avr-stat"><b>{live.callCount}</b><span>onboarding {live.callCount === 1 ? "call" : "calls"} booked</span></div>
        <div class="avr-stat"><b>{hours(Math.max(0, live.offeredMinutes - live.openMinutes))}</b><span>taken by calls and other events</span></div>
        <div class="avr-stat"><b>{live.firstOpenAt ? fmtTzTime(live.firstOpenAt, live.timezone) : "None"}</b><span>first open time</span></div>
      </div>
      <h3>Day by day</h3>
      <div class="avr-days">
        {live.days.map((d, i) => (
          <div class="avr-day" key={d.date}>
            <span>{dayLabel(d.date)}</span>
            <span class="avr-track" aria-hidden="true">
              <span class="avr-offer" style={{ width: `${(d.offeredMinutes / maxDay) * 100}%` }} />
              <span class="avr-open" style={{ width: `${(d.openMinutes / maxDay) * 100}%` }} />
            </span>
            <span class="avr-note">{dayNote(d, i)}</span>
          </div>
        ))}
      </div>
      <div class="avr-legend">
        <span><i class="swatch" style={{ background: "#4F7A28" }} />Open to book</span>
        <span><i class="swatch" style={{ background: "#D9DED6" }} />Inside your hours, taken</span>
        {live.days.some((d) => !d.offeredMinutes && d.noticeMinutes) && <span>Inside notice: your hours, too soon for anyone to book</span>}
      </div>
    </>
  );
}

function Trend({ history, target }) {
  if (history.length < 2) {
    return <p class="muted" style={{ marginTop: 18 }}>The daily record starts with the first morning after this goes live. A trend appears here after two days.</p>;
  }
  const top = Math.max(target, ...history.map((h) => h.openMinutes), 1) * 1.1;
  const first = history[0].day, last = history.at(-1).day;
  const metDays = history.filter((h) => h.openMinutes >= (h.targetMinutes ?? target)).length;
  return (
    <>
      <h3>Each morning, the 14 days ahead</h3>
      <div class="avr-trend" role="img" aria-label={`Open hours each morning from ${dayLabel(first)} to ${dayLabel(last)}; on target ${metDays} of ${history.length} days`}>
        <div class="avr-target" style={{ bottom: `${(target / top) * 100}%` }} />
        {history.map((h) => (
          <div key={h.day} class={"bar" + (h.openMinutes >= (h.targetMinutes ?? target) ? "" : " low")} style={{ height: `${(h.openMinutes / top) * 100}%` }} title={`${dayLabel(h.day)}: ${hours(h.openMinutes)} open, ${h.callCount} booked`} />
        ))}
      </div>
      <div class="avr-legend">
        <span>{dayLabel(first)} to {dayLabel(last)}</span>
        <span>On target {metDays} of {history.length} days</span>
        <span><i class="swatch" style={{ borderTop: "2px dashed #7A4B12", height: 0 }} />{hourCount(target)} target</span>
      </div>
    </>
  );
}
