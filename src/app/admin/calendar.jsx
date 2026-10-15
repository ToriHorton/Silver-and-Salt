// Calendar tab (ADMIN-CALENDAR-SPEC.md): every introduction call three
// ways: by user, agenda, and a month grid. The month and agenda surfaces
// are @odla-ai/ui CalendarMonth/CalendarAgenda (styled by the vendored
// calendar.css + the page's --ui-* brand tokens); the by-user view and the
// detail/action panel follow the console's existing patterns. All times
// render in the group scheduling timezone, labelled once.
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import { CalendarMonth, CalendarAgenda } from "@odla-ai/ui/components";
import { api, bus, fmtTzTime, tzShort } from "../lib.js";
import { SlotPicker } from "../slot-picker.jsx";

const VIEWS = [
  ["user", "By user"],
  ["agenda", "Agenda"],
  ["month", "Month"],
];
const linkStyle = "font-size:12px;color:var(--lime-dark);font-weight:700;text-decoration:none;";

// Month anchors live as "YYYY-MM"; the render instant is mid-month noon
// UTC, inside that month in every timezone.
const monthKeyOf = (ms, tz) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" })
    .formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}`;
};
const anchorOf = (key) => {
  const [y, m] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, 15, 12);
};
const shiftMonth = (key, delta) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 15, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function DriftBadge({ m, tz }) {
  if (m.status === "cancelled") return <span class="pay-badge unpaid">Cancelled</span>;
  if (m.drift === "time_changed") {
    return (
      <>
        <span class="pay-badge refunded">Moved in Google</span>
        <span class="cell-sub">Google shows {m.driftGoogleStartAt ? fmtTzTime(m.driftGoogleStartAt, tz) : "a different time"}</span>
      </>
    );
  }
  if (m.drift === "gone_from_google") return <span class="pay-badge refunded">Removed in Google</span>;
  return (
    <>
      <span class="pay-badge paid">In sync</span>
      {m.adoptedFromGoogleAt && Date.now() - m.adoptedFromGoogleAt < 7 * 86400000 ? (
        <span class="cell-sub">updated from Google {new Date(m.adoptedFromGoogleAt).toLocaleDateString()}</span>
      ) : null}
    </>
  );
}

// Drift stays loud without a click (the flagged-never-adopted doctrine):
// every out-of-sync meeting, past or future, listed above the views.
// Exported for the render suite.
export function NeedsAttention({ meetings, tz, onSelect }) {
  const flagged = meetings
    .filter((m) => m.drift && m.drift !== "none" && m.status !== "cancelled")
    .sort((a, b) => a.startAt - b.startAt);
  if (!flagged.length) return null;
  return (
    <div class="cal-attention">
      <div class="cal-attention-head">Needs attention</div>
      {flagged.map((m) => (
        <button type="button" class="cal-person-row" key={m.id} onClick={() => onSelect(m)}>
          <span>
            {m.applicant ? m.applicant.name : "(unknown)"}
            {m.applicant && <span class="cell-sub">{m.applicant.email}</span>}
          </span>
          <span>{fmtTzTime(m.startAt, tz)}</span>
          <span><DriftBadge m={m} tz={tz} /></span>
        </button>
      ))}
    </div>
  );
}

// The site's fetch with the Clerk session token, keeping the server's error
// message and code (window.SSCAuth.api drops both).
async function request(path, body) {
  const headers = { "content-type": "application/json" };
  try {
    const token = await window.Clerk?.session?.getToken();
    if (token) headers.authorization = "Bearer " + token;
  } catch { /* the route answers 401 and the panel says so */ }
  const res = await fetch(path, { method: "POST", headers, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { code: data.code, status: res.status });
  return data;
}

/** Epoch ms for a wall-clock date ("2026-10-20") and time ("07:30") in `tz`.
 *  Exported for the render suite. */
export function zonedTime(date, time, tz) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  if (![y, mo, d, h, mi].every(Number.isFinite)) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(ms)).reduce((o, x) => ({ ...o, [x.type]: Number(x.value) }), {});
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - ms;
  };
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return guess;
}

const isoDate = (ms, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

// Detail and actions for one selected call. Moves go through the site's own
// route (src/call-admin-route.mjs): any time, open slot or not, with a check
// against the calendar and the callMoved email. Cancelling offers "invite them
// to pick a new time" (our email, no Google notice) or "cancel only"
// (Chapter's route; Google notifies the guest). Exported for the render suite.
export function MeetingDetail({ m, tz, onChanged, onClose, now = Date.now() }) {
  const [mode, setMode] = useState(null); // null | "move" | "cancel"
  const [slotState, setSlotState] = useState(null);
  const [anyDate, setAnyDate] = useState("");
  const [anyTime, setAnyTime] = useState("");
  const [busyAsk, setBusyAsk] = useState(null); // startAt awaiting "move anyway"
  const [note, setNote] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setMode(null); setSlotState(null); setBusyAsk(null); setNote(null);
    setAnyDate(isoDate(m.startAt, tz)); setAnyTime("");
  }, [m.id]);

  const upcoming = m.status === "scheduled" && (m.endAt ?? m.startAt) > now;

  const openMove = async () => {
    setMode("move"); setSlotState(null); setNote(null); setBusyAsk(null);
    try {
      const data = await api("/api/schedule/slots");
      setSlotState(data.schedulingReady && data.slots.length ? { phase: "ready", slots: data.slots, timezone: data.timezone } : { phase: "none" });
    } catch (e) {
      console.error(e);
      setSlotState({ phase: "error" });
    }
  };

  const done = (message) => {
    bus.dispatchEvent(new Event("people:reload"));
    onChanged(message);
  };

  const move = async (startAt, force = false) => {
    setWorking(true); setNote(null);
    try {
      const r = await request(`/api/admin/calls/${m.id}/move`, { startAt, force });
      done(r.emailed ? "Moved. They have the new time by email and in their calendar invitation." : "Moved. Their calendar invitation shows the new time.");
    } catch (e) {
      if (e.code === "busy" || e.code === "busy_unknown") setBusyAsk(startAt);
      setNote(e.message);
    } finally {
      setWorking(false);
    }
  };

  const moveAnyTime = () => {
    const startAt = anyDate && anyTime ? zonedTime(anyDate, anyTime, tz) : null;
    if (startAt === null) { setNote("Choose a date and a time."); return; }
    move(startAt);
  };

  const cancel = async (rebook) => {
    setWorking(true); setNote(null);
    try {
      if (rebook) {
        await request(`/api/admin/calls/${m.id}/cancel-rebook`);
        done("Cancelled. They have an email with a link to pick a new time.");
      } else {
        await request(`/api/admin/meetings/${m.id}/cancel`);
        done("Cancelled. Google has told them the call is off.");
      }
    } catch (e) {
      setNote(e.message || "The call could not be cancelled. Try again.");
      setWorking(false);
    }
  };

  return (
    <div class="cal-detail">
      <div class="cal-detail-head">
        <div>
          <strong>{m.applicant ? m.applicant.name : "(unknown)"}</strong>
          {m.applicant && <span class="cell-sub">{m.applicant.email}</span>}
        </div>
        <button class="signout-btn" onClick={onClose}>Close</button>
      </div>
      <p class="cal-detail-when">{fmtTzTime(m.startAt, tz)}</p>
      <p style="margin: 6px 0 10px;"><DriftBadge m={m} tz={tz} /></p>
      <p class="cal-detail-links">
        {m.meetUrl && <a href={m.meetUrl} target="_blank" rel="noopener" style={linkStyle}>Meet link</a>}
        {m.htmlLink && <a href={m.htmlLink} target="_blank" rel="noopener" style={linkStyle + "margin-left:12px;"}>Open in Google Calendar</a>}
      </p>
      {upcoming && mode === null && (
        <div class="row-actions" style="margin-top: 12px;">
          <button class="row-save row-approve" disabled={working} onClick={openMove}>Move the call</button>
          <button class="row-save row-refund" disabled={working} onClick={() => { setMode("cancel"); setNote(null); }}>Cancel the call</button>
        </div>
      )}
      {upcoming && mode === "cancel" && (
        <div class="resched-cell" style="margin-top: 12px;">
          <p class="resched-note"><strong>Cancel this call?</strong></p>
          <div class="row-actions" style="flex-wrap: wrap; gap: 8px;">
            <button class="row-save row-approve" disabled={working} onClick={() => cancel(true)}>Cancel and invite them to pick a new time</button>
            <button class="row-save row-refund" disabled={working} onClick={() => cancel(false)}>Cancel only</button>
            <button class="signout-btn" disabled={working} onClick={() => { setMode(null); setNote(null); }}>Keep the call</button>
          </div>
          <p class="resched-note">"Invite them" sends our email with a link to book again, and Google sends nothing. "Cancel only" sends Google's cancellation notice.</p>
        </div>
      )}
      {upcoming && mode === "move" && (
        <div class="resched-cell" style="margin-top: 12px;">
          {slotState === null && <div class="loading-note"><span class="spinner"></span> Loading open times…</div>}
          {slotState?.phase === "none" && <p class="resched-note">No open times right now. Use any time below.</p>}
          {slotState?.phase === "error" && <p class="resched-note">Open times could not be loaded. Use any time below.</p>}
          {slotState?.phase === "ready" && (
            <SlotPicker
              slots={slotState.slots}
              timezone={slotState.timezone}
              classes={{ days: "resched-days", day: "resched-day", times: "resched-times", time: "resched-time" }}
              onPick={(slot) => move(slot.startAt)}
            />
          )}
          <p class="resched-note" style="margin-top: 12px;"><strong>Or any time</strong> ({tzShort(tz)}), for a time you agreed with them directly:</p>
          <div class="row-actions" style="flex-wrap: wrap; gap: 8px; align-items: center;">
            <input type="date" aria-label="Date" value={anyDate} onInput={(e) => setAnyDate(e.currentTarget.value)} />
            <input type="time" aria-label="Time" step="300" value={anyTime} onInput={(e) => setAnyTime(e.currentTarget.value)} />
            <button class="row-save row-approve" disabled={working} onClick={moveAnyTime}>Move to this time</button>
          </div>
          {working && <p class="resched-note">Moving the call…</p>}
          {note && <p class="resched-note" role="alert">{note}</p>}
          {busyAsk !== null && (
            <div class="row-actions" style="gap: 8px;">
              <button class="row-save row-approve" disabled={working} onClick={() => move(busyAsk, true)}>Move anyway</button>
              <button class="signout-btn" disabled={working} onClick={() => { setBusyAsk(null); setNote(null); }}>Pick another time</button>
            </div>
          )}
          <p class="resched-note">The video link stays the same. Google updates their invitation and we email them the new time.</p>
          <button class="signout-btn" disabled={working} onClick={() => { setMode(null); setNote(null); setBusyAsk(null); }}>Keep the current time</button>
        </div>
      )}
      {mode !== "move" && note && <p class="resched-note" role="alert">{note}</p>}
    </div>
  );
}

function ByUser({ meetings, tz, person, onPerson, onSelect }) {
  const now = Date.now();
  const sections = useMemo(() => {
    const byEmail = new Map();
    for (const m of meetings) {
      const key = m.applicant?.email ?? "(unknown)";
      if (!byEmail.has(key)) byEmail.set(key, { name: m.applicant?.name ?? "(unknown)", email: key, rows: [] });
      byEmail.get(key).rows.push(m);
    }
    for (const s of byEmail.values()) {
      const upcoming = s.rows.filter((m) => m.startAt >= now).sort((a, b) => a.startAt - b.startAt);
      const past = s.rows.filter((m) => m.startAt < now).sort((a, b) => b.startAt - a.startAt);
      s.rows = [...upcoming, ...past];
      s.next = upcoming[0]?.startAt ?? Infinity;
    }
    return [...byEmail.values()].sort((a, b) => a.next - b.next || a.name.localeCompare(b.name));
  }, [meetings, now]);

  const shown = person ? sections.filter((s) => s.email === person) : sections;

  return (
    <>
      <div class="tpl-block" style="max-width: 360px;">
        <label class="tpl-label" for="cal-person">Person</label>
        <select id="cal-person" value={person || ""} onChange={(e) => onPerson(e.currentTarget.value || null)}>
          <option value="">Everyone</option>
          {sections.map((s) => <option value={s.email}>{s.name} ({s.email})</option>)}
        </select>
      </div>
      {!shown.length && <p class="empty-note">Onboarding calls appear here as people book them.</p>}
      {shown.map((s) => (
        <div class="cal-person-section" key={s.email}>
          <div class="cal-person-head">{s.name} <span class="cell-sub" style="display:inline;margin-left:8px;">{s.email}</span></div>
          {s.rows.map((m) => (
            <button type="button" class="cal-person-row" onClick={() => onSelect(m)}>
              <span class={m.startAt < now ? "cal-row-past" : ""}>{fmtTzTime(m.startAt, tz)}</span>
              <DriftBadge m={m} tz={tz} />
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

export function CalendarTab({ active }) {
  const [data, setData] = useState(null); // { meetings, timezone }
  const [view, setView] = useState("agenda");
  const [monthKey, setMonthKey] = useState(null);
  const [person, setPerson] = useState(null);
  const [selected, setSelected] = useState(null); // meeting id
  const [flash, setFlash] = useState(null); // what the last move or cancel did

  const reload = useCallback(async () => {
    const res = await api("/api/admin/meetings?all=1");
    setData(res);
  }, []);

  useEffect(() => { reload().catch(console.error); }, [reload]);

  const tz = data?.timezone ?? "America/Los_Angeles";

  // Initial state from the deep-link hash: #calendar/<view>/<param>.
  useEffect(() => {
    const parts = location.hash.replace("#", "").split("/");
    if (parts[0] !== "calendar") return;
    if (["user", "agenda", "month"].includes(parts[1])) setView(parts[1]);
    if (parts[1] === "month" && /^\d{4}-\d{2}$/.test(parts[2] ?? "")) setMonthKey(parts[2]);
    if (parts[1] === "user" && parts[2]) setPerson(decodeURIComponent(parts[2]));
  }, []);

  // The active tab owns the hash; index.jsx defers to this for calendar.
  useEffect(() => {
    if (!active) return;
    let hash = "#calendar/" + view;
    if (view === "month") hash += "/" + (monthKey ?? monthKeyOf(Date.now(), tz));
    if (view === "user" && person) hash += "/" + encodeURIComponent(person);
    history.replaceState(null, "", location.pathname + hash);
  }, [active, view, monthKey, person, tz]);

  const month = monthKey ?? monthKeyOf(Date.now(), tz);
  const meetings = data?.meetings ?? [];
  const byId = useMemo(() => new Map(meetings.map((m) => [m.id, m])), [meetings]);
  const events = useMemo(() => meetings.map((m) => ({
    id: m.id,
    summary: m.applicant ? m.applicant.name : "(unknown)",
    startAt: m.startAt,
    endAt: m.endAt,
    status: m.status === "cancelled" ? "cancelled" : "confirmed",
  })), [meetings]);
  const upcomingEvents = useMemo(() => {
    const cutoff = Date.now() - 3_600_000;
    return events.filter((e) => e.startAt >= cutoff && e.status !== "cancelled");
  }, [events]);

  const selectedMeeting = selected ? byId.get(selected) : null;
  const onSelect = (eventOrMeeting) => setSelected(eventOrMeeting.id);
  const monthTitle = new Date(anchorOf(month)).toLocaleDateString(undefined, {
    timeZone: "UTC", month: "long", year: "numeric",
  });

  return (
    <div class="card">
      <div class="card-label">Calendar</div>
      <div class="cal-controls">
        <div class="avail-days">
          {VIEWS.map(([key, label]) => (
            <button type="button" class="avail-day" aria-pressed={String(view === key)} onClick={() => { setView(key); setSelected(null); }}>
              {label}
            </button>
          ))}
        </div>
        {view === "month" && (
          <div class="avail-days">
            <button type="button" class="avail-day" aria-label="Previous month" onClick={() => setMonthKey(shiftMonth(month, -1))}>‹</button>
            <button type="button" class="avail-day" onClick={() => setMonthKey(monthKeyOf(Date.now(), tz))}>Today</button>
            <button type="button" class="avail-day" aria-label="Next month" onClick={() => setMonthKey(shiftMonth(month, 1))}>›</button>
            <span class="cal-month-title">{monthTitle}</span>
          </div>
        )}
      </div>
      <p class="empty-note" style="font-size:12px; margin-bottom:16px;">All times are shown in {tzShort(tz)} ({tz.replace(/_/g, " ")}).</p>

      {data === null ? (
        <div class="loading-note"><span class="spinner"></span> Loading the schedule…</div>
      ) : (
        <>
          <NeedsAttention meetings={meetings} tz={tz} onSelect={(m) => setSelected(m.id)} />
          {view === "month" && (
            <CalendarMonth
              events={events}
              date={anchorOf(month)}
              timezone={tz}
              maxEventsPerDay={3}
              onEventClick={onSelect}
            />
          )}
          {view === "agenda" && (
            <CalendarAgenda
              events={upcomingEvents}
              timezone={tz}
              emptyLabel="No upcoming onboarding calls. Booked times appear here; this database is the source of truth, and Google Calendar changes are flagged above instead of adopted."
              onEventClick={onSelect}
            />
          )}
          {view === "user" && (
            <ByUser meetings={meetings} tz={tz} person={person} onPerson={setPerson} onSelect={(m) => setSelected(m.id)} />
          )}
          {selectedMeeting && (
            <MeetingDetail
              m={selectedMeeting}
              tz={tz}
              onChanged={(message) => { setSelected(null); setFlash(message ?? null); reload().catch(console.error); }}
              onClose={() => setSelected(null)}
            />
          )}
          {flash && !selectedMeeting && <p class="resched-note" role="status">{flash}</p>}
        </>
      )}
    </div>
  );
}
