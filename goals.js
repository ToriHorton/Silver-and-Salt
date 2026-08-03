// Silver & Salt Capital — quarterly goals feed for the dashboard.
// This is the copy the DAILY AGENT reads (via goals.json, which mirrors it).
// The dashboard seeds from this on a fresh browser, then Tori edits goals in the
// UI. When her edits differ from this file the dashboard shows a "not yet synced"
// notice, because the agent runs on the Mac and cannot see browser storage.
// To sync: click "Copy goals for sync" in the dashboard and ask Claude to update
// goals.js and goals.json.
window.SSC_GOALS = {
  generated: "",
  quarters: {}
};
