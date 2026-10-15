// The Settings workspace with the open time report under the hours form
// (availability-report.jsx, Tori 2026-10-15). Chapter's own Settings tabs
// render unchanged; the report is added below them only while the Calendar
// tab is showing, which is the tab Chapter opens by default.
//
// When adopting a new Chapter version, compare the default-tab rule here with
// its SettingsWorkspace (dist chunk, "function SettingsWorkspace").

import { AvailabilityReport } from "./availability-report.jsx";

const OTHER_SETTINGS_VIEWS = ["email", "builder-library", "member-content"];

/** True when Chapter's Settings workspace is showing its Calendar tab. */
export const showsCalendar = (route) => !OTHER_SETTINGS_VIEWS.includes(route?.viewId);

// ChapterAdmin's `workspaces` transform: wrap the Settings render, keep the rest.
// Only the owner console's Settings has a Calendar tab (defaultViewId
// "calendar"); a leader console's Settings is left alone.
export function withAvailabilityReport() {
  return (defaults) =>
    defaults.map((w) => (w.id === "settings" && w.defaultViewId === "calendar"
      ? {
        ...w,
        render: (ctx) => (
          <>
            {w.render(ctx)}
            {showsCalendar(ctx.route) && <AvailabilityReport />}
          </>
        ),
      }
      : w));
}
