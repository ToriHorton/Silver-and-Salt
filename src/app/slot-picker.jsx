// Interim hand-rolled slot picker: day chips + a time grid over the class
// contract each page already styles (join: slot-*, admin reschedule:
// resched-*). One implementation now serves both; swaps for the @odla-ai/ui
// SlotPicker (UI-COMPONENT-SPECS.md) once salt-theme parity is confirmed.
import { useState, useMemo } from "preact/hooks";
import { groupSlotsByDay, dayLabel, timeLabel } from "./lib.js";

export function SlotPicker({ slots, timezone, classes, selectedStartAt, onPick, onDayChange }) {
  const byDay = useMemo(() => groupSlotsByDay(slots, timezone), [slots, timezone]);
  const dayKeys = [...byDay.keys()];
  const [activeDay, setActiveDay] = useState(dayKeys[0]);
  const day = byDay.has(activeDay) ? activeDay : dayKeys[0];

  return (
    <>
      <div class={classes.days}>
        {dayKeys.map((key) => (
          <button
            type="button"
            class={classes.day}
            aria-pressed={String(key === day)}
            onClick={() => { setActiveDay(key); onDayChange?.(); }}
          >
            {dayLabel(byDay.get(key)[0].startAt, timezone)}
          </button>
        ))}
      </div>
      <div class={classes.times}>
        {(byDay.get(day) || []).map((s) => (
          <button
            type="button"
            class={classes.time}
            aria-pressed={String(selectedStartAt === s.startAt)}
            onClick={() => onPick(s)}
          >
            {timeLabel(s.startAt, timezone)}
          </button>
        ))}
      </div>
    </>
  );
}
