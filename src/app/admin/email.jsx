// Email Settings tab: delivery status (transport + verified from address),
// owner-editable destination addresses, the four templates with live
// previews, per-template send toggles and test sends, and the send audit.
import { useState, useEffect, useCallback } from "preact/hooks";
import { DataTable } from "@odla-ai/ui/components";
import { api, bus, TEMPLATE_META } from "../lib.js";

// Live previews render each template with sample applicant data exactly the
// way the worker renders real sends.
const SAMPLE = {
  firstName: "Martha", lastName: "Cannon",
  email: "martha@example.com", phone: "(801) 555-0100", state: "Utah",
};

function renderTpl(text, cfg, extra) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (k === "refundPolicyText") return cfg.refundPolicyText || "";
    if (k === "commitmentText") return extra.commitmentText;
    if (k === "normsText") return extra.normsText;
    if (k === "adminUrl") return location.origin + "/admin/?tab=people";
    if (k === "membersUrl") return location.origin + "/members/";
    return SAMPLE[k] ?? "{{" + k + "}}";
  });
}

function TemplateBlock({ key_, meta, tpl, cfg, extra, onChange }) {
  const [testNote, setTestNote] = useState(null);
  const [testing, setTesting] = useState(false);

  const sendTest = async () => {
    setTesting(true);
    setTestNote("Sending…");
    try {
      const r = await api("/api/admin/email/test", {
        method: "POST",
        body: JSON.stringify({ template: key_ }),
      });
      if (r.ok) {
        const dest = r.redirected && r.debugEmail ? `${r.debugEmail} (debug inbox)` : r.to;
        setTestNote(r.transport === "cloudflare" ? `Sent to ${dest}.` : "Logged only (delivery is off).");
      } else {
        setTestNote(`Send failed: ${r.reason || "unknown"}.`);
      }
    } catch (e) {
      console.error(e);
      setTestNote("Send failed.");
    } finally {
      setTesting(false);
      bus.dispatchEvent(new Event("emaillog:reload"));
    }
  };

  const toLabel = meta.audience === "notification"
    ? (cfg.notificationEmail || "(notification address)")
    : "martha@example.com (the applicant)";

  return (
    <div class="tpl-block">
      <label class="tpl-label">{meta.title} <span class="tpl-hint">(placeholders: {meta.hint})</span></label>
      <p class="empty-note" style="font-size:12px; margin-bottom:8px;">{meta.purpose}</p>
      <div class="tpl-actions">
        <label class="tpl-toggle">
          <input
            type="checkbox"
            checked={tpl.enabled !== false}
            onChange={(e) => onChange({ ...tpl, enabled: e.currentTarget.checked })}
          />{" "}
          Send automatically
        </label>
        <span>
          <button class="row-save" type="button" disabled={testing} onClick={sendTest}>Send me a test</button>
          {testNote && <span class="tpl-test-note" style="margin-left:8px;">{testNote}</span>}
        </span>
      </div>
      <input
        type="text"
        placeholder="Subject"
        value={tpl.subject}
        onInput={(e) => onChange({ ...tpl, subject: e.currentTarget.value })}
      />
      <textarea
        rows={6}
        value={tpl.text}
        onInput={(e) => onChange({ ...tpl, text: e.currentTarget.value })}
      />
      <div class="tpl-preview-label">Preview (sample applicant: Martha Cannon)</div>
      <div class="email-preview">
        <div class="email-meta">From: {cfg.name} &lt;{cfg.fromEmail || cfg.replyTo}&gt; &middot; Reply-to: {cfg.replyTo} &middot; To: {toLabel}</div>
        <div class="email-subject">{renderTpl(tpl.subject, cfg, extra) || "(no subject)"}</div>
        <div class="email-body">{renderTpl(tpl.text, cfg, extra) || "(no body)"}</div>
      </div>
    </div>
  );
}

// The send audit: everything the worker attempted, newest first. Test sends
// and failures appear too, so this table is the honest record.
const sendStatus = (s) =>
  s.error
    ? `Failed (${s.error})`
    : s.transport === "cloudflare"
      ? (s.redirected ? "Delivered (debug redirect)" : "Delivered")
      : "Logged, no delivery";

