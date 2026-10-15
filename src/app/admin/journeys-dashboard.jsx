// The Journeys view on the admin Dashboard (Signup Journeys v3.1, "The
// dashboard" and "Progress over time"). Four filters, a grid cut by any two
// labels, the Action bars, the list of matching people, and the conversion
// curves. Every number comes from src/labels-dashboard.mjs over one read of
// /api/admin/labels/people.

import { useEffect, useMemo, useState } from "preact/hooks";
import {
  DIMENSIONS, CONVERSIONS, actionBars, actionChoices, checkpoint, cohortCurves, grid, matching, valueOf,
} from "../../labels-dashboard.mjs";
import { ACTION_BY_ID } from "../../labels.mjs";

const PEOPLE_PATH = "/api/admin/labels/people";
const SNAPSHOTS_PATH = "/api/admin/labels/snapshots";
const WINDOWS = { d60: { label: "First 60 days", days: 60, checks: [7, 14, 21, 30, 60] }, m6: { label: "6 months", days: 182, checks: [7, 30, 60, 90, 182] }, y1: { label: "1 year", days: 365, checks: [30, 90, 182, 273, 365] }, all: { label: "All time", days: 3650, checks: [30, 90, 182, 365] } };
const LINE_COLORS = ["#1A8F7D", "#3D5A99", "#D16B4F", "#8B5E83", "#A07A2C", "#4F7A28"];
// The grid numbers are buttons that look like plain numbers until hovered.
const CELL_BUTTON = "background:none;border:0;padding:2px 8px;cursor:pointer;font:inherit;font-size:16px;color:inherit;text-decoration:underline dotted";
const TYPE_COLORS = { prospect: "#3D5A99", applicant: "#B8925A", member: "#1A8F7D", former: "#7E8E84" };

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

const nameOf = (dim, v) => DIMENSIONS[dim].names[v] ?? v;
const pct = (v) => `${Math.round(v * 100)}%`;
const monthName = (m) => new Date(m + "-15T12:00:00Z").toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function JourneysDashboard({ ctx }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [filters, setFilters] = useState({ type: "", path: "", action: "", tier: "" });
  const [rows, setRows] = useState("path");
  const [cols, setCols] = useState("type");
  useEffect(() => {
    request(PEOPLE_PATH).then((data) => setState({ loading: false, data, error: null })).catch((error) => setState({ loading: false, data: null, error }));
  }, []);

  if (state.loading) return <div class="card"><p class="muted">Loading…</p></div>;
  if (state.error) return <div class="card"><p class="muted">The journeys could not be loaded. {state.error.message}</p></div>;
  return <JourneysView people={state.data.people} now={state.data.now} ctx={ctx} filters={filters} setFilters={setFilters} rows={rows} setRows={setRows} cols={cols} setCols={setCols} />;
}

