import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Mail, Send, Square } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { linesFor, unwrap, useData } from "@/lib/DataContext";
import { useCompanyProfile } from "@/lib/useCompanyProfile";
import { useMembers } from "@/components/lcri/useMembers";
import { useSender } from "@/components/lcri/useSender";
import { notify } from "@/components/lcri/notify";
import {
  EMAIL_KINDS, REPORT_TYPES, assignmentEmail, isEmail, noticeEmail, parseEmails, planAssignments, planNotices, reportEmail, stateEmail, textToBase64,
} from "@/lib/email";
import { complianceReport } from "@/lib/compliance";
import { letterhead, replacementPlan, systemReport } from "@/lib/report";
import { fmt, readyToFile, stateCsv, todayIso } from "@/lib/lcri";
import { statesOf } from "@/lib/filters";

const APP_URL = typeof window !== "undefined" ? window.location.origin : "https://app.linetally.com";

async function pdfAttachment(report) {
  const { renderReportPdf } = await import("@/lib/report-pdf");
  const doc = await renderReportPdf(report);
  return { filename: report.filename, content: doc.output("datauristring").split(",")[1] };
}

function Preview({ message }) {
  if (!message) return null;
  return (
    <div className="email-preview">
      <div className="email-meta">
        <div><span className="muted">To</span> {message.to || "—"}</div>
        <div><span className="muted">Subject</span> <b>{message.subject}</b></div>
        {message.files?.length > 0 && <div><span className="muted">Attached</span> {message.files.join(", ")}</div>}
      </div>
      <iframe title="Email preview" sandbox="" srcDoc={message.html} />
    </div>
  );
}

