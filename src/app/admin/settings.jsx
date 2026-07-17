// Settings tab: sub-tabs for the different kinds of settings. Calendar (call
// availability / booking rules) and Email (delivery + templates) today; add
// more entries to SETTINGS_TABS as new settings areas arrive.
import { useState } from "preact/hooks";
import { AvailabilityTab } from "./availability.jsx";
import { EmailTab } from "./email.jsx";

const SETTINGS_TABS = [
  ["calendar", "Calendar"],
  ["email", "Email"],
];

export function SettingsTab() {
  const [sub, setSub] = useState("calendar");
  return (
    <>
      <div class="rec-tabs settings-tabs">
        {SETTINGS_TABS.map(([key, label]) => (
          <button
            type="button"
            class={"rec-tab" + (sub === key ? " on" : "")}
            onClick={() => setSub(key)}
          >{label}</button>
        ))}
      </div>
      {sub === "calendar" && <AvailabilityTab />}
      {sub === "email" && <EmailTab />}
    </>
  );
}