// The view itself, given the people. Exported for tests/journeys-dashboard.test.jsx.
export function JourneysView({ people, now, ctx, filters, setFilters, rows, setRows, cols, setCols }) {

  const set = (dim, v) => {
    const next = { ...filters, [dim]: v };
    if (next.action && !actionChoices(next).includes(next.action)) next.action = "";
    setFilters(next);
  };
  const hits = matching(people, filters);
  const g = grid(people, filters, rows, cols);
  const bars = actionBars(hits);
  const maxBar = Math.max(1, ...bars.map((b) => b.count));
  const ignoredNames = g.ignored.map((d) => DIMENSIONS[d].label).join(" and ");
  const pick = (r, c) => {
    const next = { ...filters };
    if (r === null && c === null) { next[rows] = ""; next[cols] = ""; }
    if (r !== null) next[rows] = r;
    if (c !== null) next[cols] = c;
    if (next.action && !actionChoices(next).includes(next.action)) next.action = "";
    setFilters(next);
  };
  const personHref = (id) => ctx.href({ workspaceId: "people", viewId: "person", recordId: id, detailTab: "journey" });

  return (
    <div style="display:grid;gap:18px">
      <div class="card" style="display:flex;flex-wrap:wrap;gap:10px 14px;align-items:end">
        {["type", "path", "action", "tier"].map((dim) => (
          <label key={dim} style="display:grid;gap:4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">
            {DIMENSIONS[dim].label}
            <select value={filters[dim]} onChange={(e) => set(dim, e.target.value)}>
              <option value="">Any</option>
              {(dim === "action" ? actionChoices(filters) : DIMENSIONS[dim].values).map((v) => <option key={v} value={v}>{nameOf(dim, v)}</option>)}
            </select>
          </label>
        ))}
        <button type="button" class="btn" onClick={() => setFilters({ type: "", path: "", action: "", tier: "" })}>Clear filters</button>
        <span style="margin-left:auto;font-size:14px"><b style="font-size:24px">{hits.length}</b> {hits.length === 1 ? "person matches" : "people match"}</span>
      </div>

      <div class="card" style="display:grid;gap:12px">
        <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:13px">
          <span class="card-label" style="margin:0">Cut the grid by</span>
          <label>Rows{" "}
            <select value={rows} onChange={(e) => setRows(e.target.value)}>
              {Object.keys(DIMENSIONS).filter((d) => d !== cols).map((d) => <option key={d} value={d}>{DIMENSIONS[d].label}</option>)}
            </select>
          </label>
          <label>Columns{" "}
            <select value={cols} onChange={(e) => setCols(e.target.value)}>
              {Object.keys(DIMENSIONS).filter((d) => d !== rows && d !== "action").map((d) => <option key={d} value={d}>{DIMENSIONS[d].label}</option>)}
            </select>
          </label>
        </div>
        <div style="overflow-x:auto">
          <table class="ftable" style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr><th style="text-align:left">{DIMENSIONS[rows].label} × {DIMENSIONS[cols].label}</th>{g.cols.map((c) => <th key={c}>{nameOf(cols, c)}</th>)}<th>All</th></tr></thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={r}>
                  <th style="text-align:left">{nameOf(rows, r)}</th>
                  {g.cols.map((c, j) => {
                    const on = g.selected && g.selected.row === r && g.selected.col === c;
                    return <td key={c} style={`text-align:center;${on ? "outline:2px solid #B8925A;outline-offset:-2px;background:rgba(184,146,90,.12)" : ""}`}><button type="button" style={CELL_BUTTON} onClick={() => pick(r, c)} aria-pressed={on ? "true" : "false"}>{g.counts[i][j]}</button></td>;
                  })}
                  <td style="text-align:center"><button type="button" style={CELL_BUTTON} onClick={() => pick(r, null)}>{g.rowTotals[i]}</button></td>
                </tr>
              ))}
              <tr><th style="text-align:left">All</th>{g.cols.map((c, j) => <td key={c} style="text-align:center"><button type="button" style={CELL_BUTTON} onClick={() => pick(null, c)}>{g.colTotals[j]}</button></td>)}<td style="text-align:center"><button type="button" style={CELL_BUTTON} onClick={() => pick(null, null)}>{g.total}</button></td></tr>
            </tbody>
          </table>
        </div>
        <p class="muted" style="font-size:12.5px;margin:0">Counts ignore the {ignoredNames} filters so every row and column stays visible; the other filters apply. Click a number to filter to those people.</p>
      </div>

      <div class="card" style="display:grid;gap:8px">
        <div class="card-label">Matching people, by action</div>
        {!bars.length ? <p class="muted">Nobody matches.</p> : bars.map((b) => (
          <div key={b.action} style="display:grid;grid-template-columns:170px 1fr 32px;gap:10px;align-items:center;font-size:13px">
            <span>{b.label}</span>
            <i style={`display:block;height:10px;border-radius:2px;background:${TYPE_COLORS[b.type]};width:${(b.count / maxBar) * 100}%`} />
            <b style="text-align:right">{b.count}</b>
          </div>
        ))}
      </div>

      <div class="card" style="overflow-x:auto">
        <div class="card-label">Matching people</div>
        <table class="ftable" style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr><th style="text-align:left">Name</th><th>Type</th><th>Path</th><th>Action</th><th>Tier</th><th>Days at action</th><th>Flags</th></tr></thead>
          <tbody>
            {hits.map((p) => (
              <tr key={p.id}>
                <th style="text-align:left"><a href={personHref(p.id)}>{p.name}</a></th>
                <td>{nameOf("type", p.type) ?? "Not set"}</td>
                <td>{nameOf("path", p.path) ?? "Not set"}</td>
                <td>{p.action ? nameOf("action", p.action) : "Not set"}</td>
                <td>{nameOf("tier", valueOf(p, "tier"))}</td>
                <td>{p.actionSince ? Math.floor((now - p.actionSince) / 864e5) : ""}</td>
                <td style="font-size:12px">{p.flags.map((f) => f.replace("flag:", "").replace(/-/g, " ")).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <JourneyCurves people={people} now={now} personHref={personHref} />
    </div>
  );
}

// Annika's conversion curves (Library team-dashboard.html, "Conversion
// curves"), ported to the labels: the same card, pill switches, stepped lines,
// end labels with leader lines, hover readout, legend and checkpoint table, in
// her colours. The counting is src/labels-dashboard.mjs (Appendix A.7).
// Tori, 2026-10-14: every step is drawn one after another in journey order,
// each with its own people underneath, and the weekly snapshots close the card.
const ANN_CSS = `
.ann{--k0:#1A8F7D;--k1:#3D5A99;--k2:#D16B4F;--k3:#8B5E83;--k4:#A07A2C;--k5:#4F7A28;--tx:#2F3E34;--tx-body:#4A5E50;--tx-mute:#7E8E84;--panel:#F4EFE6;--raise:#FFFFFF;--rule:rgba(47,62,52,.13);--rule-soft:rgba(47,62,52,.07);--good:#1A8F7D;--shadow:0 1px 2px rgba(47,62,52,.05),0 8px 28px rgba(47,62,52,.07);background:var(--raise);border:1px solid var(--rule);border-radius:12px;box-shadow:var(--shadow);padding:20px 22px;color:var(--tx-body)}
.ann h2{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:24px;color:var(--tx);margin:0 0 4px}
.ann .sub{font-size:12.5px;color:var(--tx-mute);margin:0 0 14px}
.ann .muted{color:var(--tx-mute);font-weight:400}
.ann .card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.ann .ctl{display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.ann .seg-ctl{display:inline-flex;gap:3px;background:var(--panel);padding:3px;border-radius:100px;flex-wrap:wrap}
.ann .seg-ctl button{border:0;background:transparent;padding:6px 12px;border-radius:100px;font-size:12.5px;font-weight:700;color:var(--tx-mute);cursor:pointer}
.ann .seg-ctl button[aria-selected="true"]{background:var(--raise);color:var(--tx);box-shadow:var(--shadow)}
.ann .seg-ctl.small button{font-size:12px;padding:5px 10px}
.ann .est{display:flex;align-items:center;gap:6px;font-size:13px;margin:10px 0 4px;cursor:pointer;width:max-content;max-width:100%}
.ann .est input{accent-color:var(--good);margin:0}
.ann .chart-wrap{position:relative;margin-top:6px;overflow-x:auto;overflow-y:visible}
.ann svg.curves{width:100%;min-width:560px;height:auto;display:block;overflow:visible}
.ann svg.curves .g{stroke:var(--rule-soft);stroke-width:1}
.ann svg.curves .cp{stroke:var(--rule);stroke-width:1;stroke-dasharray:3 4}
.ann svg.curves .ax{font-size:11px;fill:var(--tx-mute)}
.ann svg.curves .ln{fill:none;stroke-width:2;stroke-linejoin:round}
.ann svg.curves .end{stroke:var(--raise);stroke-width:2}
.ann svg.curves .lbl{font-size:11.5px;font-weight:700;fill:var(--tx)}
.ann svg.curves .leader{stroke:var(--tx-mute);stroke-width:1}
.ann svg.curves .hover-rule{stroke:var(--tx-mute);stroke-width:1}
.ann svg.curves .hover-hit{fill:transparent}
.ann .c0{--c:var(--k0)} .ann .c1{--c:var(--k1)} .ann .c2{--c:var(--k2)} .ann .c3{--c:var(--k3)} .ann .c4{--c:var(--k4)} .ann .c5{--c:var(--k5)}
.ann svg.curves .ln{stroke:var(--c)} .ann svg.curves .end,.ann svg.curves .sw-mark{fill:var(--c)}
.ann .sw{display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle;background:var(--c)}
.ann .legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;margin:8px 0 14px}
.ann .chart-tip{position:absolute;pointer-events:none;background:var(--raise);border:1px solid var(--rule);border-radius:8px;box-shadow:var(--shadow);padding:8px 10px;font-size:12.5px;min-width:150px;z-index:2}
.ann .chart-tip strong{color:var(--tx)}
.ann .chart-tip div{white-space:nowrap}
.ann .table-wrap{overflow-x:auto}
.ann table.ftable{width:100%;border-collapse:collapse;font-size:13.5px}
.ann table.ftable th,.ann table.ftable td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--rule-soft);white-space:nowrap}
.ann table.ftable thead th{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--tx-mute);font-weight:700}
.ann table.ftable tbody th{font-weight:700;color:var(--tx)}
.ann table.ftable td{font-variant-numeric:tabular-nums}
.ann .none{color:var(--tx-mute);font-style:italic;margin:8px 0 0}
.ann .fact{font-size:12.5px;color:var(--tx-mute);margin:10px 0 0}
.ann .path-head{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--tx-mute);margin:26px 0 0;padding-top:14px;border-top:1px solid var(--rule)}
.ann .step{margin-top:14px;padding:14px 16px;border:1px solid var(--rule-soft);border-radius:10px}
.ann .step.empty{padding:10px 16px}
.ann .step-head{display:flex;justify-content:space-between;align-items:baseline;gap:6px 16px;flex-wrap:wrap}
.ann .step h3{font-size:16px;font-weight:700;color:var(--tx);margin:0}
.ann .step .n{font-size:13px;color:var(--tx-mute)}
.ann .step .n b{color:var(--tx);font-size:15px}
.ann .step .empty-note{font-size:13px;color:var(--tx-mute);font-style:italic;margin:4px 0 0}
.ann .week{font-size:12.5px;color:var(--tx-mute);margin:4px 0 0}
.ann button.linkish{background:none;border:0;padding:0;font:inherit;font-size:13px;font-weight:700;color:var(--good);cursor:pointer;margin-top:10px}
.ann table.ftable tbody tr.pick{cursor:pointer}
.ann table.ftable tbody tr.pick:hover td,.ann table.ftable tbody tr.pick:hover th{background:var(--rule-soft)}
.ann table.ftable tbody tr.on td,.ann table.ftable tbody tr.on th{background:rgba(26,143,125,.08)}
.ann .tag{display:inline-block;font-size:11px;font-weight:700;padding:1px 7px;border-radius:100px;background:var(--panel)}
.ann .up{color:var(--good);font-weight:700}
`;
const PATH_TABS = [["every", "Every path"], ["all", "Type changes"], ["relationship_first", "Relationship first"], ["website_first", "Website first"], ["second_seat", "Second seat"]];
const PATH_HEADS = { all: "Type changes, every path", relationship_first: "Relationship first", website_first: "Website first", second_seat: "Second seat" };
const PATHS = ["all", "relationship_first", "website_first", "second_seat"];
const fmtMonth = (m, opts) => new Date(m + "-15T12:00:00Z").toLocaleString("en-US", { timeZone: "UTC", ...opts });
const fmtDay = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" });
const fmtWeek = (ymd) => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const W = 720, H = 260, L = 44, R = 64, T = 12, B = 34;

function JourneyCurves({ people, now, personHref }) {
  const [show, setShow] = useState("every");
  const [win, setWin] = useState("d60");
  const [estimates, setEstimates] = useState(false);
  const [snaps, setSnaps] = useState({ loading: true, list: [] });
  useEffect(() => {
    request(SNAPSHOTS_PATH).then((b) => setSnaps({ loading: false, list: b.snapshots ?? [] })).catch(() => setSnaps({ loading: false, list: [] }));
  }, []);
  const paths = show === "every" ? PATHS : [show];
  const latest = snaps.list[0], before = snaps.list[1];
  const fromSnap = (snap, path, id) => snap?.curves?.find((c) => c.path === path && c.id === id);

  return (
    <article class="ann">
      <style>{ANN_CSS}</style>
      <div class="card-head">
        <div>
          <h2>Conversion curves</h2>
          <p class="sub">Every step of the journey, in order. Each line is the people who started that step in the same month: the share who reached the next step within each number of days. Open a step to see the people in it.</p>
        </div>
        <div class="ctl">
          <div class="seg-ctl small" role="tablist" aria-label="Path">
            {PATH_TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={k === show ? "true" : "false"} onClick={() => setShow(k)}>{label}</button>
            ))}
          </div>
          <div class="seg-ctl small" role="tablist" aria-label="Window">
            {Object.entries(WINDOWS).map(([k, v]) => (
              <button key={k} type="button" role="tab" aria-selected={k === win ? "true" : "false"} onClick={() => setWin(k)}>{v.label}</button>
            ))}
          </div>
        </div>
      </div>
      <label class="est">
        <input type="checkbox" checked={estimates} onChange={(e) => setEstimates(e.target.checked)} /> Include estimated dates
      </label>
      {paths.map((path) => (
        <section key={path}>
          <div class="path-head">{PATH_HEADS[path]}</div>
          {CONVERSIONS[path].map((conv) => (
            <CurveStep key={conv.id} conv={conv} path={path} people={people} now={now} win={win} estimates={estimates}
              week={latest ? { ending: latest.weekEnding, now: fromSnap(latest, path, conv.id), prev: fromSnap(before, path, conv.id) } : null}
              personHref={personHref} />
          ))}
        </section>
      ))}
      <WeeklySnapshots snaps={snaps} paths={paths} />
    </article>
  );
}

