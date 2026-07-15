// Introduction Calls tab: canonical meetings with drift flags against
// Google (flagged, never auto-adopted), inline reschedule, and cancel.
import { useState, useEffect, useCallback } from "preact/hooks";
import { api, bus, fmtTzTime, tzShort } from "../lib.js";
import { SlotPicker } from "../slot-picker.jsx";

const linkStyle = "font-size:12px;color:var(--lime-dark);font-weight:700;text-decoration:none;";

// Inline reschedule: expands a compact slot picker under the meeting row;
// picking a time moves the Google event and updates our record.
function ReschedRow({ meeting, onPicked }) {
  const [state, setState] = useState({ phase: "loading" });

  useEffect(() => {
    api("/api/schedule/slots")
      .then((data) => {
        if (!data.schedulingReady || !data.slots.length) {
          setState({ phase: "none" });
        } else {
          setState({ phase: "ready", slots: data.slots, timezone: data.timezone });
        }
      })
      .catch((e) => { console.error(e); setState({ phase: "error" }); });
  }, [meeting.id]);

  return (
    <tr class="resched-row">
      <td colSpan={5} class="resched-cell">
        {state.phase === "loading" && (
          <div class="loading-note"><span class="spinner"></span> Loading open times…</div>
        )}
        {state.phase === "none" && <p class="resched-note">No open times are available right now.</p>}
        {state.phase === "error" && <p class="resched-note">Open times could not be loaded. Try again.</p>}
        {state.phase === "ready" && (
          <>
            <SlotPicker
              slots={state.slots}
              timezone={state.timezone}
              classes={{ days: "resched-days", day: "resched-day", times: "resched-times", time: "resched-time" }}
              onPick={(s) => onPicked(s, state.timezone)}
            />
            <p class="resched-note">
              {meeting.reschedNote ||
                "Times shown in " + tzShort(state.timezone) + ". Pick a new time; the guest is notified by Google and the video link stays the same."}
            </p>
          </>
        )}
      </td>
    </tr>
  );
}

export function CallsTab() {
  const [meetings, setMeetings] = useState(null); // null = loading
  const [tz, setTz] = useState("America/Los_Angeles");
  const [reschedFor, setReschedFor] = useState(null); // meeting id
  const [reschedNote, setReschedNote] = useState(null);

  const reload = useCallback(async () => {
    const res = await api("/api/admin/meetings");
    if (res.timezone) setTz(res.timezone);
    setMeetings(res.meetings);
  }, []);

  useEffect(() => { reload().catch(console.error); }, [reload]);

  const cancelMeeting = async (m) => {
    const sure = confirm("Cancel this introduction call? The Google event is removed and the guest is notified.");
    if (!sure) return;
    try {
      await api(`/api/admin/meetings/${m.id}/cancel`, { method: "POST", body: "{}" });
      await reload();
      bus.dispatchEvent(new Event("people:reload"));
    } catch (e) {
      console.error(e);
    }
  };

  // Optimistic: the row shows the new time immediately; a failure rolls it
  // back and reopens the choice with a note.
  const reschedule = async (m, slot) => {
    const oldStart = m.startAt;
    setMeetings((ms) => ms.map((x) => (x.id === m.id ? { ...x, startAt: slot.startAt } : x)));
    setReschedFor(null);
    setReschedNote(null);
    try {
      await api(`/api/admin/meetings/${m.id}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ startAt: slot.startAt }),
      });
      bus.dispatchEvent(new Event("people:reload"));
    } catch (e) {
      console.error(e);
      setMeetings((ms) => ms.map((x) => (x.id === m.id ? { ...x, startAt: oldStart } : x)));
      setReschedNote("That time could not be booked (it may have just been taken). Pick another.");
      setReschedFor(m.id);
    }
  };

  return (
    <div class="card">
      <div class="card-label">Introduction Calls</div>
      <div class="table-wrap">
        <table id="meetings-table">
          <thead>
            <tr><th>When</th><th>Applicant</th><th>Video call</th><th>Google</th><th></th></tr>
          </thead>
          <tbody>
            {meetings === null && (
              <tr><td colSpan={5}><div class="loading-note"><span class="spinner"></span> Loading introduction calls…</div></td></tr>
            )}
            {meetings?.map((m) => (
              <>
                <tr key={m.id}>
                  <td class="person">{fmtTzTime(m.startAt, tz)}</td>
                  <td class="person">
                    {m.applicant ? m.applicant.name : "(unknown)"}
                    {m.applicant && <span class="cell-sub">{m.applicant.email}</span>}
                  </td>
                  <td>
                    {m.meetUrl && (
                      <a href={m.meetUrl} target="_blank" rel="noopener" style={linkStyle}>Meet link</a>
                    )}
                  </td>
                  <td>
                    {m.status === "cancelled" ? (
                      <span class="pay-badge unpaid">Cancelled</span>
                    ) : m.drift === "time_changed" ? (
                      <>
                        <span class="pay-badge refunded" title="Google Calendar shows a different time than this database. Rebook from the join flow or cancel.">Moved in Google</span>
                        <span class="cell-sub">
                          Google shows {m.driftGoogleStartAt ? fmtTzTime(m.driftGoogleStartAt, tz) : "a different time"}
                        </span>
                      </>
                    ) : m.drift === "gone_from_google" ? (
                      <span class="pay-badge refunded" title="The Google event is gone but this booking still stands here.">Removed in Google</span>
                    ) : (
                      <>
                        <span class="pay-badge paid">In sync</span>
                        {m.adoptedFromGoogleAt && Date.now() - m.adoptedFromGoogleAt < 7 * 86400000 && (
                          <span class="cell-sub">updated from Google {new Date(m.adoptedFromGoogleAt).toLocaleDateString()}</span>
                        )}
                      </>
                    )}
                    {m.htmlLink && (
                      <span class="cell-sub">
                        <a href={m.htmlLink} target="_blank" rel="noopener" style="color:var(--lime-dark);font-weight:700;text-decoration:none;">open in Google Calendar</a>
                      </span>
                    )}
                  </td>
                  <td>
                    {m.status === "scheduled" && (
                      <>
                        <button
                          class="row-save row-approve"
                          onClick={() => {
                            setReschedNote(null);
                            setReschedFor(reschedFor === m.id ? null : m.id);
                          }}
                        >
                          Reschedule
                        </button>
                        <button class="row-save row-refund" style="margin-left:6px;" onClick={() => cancelMeeting(m)}>
                          Cancel
                        </button>
                      </>
                    )}
                  </td>
                </tr>
                {reschedFor === m.id && (
                  <ReschedRow
                    meeting={{ ...m, reschedNote }}
                    onPicked={(slot) => reschedule(m, slot)}
                  />
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      {meetings && !meetings.length && (
        <p class="empty-note">Booked introduction calls appear here. This database is the source of truth; if someone moves or removes the event in Google Calendar, a flag appears instead of the change being adopted.</p>
      )}
    </div>
  );
}