const SEND_COLUMNS = [
  {
    key: "when",
    header: "When",
    sortAs: "date",
    sortValue: (s) => s.sentAt,
    cell: (s) => new Date(s.sentAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  },
  {
    key: "template",
    header: "Email",
    sortAs: "string",
    sortValue: (s) => TEMPLATE_META[s.template]?.title || s.template,
    filterText: (s) => TEMPLATE_META[s.template]?.title || s.template,
    cell: (s) => TEMPLATE_META[s.template]?.title || s.template,
  },
  {
    key: "to",
    header: "To",
    sortAs: "string",
    sortValue: (s) => s.to,
    filterText: (s) => s.to,
    cell: (s) => s.to,
  },
  {
    key: "subject",
    header: "Subject",
    filterText: (s) => s.subject,
    cell: (s) => s.subject,
  },
  {
    key: "status",
    header: "Status",
    sortAs: "string",
    sortValue: sendStatus,
    filterText: sendStatus,
    cell: (s) => <span class={"send-status " + (s.error ? "fail" : "ok")}>{sendStatus(s)}</span>,
  },
];

function RecentSends() {
  const [sends, setSends] = useState(null);

  const reload = useCallback(() => {
    api("/api/admin/email/log")
      .then((r) => setSends(r.sends))
      .catch((e) => { console.error(e); setSends([]); });
  }, []);

  useEffect(() => {
    reload();
    bus.addEventListener("emaillog:reload", reload);
    return () => bus.removeEventListener("emaillog:reload", reload);
  }, [reload]);

  return (
    <div class="card">
      <div class="card-label">Recent Sends</div>
      <DataTable
        rows={sends ?? []}
        columns={SEND_COLUMNS}
        rowKey={(s) => s.id}
        filterable
        filterPlaceholder="Filter by template, address, or status…"
        defaultSort={{ key: "when", dir: "desc" }}
        loading={sends === null}
        loadingState={<div class="loading-note"><span class="spinner"></span> Loading recent sends…</div>}
        emptyState={<p class="empty-note">Every send the system attempts appears here, including test sends and anything that failed.</p>}
        ariaLabel="Recent sends"
      />
    </div>
  );
}

export function EmailTab() {
  const [cfg, setCfg] = useState(null); // server config; null = loading
  const [templates, setTemplates] = useState({});
  const [commitmentText, setCommitmentText] = useState("");
  const [normsText, setNormsText] = useState("");
  const [notificationEmail, setNotificationEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [debugEmail, setDebugEmail] = useState("");
  const [saveLabel, setSaveLabel] = useState("Save email settings");
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState(null);

  useEffect(() => {
    api("/api/admin/group/email")
      .then((c) => {
        setCfg(c);
        setTemplates(c.emailTemplates);
        setCommitmentText(c.commitmentText);
        setNormsText(c.normsText);
        setNotificationEmail(c.notificationEmail || "");
        setReplyTo(c.replyTo || "");
        setDebugEmail(c.debugEmail || "");
      })
      .catch(console.error);
  }, []);

  const save = async () => {
    setSaving(true);
    setSaveLabel("Saving…");
    setSaveNote(null);
    try {
      await api("/api/admin/group/email", {
        method: "PUT",
        body: JSON.stringify({
          emailTemplates: templates,
          commitmentText,
          normsText,
          notificationEmail,
          replyTo,
          debugEmail,
        }),
      });
      setSaveNote("Saved.");
    } catch (e) {
      console.error(e);
      setSaveNote("Save failed. Check every template has a single-line subject and a body.");
    } finally {
      setSaving(false);
      setSaveLabel("Save email settings");
    }
  };

  // Delivery status: the transport and verified from address are set per
  // environment in wrangler.jsonc, so they read as facts here.
  let deliveryNote = null;
  if (cfg) {
    if (cfg.transport === "cloudflare") {
      deliveryNote = `Delivery is on through Cloudflare Email Service. Messages send from ${cfg.name} <${cfg.fromEmail}>; replies go to the reply-to address.`;
      if (cfg.envName !== "prod") {
        deliveryNote += debugEmail
          ? ' This is the dev environment: every send redirects to the debug inbox with a "[dev]" subject prefix.'
          : " This is the dev environment: with no debug inbox set, sends are recorded under Recent Sends and nothing is delivered.";
      }
    } else {
      deliveryNote = "Delivery is off. Sends are recorded under Recent Sends and nothing is delivered. Deploying the worker with its send_email binding and EMAIL_FROM address turns delivery on.";
    }
  }

  const liveCfg = cfg && { ...cfg, notificationEmail, replyTo };
  const extra = { commitmentText, normsText };

  return (
    <>
      <div class="card">
        <div class="card-label">Email Delivery</div>
        <p class="empty-note" style="margin-bottom: 18px;">
          {cfg === null ? <><span class="spinner"></span> Checking delivery…</> : deliveryNote}
        </p>
        <div class="avail-grid" style="margin-bottom: 4px;">
          <div class="tpl-block">
            <label class="tpl-label" for="dest-notification">Notification address <span class="tpl-hint">(admin alerts, like new paid applications)</span></label>
            <input type="text" id="dest-notification" value={notificationEmail} onInput={(e) => setNotificationEmail(e.currentTarget.value)} />
          </div>
          <div class="tpl-block">
            <label class="tpl-label" for="dest-replyto">Reply-to address <span class="tpl-hint">(replies to any system email land here)</span></label>
            <input type="text" id="dest-replyto" value={replyTo} onInput={(e) => setReplyTo(e.currentTarget.value)} />
          </div>
          <div class="tpl-block">
            <label class="tpl-label" for="dest-debug">Debug inbox <span class="tpl-hint">(dev only: every send redirects here)</span></label>
            <input type="text" id="dest-debug" value={debugEmail} onInput={(e) => setDebugEmail(e.currentTarget.value)} />
          </div>
        </div>
        <p class="empty-note" style="font-size: 12px;">Address changes apply when you press "Save email settings" below.</p>
      </div>

      <div class="card">
        <div class="card-label">Email Templates</div>
        <p class="empty-note" style="margin-bottom: 18px;">These are the emails the system sends, each tied to the moment listed with it. Curly placeholders like {"{{firstName}}"} fill in per applicant when a message goes out. Unchecking "Send automatically" keeps the moment silent until you turn it back on; "Send me a test" delivers a sample to your own inbox.</p>
        {cfg === null ? (
          <div class="loading-note"><span class="spinner"></span> Loading email templates…</div>
        ) : (
          <>
            {Object.entries(TEMPLATE_META).map(([key, meta]) => (
              <TemplateBlock
                key={key}
                key_={key}
                meta={meta}
                tpl={templates[key] || { subject: "", text: "", enabled: true }}
                cfg={liveCfg}
                extra={extra}
                onChange={(t) => setTemplates({ ...templates, [key]: t })}
              />
            ))}
            <div class="tpl-block">
              <label class="tpl-label" for="commitment-text">Community commitment <span class="tpl-hint">(embedded in the pre-meeting email as {"{{commitmentText}}"})</span></label>
              <textarea id="commitment-text" rows={4} value={commitmentText} onInput={(e) => setCommitmentText(e.currentTarget.value)} />
            </div>
            <div class="tpl-block">
              <label class="tpl-label" for="norms-text">Group norms <span class="tpl-hint">(embedded in the pre-meeting email as {"{{normsText}}"})</span></label>
              <textarea id="norms-text" rows={4} value={normsText} onInput={(e) => setNormsText(e.currentTarget.value)} />
            </div>
            <button class="row-save" id="email-save" style="padding: 10px 22px;" disabled={saving} onClick={save}>{saveLabel}</button>
            {saveNote && <span class="empty-note" style="margin-left: 10px;">{saveNote}</span>}
          </>
        )}
      </div>

      <RecentSends />
    </>
  );
}
