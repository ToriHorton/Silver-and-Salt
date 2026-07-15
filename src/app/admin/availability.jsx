// Call Settings tab: the group scheduling rules that shape offered slots.
import { useState, useEffect } from "preact/hooks";
import { api, DAY_NAMES } from "../lib.js";

const hourLabel = (h) => new Date(2026, 0, 5, h).toLocaleTimeString(undefined, { hour: "numeric" });

export function AvailabilityTab() {
  const [s, setS] = useState(null); // scheduling settings; null = loading
  const [saveLabel, setSaveLabel] = useState("Save availability");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => {
    api("/api/admin/group/scheduling")
      .then(({ scheduling }) => setS(scheduling))
      .catch(console.error);
  }, []);

  const save = async () => {
    setSaving(true);
    setSaveLabel("Saving…");
    setNote(null);
    try {
      await api("/api/admin/group/scheduling", {
        method: "PUT",
        body: JSON.stringify({ scheduling: {
          days: s.days,
          startHour: Number(s.startHour),
          endHour: Number(s.endHour),
          slotMinutes: Number(s.slotMinutes),
          timezone: s.timezone,
          minNoticeHours: Number(s.minNoticeHours),
          windowDays: Number(s.windowDays),
        }}),
      });
      setNote("Saved. New bookings offer these times.");
    } catch (e) {
      console.error(e);
      setNote("Save failed: check the values.");
    } finally {
      setSaving(false);
      setSaveLabel("Save availability");
    }
  };

  return (
    <div class="card">
      <div class="card-label">Availability</div>
      <p class="empty-note" style="margin-bottom: 16px;">The times offered for introduction calls. Booked slots and everything already on the connected calendar stay unavailable automatically.</p>
      {s === null ? (
        <div class="loading-note"><span class="spinner"></span> Loading…</div>
      ) : (
        <>
          <div class="avail-grid" id="avail-form">
            <div class="tpl-block">
              <label class="tpl-label">Days</label>
              <div id="avail-days" class="avail-days">
                {DAY_NAMES.map((name, d) => (
                  <button
                    type="button"
                    class="avail-day"
                    aria-pressed={String(s.days.includes(d))}
                    onClick={() => setS({
                      ...s,
                      days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d].sort(),
                    })}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div class="tpl-block">
              <label class="tpl-label" for="avail-start">Between</label>
              <select id="avail-start" value={String(s.startHour)} onChange={(e) => setS({ ...s, startHour: e.currentTarget.value })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option value={String(h)}>{hourLabel(h)}</option>
                ))}
              </select>
              <label class="tpl-label" for="avail-end" style="margin-top:8px;">and</label>
              <select id="avail-end" value={String(s.endHour)} onChange={(e) => setS({ ...s, endHour: e.currentTarget.value })}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                  <option value={String(h)}>{h === 24 ? "midnight" : hourLabel(h)}</option>
                ))}
              </select>
            </div>
            <div class="tpl-block">
              <label class="tpl-label" for="avail-slot">Call length</label>
              <select id="avail-slot" value={String(s.slotMinutes)} onChange={(e) => setS({ ...s, slotMinutes: e.currentTarget.value })}>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
              </select>
              <label class="tpl-label" for="avail-tz" style="margin-top:8px;">Timezone</label>
              <select id="avail-tz" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.currentTarget.value })}>
                <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
                <option value="America/Denver">Mountain (Denver)</option>
                <option value="America/Chicago">Central (Chicago)</option>
                <option value="America/New_York">Eastern (New York)</option>
              </select>
            </div>
            <div class="tpl-block">
              <label class="tpl-label" for="avail-notice">Minimum notice (hours)</label>
              <input type="number" id="avail-notice" min="0" max="336" value={s.minNoticeHours} onInput={(e) => setS({ ...s, minNoticeHours: e.currentTarget.value })} />
              <label class="tpl-label" for="avail-window" style="margin-top:8px;">Booking window (days)</label>
              <input type="number" id="avail-window" min="1" max="62" value={s.windowDays} onInput={(e) => setS({ ...s, windowDays: e.currentTarget.value })} />
            </div>
          </div>
          <button class="row-save" id="avail-save" style="padding: 10px 22px;" disabled={saving} onClick={save}>{saveLabel}</button>
          {note && <span class="empty-note" style="margin-left: 10px;">{note}</span>}
        </>
      )}
    </div>
  );
}
