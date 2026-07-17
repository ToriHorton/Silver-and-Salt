// Settings tab: the call (availability) settings and the email settings,
// merged into one place. Each sub-component renders its own labelled cards.
import { AvailabilityTab } from "./availability.jsx";
import { EmailTab } from "./email.jsx";

export function SettingsTab() {
  return (
    <>
      <AvailabilityTab />
      <EmailTab />
    </>
  );
}
