// Join page booking island: the step 2 slot picker. The rest of join.html
// (form, payment step) stays vanilla; the page talks to this island through
// window.SSCJoinPicker.load({ getApplicationId, onBooked }). A shim in the
// page queues a load() call made before this module finishes loading.
//
// Availability comes from our backend; booking writes our database and
// exports a Google event that carries the invitation and Meet link.
import { render } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { fullLabel, tzShort } from "./lib.js";
import { SlotPicker } from "./slot-picker.jsx";

const UNAVAILABLE = "Scheduling is briefly unavailable. We will reach out by email to arrange your conversation.";
const ALL_TAKEN = "Every time in the current window is taken. Please check back soon, or reply to your confirmation email.";

function PickerApp({ getApplicationId, onBooked }) {
  const [state, setState] = useState({ phase: "loading" });
  const [selected, setSelected] = useState(null);
  const [booking, setBooking] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    setSelected(null);
    try {
      const res = await fetch("/api/schedule/slots");
      const data = await res.json();
      if (!data.schedulingReady) {
        setState({ phase: "message", message: UNAVAILABLE });
        return;
      }
      const slots = data.slots || [];
      const tzNote = document.getElementById("slot-tz-note");
      if (tzNote) {
        tzNote.textContent = data.timezone
          ? "All times are shown in " + tzShort(data.timezone) + " (" + data.timezone.replace(/_/g, " ") + ")."
          : "";
      }
      if (!slots.length) {
        setState({ phase: "message", message: ALL_TAKEN });
        return;
      }
      setState({ phase: "ready", slots, timezone: data.timezone });
    } catch (err) {
      console.error(err);
      setState({ phase: "message", message: UNAVAILABLE });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const book = async () => {
    const applicationId = getApplicationId();
    if (!selected || !applicationId) return;
    setBooking(true);
    try {
      const res = await fetch("/api/schedule/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, startAt: selected.startAt }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === "calendar_slot_unavailable") {
        setNote("That time was just taken. Here are the current openings.");
        await load();
        return;
      }
      if (!res.ok) throw new Error(data.error || "booking failed");
      onBooked({ ...data, timezone: state.timezone });
    } catch (err) {
      console.error(err);
      setNote("The booking could not be completed. Please try again.");
    } finally {
      setBooking(false);
    }
  };

  if (state.phase === "loading") {
    return <p class="slots-status"><span class="spinner"></span> Loading available times…</p>;
  }
  if (state.phase === "message") {
    return <p class="slots-status">{state.message}</p>;
  }
  return (
    <>
      <SlotPicker
        slots={state.slots}
        timezone={state.timezone}
        classes={{ days: "slot-days", day: "slot-day", times: "slot-grid", time: "slot-time" }}
        selectedStartAt={selected?.startAt}
        onPick={(s) => { setSelected(s); setNote(fullLabel(s.startAt, state.timezone)); }}
        onDayChange={() => setSelected(null)}
      />
      <div class="slot-confirm" hidden={!selected}>
        <button class="submit-btn" id="book-btn" disabled={booking} onClick={book}>
          {booking ? "Booking…" : "Book this time"}
        </button>
        <p class="step2-note">{note}</p>
      </div>
    </>
  );
}

const real = {
  load(opts) {
    const root = document.getElementById("join-picker-root");
    render(<PickerApp getApplicationId={opts.getApplicationId} onBooked={opts.onBooked} />, root);
  },
};

// Replace the page's shim; run any load() queued before the module loaded.
const pending = window.SSCJoinPicker && window.SSCJoinPicker._pending;
window.SSCJoinPicker = real;
if (pending) real.load(pending);
