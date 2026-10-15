// "Pick a new time" on the join confirmation screen (Tori, 2026-10-14: offer a
// rebooking the day before, for anyone who is going to miss the call).
//
// The day-before reminder links to /join?application=<id>. Chapter's resume
// answers "done" with the booked time, and this lets the applicant move it
// without signing in: POST /api/schedule/book with a call already scheduled
// moves the same Google event (same video link) instead of booking a second
// one. The application id is the credential, exactly as in the join flow and
// the member area's Rescheduler.
import { useState } from "preact/hooks";
import { SlotPicker } from "./slot-picker.jsx";

const CLASSES = { days: "slot-days", day: "slot-day", times: "slot-grid", time: "slot-time" };

async function call(path, init) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export function ChangeTime({ applicationId, onMoved, fetcher = call }) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState(null);
  const [tz, setTz] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const start = async () => {
    setOpen(true); setSlots(null); setMsg(null);
    try {
      const r = await fetcher("/api/schedule/slots");
      setSlots(r.slots || []);
      if (r.timezone) setTz(r.timezone);
    } catch {
      setSlots([]);
      setMsg("Times are briefly unavailable. Please try again in a moment.");
    }
  };
  const pick = async (slot) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetcher("/api/schedule/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, startAt: slot.startAt }),
      });
      setOpen(false);
      onMoved({ startAt: r.startAt ?? slot.startAt, timezone: tz });
    } catch {
      setMsg("That time was just taken. Please pick another.");
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <p class="step3-body" id="change-time">
        Need a different time? <a href="#" class="step3-link" onClick={(e) => { e.preventDefault(); start(); }}>Pick a new one</a>
      </p>
    );
  }
  return (
    <div class="change-time" id="change-time">
      {slots === null ? (
        <p class="step3-body">Loading open times…</p>
      ) : !slots.length ? (
        <p class="step3-body">No open times right now. Please check back soon.</p>
      ) : (
        <SlotPicker slots={slots} timezone={tz} classes={CLASSES} onPick={pick} />
      )}
      {busy && <p class="step3-body">Moving your call…</p>}
      {msg && <p class="step3-body" role="alert">{msg}</p>}
      <p class="step3-body">
        <a href="#" class="step3-link" onClick={(e) => { e.preventDefault(); setOpen(false); }}>Keep my current time</a>
      </p>
    </div>
  );
}
