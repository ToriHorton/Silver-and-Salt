// The Calls tab on a person in the admin console (Tori, 2026-09-24).
//
// Every recorded call with this person, newest first: when it happened, the
// Granola summary, and a link out to the full transcript. Calls are written by
// the ingest (src/crm-ingest.mjs) as call/meeting activities whose body is a
// label line ("Pre-call: <title>" or "Member call: <title>") followed by the
// summary, so the two are split apart here for display.
//
// This first shipped in people-crm.jsx, which the live console stopped
// importing when <ChapterAdmin/> took over on 2026-07-25, so it never showed.
// It now rides Chapter's own extendRecordTabs seam (see index.jsx).

import { useEffect, useState } from "preact/hooks";

// Insert the Calls tab between Billing and Notes on person records. Where a
// record has no Billing tab it lands just before Notes, and failing that last.
export function withCallsTab(tabs, context) {
  if (context.type !== "person") return tabs;
  const calls = {
    id: "calls",
    label: "Calls",
    panel: <CallLog client={context.client} recordId={context.detail.record.id} />,
  };
  const out = [...tabs];
  const billing = out.findIndex((t) => t.id === "billing");
  const notes = out.findIndex((t) => t.id === "notes");
  const at = billing >= 0 ? billing + 1 : notes >= 0 ? notes : out.length;
  out.splice(at, 0, calls);
  return out;
}

function CallLog({ client, recordId }) {
  const [state, setState] = useState({ loading: true, calls: [], error: null });

  useEffect(() => {
    let live = true;
    setState({ loading: true, calls: [], error: null });
    client
      .listActivities(recordId, { limit: 500 })
      .then(({ activities }) => {
        if (!live) return;
        const calls = (activities || [])
          .filter((a) => a.kind === "call" || a.kind === "meeting")
          .sort((a, b) => callAt(b) - callAt(a));
        setState({ loading: false, calls, error: null });
      })
      .catch((err) => live && setState({ loading: false, calls: [], error: err }));
    return () => {
      live = false;
    };
  }, [client, recordId]);

  if (state.loading) return <div class="rec-empty">Loading calls…</div>;
  if (state.error) return <div class="rec-empty">Calls could not be loaded. Refresh to try again.</div>;
  if (!state.calls.length) return <div class="rec-empty">No calls recorded yet.</div>;

  return (
    <div class="rec-calls">
      {state.calls.map((a) => {
        const meta = readMeta(a);
        const [head, ...rest] = String(a.body || "").split("\n\n");
        const summary = rest.join("\n\n").trim();
        const m = /^(Pre-call|Member call):\s*(.*)$/.exec(head || "");
        const label = m ? m[1] : null;
        const title = m ? m[2] : head;
        return (
          <div class="rec-call" key={a.id}>
            <div class="rec-call-head">
              <span class="rec-call-when">{formatWhen(callAt(a))}</span>
              {label && <span class="crm-stage-chip">{label}</span>}
            </div>
            <div class="rec-call-title">{title}</div>
            {summary && <pre class="rec-call-summary">{summary}</pre>}
            {meta.url && (
              <a class="rec-call-link" href={meta.url} target="_blank" rel="noopener noreferrer">
                View the full transcript in Granola
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

// meta may arrive as a JSON string or an object; a malformed row must not
// blank the tab.
function readMeta(a) {
  try {
    const m = typeof a.meta === "string" ? JSON.parse(a.meta) : a.meta;
    return m && typeof m === "object" ? m : {};
  } catch {
    return {};
  }
}

// When the call happened, falling back to when it was recorded.
function callAt(a) {
  const at = readMeta(a).occurredAt;
  if (typeof at === "number" && Number.isFinite(at)) return at;
  const created = typeof a.createdAt === "number" ? a.createdAt : Date.parse(a.createdAt);
  return Number.isFinite(created) ? created : 0;
}

// Shown in Mountain Time, where the community is.
function formatWhen(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
