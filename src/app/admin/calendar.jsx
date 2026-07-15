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
  return <span class="pay-badge paid">In sync</span>;
}

// Detail and actions for one selected meeting; mirrors the Introduction
// Calls table's Reschedule (shared SlotPicker) and Cancel semantics.
function MeetingDetail({ m, tz, onChanged, onClose }) {
  const [resched, setResched] = useState(false);
  const [slotState, setSlotState] = useState(null);
  const [note, setNote] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setResched(false);
    setSlotState(null);
    setNote(null);
  }, [m.id]);

  const openResched = async () => {
    setResched(true);
    setSlotState(null);
    try {
      const data = await api("/api/schedule/slots");
      if (!data.schedulingReady || !data.slots.length) {
        setSlotState({ phase: "none" });
      } else {
        setSlotState({ phase: "ready", slots: data.slots, timezone: data.timezone });
      }
    } catch (e) {
      console.error(e);
      setSlotState({ phase: "error" });
    }
  };

  const pick = async (slot) => {
    setWorking(true);
    try {
      await api(`/api/admin/meetings/${m.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ startAt: slot.startAt }),
      });
      bus.dispatchEvent(new Event("people:reload"));
      onChanged();
    } catch (e) {
      console.error(e);
      setNote("That time could not be booked (it may have just been taken). Pick another.");
    } finally {
      setWorking(false);
    }
  };

  const cancel = async () => {
    const sure = confirm("Cancel this introduction call? The Google event is removed and the guest is notified.");
    if (!sure) return;
    setWorking(true);
    try {
      await api(`/api/admin/meetings/${m.id}/cancel`, { method: "POST", body: "{}" });
      bus.dispatchEvent(new Event("people:reload"));
      onChanged();
    } catch (e) {
      console.error(e);
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
      {m.status === "scheduled" && (
        <div class="row-actions" style="margin-top: 12px;">
          <button class="row-save row-approve" disabled={working} onClick={openResched}>Reschedule</button>
          <button class="row-save row-refund" disabled={working} onClick={cancel}>Cancel call</button>
        </div>
      )}
      {resched && (
        <div class="resched-cell" style="margin-top: 12px;">
          {slotState === null && <div class="loading-note"><span class="spinner"></span> Loading open times…</div>}
          {slotState?.phase === "none" && <p class="resched-note">No open times are available right now.</p>}
          {slotState?.phase === "error" && <p class="resched-note">Open times could not be loaded. Try again.</p>}
          {slotState?.phase === "ready" && (
            <>
              <SlotPicker
                slots={slotState.slots}
                timezone={slotState.timezone}
                classes={{ days: "resched-days", day: "resched-day", times: "resched-times", time: "resched-time" }}
                onPick={pick}
              />
              <p class="resched-note">
                {note || "Times shown in " + tzShort(slotState.timezone) + ". Pick a new time; the guest is notified by Google and the video link stays the same."}
              </p>
            </>
          )}
        </div>
      )}
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
      {!shown.length && <p class="empty-note">Introduction calls appear here as people book them.</p>}
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
              emptyLabel="No upcoming introduction calls. Booked times appear here."
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
              onChanged={() => { setSelected(null); reload().catch(console.error); }}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