function Progress({ sender, noun }) {
  const s = sender.state;
  if (!s) return null;
  const failures = s.results.filter((r) => !r.ok);
  return (
    <div className={`send-progress${s.limited ? " send-progress--warn" : ""}`} role="status" aria-live="polite">
      <div className="send-bar"><i style={{ width: `${s.total ? (s.done / s.total) * 100 : 0}%` }} /></div>
      <div className="send-line">
        <span>
          {s.running ? `Sending ${s.done + 1} of ${s.total}…` : `${fmt(s.sent)} ${s.sent === 1 ? noun.replace(/s$/, "") : noun} sent${s.failed ? `, ${fmt(s.failed)} failed` : ""}${s.stopped && s.done < s.total ? `, ${fmt(s.total - s.done)} not sent` : ""}.`}
        </span>
        {s.running && <button type="button" className="btn btn--sm" onClick={sender.stop}><Square size={12} /> Stop</button>}
        {!s.running && <button type="button" className="btn btn--sm btn--ghost" onClick={sender.reset}>Done</button>}
      </div>
      {s.limited && <p className="note">Base44&apos;s sending limit was reached, so the rest were held back. Send them again later; anything already sent shows in History.</p>}
      {failures.length > 0 && (
        <details>
          <summary>{failures.length} failed</summary>
          <ul>{failures.slice(0, 30).map((f, i) => <li key={i}>{f.to}: {f.error}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

const SendButton = ({ count, noun, sender, onClick, disabled }) => (
  <button type="button" className="btn btn--primary" disabled={disabled || !count || sender.state?.running} onClick={onClick}>
    <Send size={15} /> {sender.state?.running ? "Sending…" : `Send ${fmt(count)} ${noun}`}
  </button>
);

function SystemPicker({ systems, selected, setSelected, render }) {
  const all = systems.length > 0 && systems.every((s) => selected.has(s.id));
  const toggle = (id) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th className="sel"><input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(systems.map((s) => s.id)))} aria-label="Select all systems" /></th>
            {render.head}
          </tr>
        </thead>
        <tbody>
          {systems.map((s) => (
            <tr key={s.id}>
              <td className="sel"><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.name}`} /></td>
              {render.row(s)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Customers: annual notices
function Customers({ systems, profile }) {
  const { updateSystem } = useData();
  const sender = useSender();
  const [selected, setSelected] = useState(new Set());
  const [lines, setLines] = useState({});
  const [markSent, setMarkSent] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all(systems.map((s) => linesFor(s.id, 2000).then((l) => [s.id, l]).catch(() => [s.id, []]))).then((pairs) => active && setLines(Object.fromEntries(pairs)));
    return () => { active = false; };
  }, [systems]);

  const chosen = systems.filter((s) => selected.has(s.id));
  const plan = useMemo(() => planNotices(chosen, lines), [chosen, lines]);
  const all = useMemo(() => Object.fromEntries(planNotices(systems, lines).perSystem.map((p) => [p.systemId, p])), [systems, lines]);
  const first = plan.messages[0] && noticeEmail({ ...plan.messages[0], profile });
  const missing = plan.perSystem.reduce((a, p) => a + (p.inPool - p.withEmail), 0);

  const send = async () => {
    const msgs = plan.messages.map(({ system, line }) => ({ ...noticeEmail({ system, line, profile }), fromName: profile?.business_name || undefined, label: line.address }));
    const result = await sender.run(msgs);
    if (markSent && result.sent) {
      const today = todayIso();
      for (const s of chosen) await updateSystem(s.id, { last_notice_date: today }).catch(() => {});
      notify(`Annual notice marked as sent today for ${chosen.length} ${chosen.length === 1 ? "system" : "systems"}`);
    }
  };

  return (
    <>
      <p className="muted">
        Emails the annual service line notice to each customer whose line is lead, GRR or unknown and has a customer email on file.
        Add emails in a line&apos;s <b>Details</b> or with a <b>Customer email</b> column in a CSV import.
      </p>
      <div className="alert alert--info"><AlertTriangle size={15} /> Confirm with your state that email delivery meets the notice requirement. Customers without an email still need a mailed notice.</div>
      <SystemPicker
        systems={systems}
        selected={selected}
        setSelected={setSelected}
        render={{
          head: <><th>System</th><th className="n">Lines in pool</th><th className="n">On file</th><th className="n">With email</th></>,
          row: (s) => {
            const p = all[s.id];
            return <><td>{s.name}</td><td className="n">{fmt(p?.inPool ?? 0)}</td><td className="n">{p ? fmt(p.onFile) : "…"}</td><td className="n">{p ? fmt(p.withEmail) : "…"}</td></>;
          },
        }}
      />
      {chosen.length > 0 && (
        <>
          <div className="send-row">
            <span>
              <b>{fmt(plan.messages.length)}</b> notices to email{missing > 0 && <span className="muted"> · {fmt(missing)} lines in these systems have no email and need a mailed notice</span>}
            </span>
            <label className="check"><input type="checkbox" checked={markSent} onChange={(e) => setMarkSent(e.target.checked)} /> Mark the annual notice as sent today</label>
            <SendButton count={plan.messages.length} noun="notices" sender={sender} onClick={send} />
          </div>
          <Progress sender={sender} noun="notices" />
          <Preview message={first} />
        </>
      )}
    </>
  );
}

// ---- Clients: reports to each system's contacts
function Clients({ systems, profile, user, can }) {
  const { updateSystem } = useData();
  const sender = useSender();
  const [selected, setSelected] = useState(new Set());
  const [types, setTypes] = useState(["system"]);
  const [drafts, setDrafts] = useState({});
  const chosen = systems.filter((s) => selected.has(s.id));
  const recipients = (s) => parseEmails(drafts[s.id] ?? s.client_emails ?? "").valid;
  const count = chosen.reduce((a, s) => a + recipients(s).length, 0);
  const noContacts = chosen.filter((s) => !recipients(s).length);
  const firstSys = chosen.find((s) => recipients(s).length);
  const first = firstSys && {
    ...reportEmail({ system: firstSys, profile, types }),
    to: recipients(firstSys)[0],
    files: types.map((t) => (t === "plan" ? "replacement plan (PDF)" : "system report (PDF)")),
  };

  const saveContacts = async (s) => {
    const v = drafts[s.id];
    if (v === undefined || v === (s.client_emails || "")) return;
    const { valid, invalid } = parseEmails(v);
    if (invalid.length) notify(`Not saved: ${invalid.join(", ")} ${invalid.length === 1 ? "isn't a valid email" : "aren't valid emails"}.`, "error");
    else {
      await updateSystem(s.id, { client_emails: valid.join(", ") }).then(() => notify(`Contacts saved for ${s.name}`)).catch(() => notify("Couldn't save the contacts.", "error"));
    }
  };

  const send = async () => {
    const preparedBy = user?.full_name || user?.email || "";
    const msgs = [];
    for (const s of chosen) {
      const to = recipients(s);
      if (!to.length) continue;
      const build = async () => {
        const lines = await linesFor(s.id, 1000);
        const files = [];
        if (types.includes("system")) files.push(await pdfAttachment(systemReport(s, lines, profile, { preparedBy })));
        if (types.includes("plan")) files.push(await pdfAttachment(replacementPlan(s, lines, profile, { preparedBy })));
        return files;
      };
      for (const addr of to) msgs.push({ ...reportEmail({ system: s, profile, types, preparedBy }), to: addr, fromName: profile?.business_name || undefined, build, buildKey: s.id, label: s.name });
    }
    await sender.run(msgs);
  };

  return (
    <>
      <p className="muted">Emails each selected system&apos;s report as a PDF to its client contacts (owner, board or manager). Separate several addresses with commas.</p>
      <div className="check-row" role="group" aria-label="Reports to attach">
        {REPORT_TYPES.map((t) => (
          <label key={t.value} className="check">
            <input type="checkbox" checked={types.includes(t.value)} onChange={(e) => setTypes((p) => (e.target.checked ? [...p, t.value] : p.filter((x) => x !== t.value)))} /> {t.label}
          </label>
        ))}
      </div>
      <SystemPicker
        systems={systems}
        selected={selected}
        setSelected={setSelected}
        render={{
          head: <><th>System</th><th>Client contacts</th></>,
          row: (s) => (
            <>
              <td>{s.name}</td>
              <td>
                <input
                  className="contact-input"
                  value={drafts[s.id] ?? s.client_emails ?? ""}
                  placeholder="board@example.org, manager@example.org"
                  disabled={!can.edit}
                  aria-label={`Client contacts for ${s.name}`}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                  onBlur={() => saveContacts(s)}
                />
              </td>
            </>
          ),
        }}
      />
      {chosen.length > 0 && (
        <>
          <div className="send-row">
            <span>
              <b>{fmt(count)}</b> emails to {chosen.length - noContacts.length} {chosen.length - noContacts.length === 1 ? "system" : "systems"}
              {noContacts.length > 0 && <span className="muted"> · no contacts for {noContacts.map((s) => s.name).join(", ")}</span>}
            </span>
            <SendButton count={count} noun={count === 1 ? "email" : "emails"} sender={sender} onClick={send} disabled={!types.length} />
          </div>
          <Progress sender={sender} noun="emails" />
          <Preview message={first} />
        </>
      )}
    </>
  );
}

// ---- Team: open assignments to each tech
function Team({ systems, profile }) {
  const members = useMembers();
  const sender = useSender();
  const [lines, setLines] = useState(null);
  const [selected, setSelected] = useState(new Set());
  useEffect(() => {
    let active = true;
    base44.entities.ServiceLine.filter({ assignment_status: "open" }, { limit: 2000 }).then(unwrap).then((l) => active && setLines(l)).catch(() => active && setLines([]));
    return () => { active = false; };
  }, []);
  const techs = useMemo(() => planAssignments(lines || [], systems, members), [lines, systems, members]);
  const chosen = techs.filter((t) => selected.has(t.techId) && t.email);
  const first = chosen[0] && assignmentEmail({ tech: chosen[0], profile, appUrl: APP_URL });
  const toggle = (id) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const send = () => sender.run(chosen.map((t) => ({ ...assignmentEmail({ tech: t, profile, appUrl: APP_URL }), fromName: profile?.business_name || undefined, label: t.name })));

  if (lines === null) return <div className="spinner spinner--inline" aria-label="Loading assignments" />;
  if (!techs.length) return <p className="muted">No open field assignments. Assign lines from a system page, then send each tech their list here.</p>;
  return (
    <>
      <p className="muted">Sends each tech one email listing their open visits, grouped by system, with a link to Field work.</p>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th className="sel"><span className="sr-only">Select</span></th><th>Field tech</th><th>Email</th><th className="n">Open visits</th></tr></thead>
          <tbody>
            {techs.map((t) => (
              <tr key={t.techId}>
                <td className="sel"><input type="checkbox" disabled={!t.email} checked={selected.has(t.techId)} onChange={() => toggle(t.techId)} aria-label={`Select ${t.name}`} /></td>
                <td>{t.name}</td>
                <td>{t.email || <span className="muted">No email (not on the team?)</span>}</td>
                <td className="n">{fmt(t.lines.length)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="send-row">
        <span><b>{chosen.length}</b> {chosen.length === 1 ? "tech" : "techs"} selected</span>
        <SendButton count={chosen.length} noun={chosen.length === 1 ? "email" : "emails"} sender={sender} onClick={send} />
      </div>
      <Progress sender={sender} noun="emails" />
      <Preview message={first} />
    </>
  );
}

// ---- State: inventory export to the primacy agency
function State({ systems, profile, saveProfile, canSaveProfile, user }) {
  const sender = useSender();
  const states = statesOf(systems);
  const [state, setState] = useState(states[0] || "");
  const saved = (profile?.state_contacts || []).find((c) => c.state === state)?.email || "";
  const [to, setTo] = useState(saved);
  const [withPdf, setWithPdf] = useState(true);
  useEffect(() => setTo(saved), [state, saved]);
  const inState = systems.filter((s) => s.state === state);
  const { valid, invalid } = parseEmails(to);
  const preparedBy = user?.full_name || user?.email || "";
  const csvName = `lcri-inventory-${state}-${todayIso()}.csv`;
  const first = inState.length && valid[0] && {
    ...stateEmail({ state, systems: inState, profile, preparedBy }),
    to: valid.join(", "),
    files: [csvName, ...(withPdf ? ["compliance dashboard (PDF)"] : [])],
  };

  const saveContact = async () => {
    const rest = (profile?.state_contacts || []).filter((c) => c.state !== state);
    await saveProfile({ state_contacts: [...rest, { state, email: valid.join(", ") }] })
      .then(() => notify(`Saved as the ${state} contact`)).catch(() => notify("Couldn't save the contact.", "error"));
  };

  const send = async () => {
    const msg = stateEmail({ state, systems: inState, profile, preparedBy });
    const build = async () => {
      const files = [{ filename: csvName, content: textToBase64(stateCsv(inState)) }];
      if (withPdf) {
        const lines = (await Promise.all(inState.map((s) => linesFor(s.id, 1000).catch(() => [])))).flat();
        files.push(await pdfAttachment(complianceReport(inState, lines, letterhead(profile), { preparedBy })));
      }
      return files;
    };
    await sender.run(valid.map((addr) => ({ ...msg, to: addr, fromName: profile?.business_name || undefined, build, buildKey: state, label: `${state} export` })));
  };

  if (!states.length) return <p className="muted">Add water systems with a state to email inventory exports.</p>;
  return (
    <>
      <p className="muted">Emails the state inventory CSV for every system in the state, and optionally the compliance dashboard PDF, to your primacy agency contact.</p>
      <div className="state-form">
        <div className="field">
          <label htmlFor="em-state">State</label>
          <select id="em-state" value={state} onChange={(e) => setState(e.target.value)}>{states.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="field grow">
          <label htmlFor="em-to">State contact email</label>
          <input id="em-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="lead.inventory@epa.state.gov" />
          {invalid.length > 0 && <small className="error-text">Not valid: {invalid.join(", ")}</small>}
        </div>
        {canSaveProfile && valid.length > 0 && valid.join(", ") !== saved && (
          <button type="button" className="btn btn--sm" onClick={saveContact}>Save as {state} contact</button>
        )}
      </div>
      <label className="check"><input type="checkbox" checked={withPdf} onChange={(e) => setWithPdf(e.target.checked)} /> Also attach the compliance dashboard PDF for {state}</label>
      <div className="send-row">
        <span>{inState.length} {inState.length === 1 ? "system" : "systems"} in {state} · {inState.filter(readyToFile).length} ready to file</span>
        <SendButton count={valid.length && inState.length ? valid.length : 0} noun={valid.length === 1 ? "email" : "emails"} sender={sender} onClick={send} disabled={invalid.length > 0} />
      </div>
      <Progress sender={sender} noun="emails" />
      <Preview message={first} />
    </>
  );
}

// ---- History
function History() {
  const [rows, setRows] = useState(null);
  const [kind, setKind] = useState("");
  useEffect(() => {
    base44.entities.EmailLog.list({ sort: "-sent_at", limit: 300 }).then(unwrap).then(setRows).catch(() => setRows([]));
  }, []);
  if (rows === null) return <div className="spinner spinner--inline" aria-label="Loading history" />;
  const shown = rows.filter((r) => !kind || r.kind === kind);
  return (
    <>
      <div className="filter-bar">
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All emails</option>
          {Object.entries(EMAIL_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="filter-count muted">{fmt(shown.length)} {shown.length === 1 ? "email" : "emails"}</span>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Sent</th><th>Kind</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{new Date(r.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}<small className="muted block">{r.sent_by}</small></td>
                <td>{EMAIL_KINDS[r.kind] || r.kind}</td>
                <td>{r.to}</td>
                <td>{r.subject}{r.attachments?.length ? <small className="muted block">{r.attachments.join(", ")}</small> : null}</td>
                <td>{r.status === "sent" ? <span className="pill pill--ready">Sent</span> : <span className="pill pill--behind" title={r.error || ""}>Failed</span>}{r.error && <small className="muted block">{r.error}</small>}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="muted">No emails sent yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

const TABS = [
  ["customers", "Customers", "Annual notices"],
  ["clients", "Clients", "Reports"],
  ["team", "Team", "Field assignments"],
  ["state", "State", "Inventory exports"],
  ["history", "History", "Sent emails"],
];

export default function Email() {
  const { user } = useAuth();
  const { systems, loading, can } = useData();
  const { profile, canEdit: canSaveProfile, save } = useCompanyProfile();
  const [tab, setTab] = useState("customers");
  const list = useMemo(() => [...(systems || [])].sort((a, b) => a.name.localeCompare(b.name)), [systems]);

  if (loading || profile === undefined) return <div className="spinner spinner--inline" aria-label="Loading" />;
  if (!can.edit) {
    return (
      <div className="card empty">
        <Mail size={28} />
        <h2>Email needs Edit access</h2>
        <p className="muted">Ask your team owner if you need to send notices, reports or exports.</p>
      </div>
    );
  }
  const props = { systems: list, profile, user, can };
  return (
    <div className="stack email">
      <div className="page-head">
        <div>
          <div className="eyebrow">Bulk email</div>
          <h1>Send to customers, clients, your team and the state</h1>
        </div>
      </div>
      {!profile?.business_name && (
        <div className="alert alert--info"><AlertTriangle size={15} /> Emails go out under your business name and address. <Link to="/company">Add them on the Company page</Link> first.</div>
      )}
      <div className="tabs-inline" role="tablist" aria-label="Who to email">
        {TABS.map(([k, l, sub]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : undefined} onClick={() => setTab(k)}>
            <b>{l}</b><span>{sub}</span>
          </button>
        ))}
      </div>
      <section className="card pad" role="tabpanel" aria-label={TABS.find((t) => t[0] === tab)[1]}>
        {tab === "customers" && <Customers {...props} />}
        {tab === "clients" && <Clients {...props} />}
        {tab === "team" && <Team {...props} />}
        {tab === "state" && <State {...props} saveProfile={save} canSaveProfile={canSaveProfile} />}
        {tab === "history" && <History />}
      </section>
      <p className="note">
        Emails to people outside your team need a paid Base44 plan and a verified sending domain (Base44 dashboard → Domains). Base44 limits how many
        go out per hour and allows each recipient up to 30 a day; if a limit is reached, the rest are held back to send later.
      </p>
    </div>
  );
}