// One step of the journey: its numbers, its curves, its checkpoints, and the
// people behind them (filtered to one starting month by clicking its row).
function CurveStep({ conv, path, people, now, win, estimates, week, personHref }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(null);
  const w = WINDOWS[win];
  const result = useMemo(() => cohortCurves(people, conv, { path, now, maxDays: w.days, withEstimates: estimates }), [people, conv, path, now, w.days, estimates]);
  const withEst = useMemo(() => (estimates ? null : cohortCurves(people, conv, { path, now, maxDays: w.days, withEstimates: true })), [people, conv, path, now, w.days, estimates]);
  const series = result.tranches;
  const sum = (k) => series.reduce((n, t) => n + t[k], 0);
  const hiddenEst = withEst ? withEst.tranches.reduce((n, t) => n + t.eligible, 0) - sum("eligible") : 0;
  const startName = conv.label.split(" → ")[0];

  if (!series.length) {
    return (
      <div class="step empty">
        <div class="step-head"><h3>{conv.label}</h3><span class="n">Nobody yet</span></div>
        <p class="empty-note">
          {hiddenEst > 0
            ? `${hiddenEst} ${hiddenEst === 1 ? "person has" : "people have"} only an estimated date for "${startName}". Tick "Include estimated dates" to see them.`
            : `Nobody has reached "${startName}" yet. The curve fills in as the five-minute job records each person's history.`}
        </p>
      </div>
    );
  }

  const units = series.flatMap((s) => s.units.map((u) => ({ ...u, color: s.color }))).filter((u) => !month || u.month === month);
  return (
    <div class="step">
      <div class="step-head">
        <h3>{conv.label}</h3>
        <span class="n"><b>{sum("converted")}</b> of {sum("eligible")} reached the next step · {sum("waiting")} waiting · {sum("ended")} ended</span>
      </div>
      {week?.now ? <WeekLine week={week} /> : null}
      <CurveChart series={series} win={win} />
      <div class="legend">
        {series.map((s) => <span key={s.month} class={`c${s.color}`}><i class="sw" />{monthName(s.month)} <span class="muted">({s.eligible})</span></span>)}
      </div>
      <div class="table-wrap">
        <table class="ftable">
          <thead><tr><th>Started in</th><th>Eligible</th><th>Converted</th><th>Ended</th><th>Waiting</th>{w.checks.map((d) => <th key={d}>Day {d}</th>)}<th>To date</th></tr></thead>
          <tbody>
            {series.slice().reverse().map((s) => (
              <tr key={s.month} class={`c${s.color} pick${month === s.month ? " on" : ""}`} title="Show these people" onClick={() => { setOpen(true); setMonth(month === s.month ? null : s.month); }}>
                <th scope="row"><i class="sw" />{monthName(s.month)}</th>
                <td>{s.eligible}</td><td>{s.converted}</td><td>{s.ended}</td><td>{s.waiting}</td>
                {w.checks.map((d) => {
                  const c = checkpoint(s, d);
                  return <td key={d}>{c.note ? <span class="muted" title={c.note === "not yet" ? `This group is too new to have reached day ${d}` : "Fewer than three people in this group are still being followed"}>{c.note}</span> : pct(c.value)}</td>;
                })}
                <td><strong>{pct(s.toDate)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="fact">
        {result.ineligible ? `${result.ineligible} left out because this step does not apply to them (no payment or no call). ` : ""}
        {hiddenEst > 0 ? `${hiddenEst} more with estimated dates. ` : ""}
        Endings stay in the count as not converted.{conv.unit === "attempt" ? " Counted per application, so someone who applied twice appears twice." : ""}
      </p>
      <button type="button" class="linkish" aria-expanded={open ? "true" : "false"} onClick={() => { setOpen(!open); if (open) setMonth(null); }}>
        {open ? "Hide the people" : `See the ${sum("eligible")} ${sum("eligible") === 1 ? "person" : "people"}`}
      </button>
      {open ? (
        <div class="table-wrap">
          {month ? <p class="fact">Showing {monthName(month)} only. <button type="button" class="linkish" style="margin:0" onClick={() => setMonth(null)}>Show every month</button></p> : null}
          <table class="ftable">
            <thead><tr><th>Person</th><th>Started</th><th>Outcome</th><th>Days</th></tr></thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.unit} class={`c${u.color}`}>
                  <th scope="row"><i class="sw" /><a href={personHref(u.personId)}>{u.name}</a></th>
                  <td>{fmtDay(u.startedAt)}</td>
                  <td>{u.converted ? <span class="up">Reached {fmtDay(u.reachedAt)}</span> : u.ended ? <span class="tag">{ACTION_BY_ID[u.endedAs]?.label ?? "Ended"}</span> : <span class="muted">Waiting</span>}</td>
                  <td>{u.t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function WeekLine({ week }) {
  const c = week.now, p = week.prev;
  const more = p ? c.converted - p.converted : null;
  const newStarts = p ? c.eligible - p.eligible : null;
  return (
    <p class="week">
      Week ending {fmtWeek(week.ending)}: {c.converted} of {c.eligible} converted
      {p ? <> (<span class={more > 0 ? "up" : ""}>{more >= 0 ? "+" : ""}{more} converted</span>, {newStarts >= 0 ? "+" : ""}{newStarts} started, against the week before)</> : null}.
    </p>
  );
}

// The stepped lines for one step, with end labels and the per-day readout.
function CurveChart({ series, win }) {
  const [hover, setHover] = useState(null);
  const w = WINDOWS[win];
  const MAXD = win === "all" ? Math.max(60, ...series.map((s) => s.maxAge)) : w.days;
  const x = (d) => L + (d * (W - L - R)) / MAXD;
  const y = (v) => T + (1 - v) * (H - T - B);
  const guides = { d60: [7, 14, 21, 30], m6: [30, 60, 90], y1: [90, 182, 273], all: [90, 182, 365] }[win].filter((d) => d < MAXD);
  const ticks = { d60: [0, 7, 14, 21, 30, 45, 60], m6: [0, 30, 60, 90, 120, 150, 182], y1: [0, 60, 120, 182, 240, 300, 365], all: [0, 60, 120, 180, 240, 300] }[win].filter((d) => d <= MAXD);

  // End labels: spread 15 apart where lines finish close together, kept inside the plot.
  const labels = series.map((s) => ({ x: x(s.maxT) + 8, dotY: y(s.toDate), y: y(s.toDate) + 4, c: s.color, text: fmtMonth(s.month, { month: "short" }) })).sort((a, b) => a.y - b.y);
  const near = (a, b) => Math.abs(a.x - b.x) < 52, GAP = 15, TOP = T + 10, BOTTOM = H - B - 4;
  for (let i = 0; i < labels.length; i++) for (let j = 0; j < i; j++) if (near(labels[i], labels[j]) && labels[i].y - labels[j].y < GAP) labels[i].y = labels[j].y + GAP;
  for (let i = labels.length - 1; i >= 0; i--) {
    if (labels[i].y > BOTTOM) labels[i].y = BOTTOM;
    for (let j = i + 1; j < labels.length; j++) if (near(labels[i], labels[j]) && labels[j].y - labels[i].y < GAP) labels[i].y = labels[j].y - GAP;
    if (labels[i].y < TOP) labels[i].y = TOP;
  }

  const onMove = (e) => {
    const svg = e.currentTarget.ownerSVGElement;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const day = Math.max(0, Math.min(MAXD, Math.round(((p.x - L) / (W - L - R)) * MAXD)));
    const box = svg.parentElement.getBoundingClientRect();
    setHover({ day, left: e.clientX - box.left + 14, top: Math.max(0, e.clientY - box.top - 20), width: box.width });
  };

  return (
    <div class="chart-wrap">
      <svg class="curves" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Conversion curves by starting month. The table below has the same numbers.">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}><line class="g" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text class="ax" x={L - 8} y={y(v) + 4} text-anchor="end">{v * 100}%</text></g>
        ))}
        {guides.map((d) => <line key={d} class="cp" x1={x(d)} x2={x(d)} y1={T} y2={H - B} />)}
        {series.map((s) => {
          let d = `M${x(0)} ${y(s.pts[0] ?? 0)}`;
          for (let i = 1; i <= s.maxT; i++) if (s.pts[i] !== s.pts[i - 1]) d += `H${x(i)}V${y(s.pts[i])}`;
          d += `H${x(s.maxT)}`;
          return (
            <g key={s.month} class={`c${s.color}`}>
              <path class="ln" d={d} />
              <circle class="end" cx={x(s.maxT)} cy={y(s.toDate)} r="4" />
            </g>
          );
        })}
        {labels.map((l) => (
          <g key={l.text + l.c} class={`c${l.c}`}>
            {Math.abs(l.y - 4 - l.dotY) > 3 ? <line class="leader" x1={l.x - 4} y1={l.dotY} x2={l.x + 1} y2={l.y - 4} /> : null}
            <rect class="sw-mark" x={l.x + 2} y={l.y - 5.5} width="8" height="3" rx="1.5" />
            <text class="lbl" x={l.x + 13} y={l.y}>{l.text}</text>
          </g>
        ))}
        {ticks.map((d) => <text key={d} class="ax" x={x(d)} y={H - B + 18} text-anchor="middle">{d}</text>)}
        <text class="ax" x={(L + W - R) / 2} y={H - 2} text-anchor="middle">Days since starting</text>
        {hover ? <line class="hover-rule" x1={x(hover.day)} x2={x(hover.day)} y1={T} y2={H - B} /> : null}
        <rect class="hover-hit" x={L} y={T} width={W - L - R} height={H - T - B} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hover ? (
        <div class="chart-tip" style={`left:${Math.min(hover.left, hover.width - 170)}px;top:${hover.top}px`}>
          <strong>Day {hover.day}</strong>
          {series.slice().reverse().map((s) => (
            <div key={s.month} class={`c${s.color}`}><i class="sw" />{fmtMonth(s.month, { month: "short", year: "numeric" })} <span class="muted">({s.eligible})</span> <strong>{hover.day <= s.maxT ? pct(s.pts[hover.day]) : "not yet"}</strong></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// The frozen weekly numbers, newest week first: what the weekly report reads.
function WeeklySnapshots({ snaps, paths }) {
  const weeks = snaps.list.slice(0, 8);
  return (
    <section>
      <div class="path-head">Weekly snapshots</div>
      {snaps.loading ? <p class="none">Loading…</p> : !weeks.length ? (
        <p class="none">No snapshot yet. The first is taken just after midnight on Monday, Mountain time, and freezes the week that closed on Sunday.</p>
      ) : (
        <>
          <p class="fact">Frozen each Monday for the week that just closed, exact dates only. Each cell is converted of eligible.</p>
          <div class="table-wrap">
            <table class="ftable">
              <thead><tr><th>Step</th>{weeks.map((s) => <th key={s.weekEnding}>{fmtWeek(s.weekEnding)}</th>)}</tr></thead>
              <tbody>
                {paths.flatMap((path) => CONVERSIONS[path].map((conv) => (
                  <tr key={path + conv.id}>
                    <th scope="row">{conv.label}{path === "all" ? "" : <span class="muted"> · {PATH_HEADS[path]}</span>}</th>
                    {weeks.map((s) => {
                      const c = s.curves.find((x) => x.path === path && x.id === conv.id);
                      return <td key={s.weekEnding}>{c && c.eligible ? <>{c.converted} of {c.eligible} <span class="muted">({pct(c.converted / c.eligible)})</span></> : <span class="muted">none</span>}</td>;
                    })}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
