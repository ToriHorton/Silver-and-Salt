// The Journeys view on the admin Dashboard (Signup Journeys v3.1, "The
// dashboard" and "Progress over time"). Four filters, a grid cut by any two
// labels, the Action bars, the list of matching people, and the conversion
// curves. Every number comes from src/labels-dashboard.mjs over one read of
// /api/admin/labels/people.

import { useEffect, useMemo, useState } from "preact/hooks";
import {
  DIMENSIONS, CONVERSIONS, actionBars, actionChoices, checkpoint, cohortCurves, grid, matching, valueOf,
} from "../../labels-dashboard.mjs";

const PEOPLE_PATH = "/api/admin/labels/people";
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

      <ProgressCurves people={people} now={now} />
    </div>
  );
}

function ProgressCurves({ people, now }) {
  const [path, setPath] = useState("all");
  const [convId, setConvId] = useState(CONVERSIONS.all[0].id);
  const [win, setWin] = useState("d60");
  const [estimates, setEstimates] = useState(false);
  const convs = CONVERSIONS[path];
  const conv = convs.find((c) => c.id === convId) ?? convs[0];
  const w = WINDOWS[win];
  const result = useMemo(() => cohortCurves(people, conv, { path, now, maxDays: w.days, withEstimates: estimates }), [people, conv, path, now, w.days, estimates]);
  const series = result.tranches;
  const maxD = win === "all" ? Math.max(60, ...series.map((s) => s.maxAge)) : w.days;
  const W = 720, H = 300, L = 44, R = 64, T = 12, B = 34;
  const x = (d) => L + (d * (W - L - R)) / maxD;
  const y = (v) => T + (1 - v) * (H - T - B);

  return (
    <div class="card" style="display:grid;gap:12px">
      <div class="card-label">Progress over time</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:13px">
        <select value={path} onChange={(e) => { setPath(e.target.value); setConvId(CONVERSIONS[e.target.value][0].id); }} aria-label="Path">
          <option value="all">All paths</option>
          {["relationship_first", "website_first", "second_seat"].map((p) => <option key={p} value={p}>{DIMENSIONS.path.names[p]}</option>)}
        </select>
        <select value={conv.id} onChange={(e) => setConvId(e.target.value)} aria-label="Conversion">
          {convs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={win} onChange={(e) => setWin(e.target.value)} aria-label="Window">
          {Object.entries(WINDOWS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label><input type="checkbox" checked={estimates} onChange={(e) => setEstimates(e.target.checked)} /> Include estimated dates</label>
      </div>
      {!series.length ? (
        <p class="muted">No one has reached the starting point of this conversion yet{estimates ? "" : " on an exact date"}.</p>
      ) : (
        <>
          <div style="overflow-x:auto">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Conversion curves by starting month. The table below has the same numbers." style="width:100%;min-width:560px;height:auto">
              {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgba(47,62,52,.1)" /><text x={L - 8} y={y(v) + 4} text-anchor="end" font-size="11" fill="#7E8E84">{v * 100}%</text></g>
              ))}
              {series.map((s) => {
                let d = `M${x(0)} ${y(s.pts[0] ?? 0)}`;
                for (let i = 1; i <= s.maxT; i++) if (s.pts[i] !== s.pts[i - 1]) d += `H${x(i)}V${y(s.pts[i])}`;
                d += `H${x(s.maxT)}`;
                return (
                  <g key={s.month}>
                    <path d={d} fill="none" stroke={LINE_COLORS[s.color]} stroke-width="2" />
                    <circle cx={x(s.maxT)} cy={y(s.toDate)} r="4" fill={LINE_COLORS[s.color]} stroke="#fff" stroke-width="2" />
                    <text x={x(s.maxT) + 8} y={y(s.toDate) + 4} font-size="11.5" font-weight="700" fill="#2F3E34">{monthName(s.month).slice(0, 3)}</text>
                  </g>
                );
              })}
              <text x={(L + W - R) / 2} y={H - 2} text-anchor="middle" font-size="11" fill="#7E8E84">Days since starting</text>
            </svg>
          </div>
          <div style="overflow-x:auto">
            <table class="ftable" style="width:100%;border-collapse:collapse;font-size:13px">
              <thead><tr><th style="text-align:left">Started in</th><th>Eligible</th><th>Converted</th><th>Ended</th><th>Waiting</th>{w.checks.map((d) => <th key={d}>Day {d}</th>)}<th>To date</th></tr></thead>
              <tbody>
                {series.slice().reverse().map((s) => (
                  <tr key={s.month}>
                    <th style="text-align:left"><i style={`display:inline-block;width:10px;height:3px;margin-right:6px;vertical-align:middle;background:${LINE_COLORS[s.color]}`} />{monthName(s.month)}</th>
                    <td>{s.eligible}</td><td>{s.converted}</td><td>{s.ended}</td><td>{s.waiting}</td>
                    {w.checks.map((d) => { const c = checkpoint(s, d); return <td key={d}>{c.note ? <span class="muted">{c.note}</span> : pct(c.value)}</td>; })}
                    <td><b>{pct(s.toDate)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="muted" style="font-size:12.5px;margin:0">
            {result.ineligible ? `${result.ineligible} left out because this step does not apply to them (no payment or no call). ` : ""}
            Endings stay in the count as not converted. {estimates ? "Estimated dates are included." : "Estimated dates are left out."}
          </p>
        </>
      )}
    </div>
  );
}
