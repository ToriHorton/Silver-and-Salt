// Silver & Salt Capital — quarterly goals feed for the dashboard.
// This is the copy the DAILY AGENT reads (via goals.json, which mirrors it).
// The dashboard seeds from this on a fresh browser, then Tori edits goals in the
// UI. When her edits differ from this file the dashboard shows a "not yet synced"
// notice, because the agent runs on the Mac and cannot see browser storage.
// To sync: click "Copy goals for sync" in the dashboard and ask Claude to update
// goals.js and goals.json.
window.SSC_GOALS = {
  generated: "2026-08-03",
  quarters: {
    "2026-Q3": [
      {
        id: "xmsdpymks9ymd",
        text: "Begin taking membership payment",
        note: "Working signup flow and payment process with the first 20 people signed up"
      }
    ]
  }
};
