import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { linesFor, useData } from "@/lib/DataContext";
import { Kpi } from "@/components/lcri/bits";
import ReportButton from "@/components/lcri/ReportButton";
import { letterhead } from "@/lib/report";
import {
  DUE_SOON_DAYS, KNOWN_GOAL, STATUS_LABEL, complianceReport, complianceSummary, deadlines, fieldActivity, programYear, replacementPace, ruleRollup, unknownPace,
} from "@/lib/compliance";
import { daysToDeadline, fmt, formatDate } from "@/lib/lcri";

const TONE = { done: "pill--ready", on_pace: "pill--ready", no_unknowns: "pill--ready", upcoming: "pill--track", due_soon: "pill--risk", not_started: "pill--risk", behind: "pill--behind", overdue: "pill--behind" };
const Status = ({ s }) => <span className={`pill ${TONE[s] || ""}`}>{STATUS_LABEL[s]}</span>;
const SysLink = ({ id, name }) => <Link to="/systems/$id" params={{ id }}>{name}</Link>;
const pct = (x) => `${Math.round(x * 100)}%`;
const when = (days) => (days === 0 ? "today" : days > 0 ? `in ${fmt(days)} days` : `${fmt(-days)} days ago`);

function Section({ id, title, sub, children }) {
  return (
    <section className="card" aria-labelledby={id}>
      <div className="card-h">
        <b id={id}>{title}</b>
        {sub && <span className="muted">{sub}</span>}
      </div>
      {children}
    </section>
  );
}

export default function Compliance() {
  const { systems, loading, lineVersion, can } = useData();
  const list = useMemo(() => systems || [], [systems]);
  const [lines, setLines] = useState(null);
  const [show, setShow] = useState("soon");

  useEffect(() => {
    let active = true;
    if (!systems) return undefined;
    Promise.all(systems.map((s) => linesFor(s.id, 1000).catch(() => [])))
      .then((all) => active && setLines(all.flat()));
    return () => {
      active = false;
    };
  }, [systems, lineVersion]);

  if (loading) return <div className="spinner spinner--inline" aria-label="Loading" />;
  if (!list.length) {
    return (
      <div className="card empty">
        <h2>No systems yet</h2>
        <p className="muted">Add a water system on the Portfolio page to see deadlines and pace here.</p>
        <Link className="btn" to="/">Go to Portfolio</Link>
      </div>
    );
  }

  const all = lines || [];
  const now = new Date();
  const dl = deadlines(list, now);
  const shown = show === "open" ? dl.filter((d) => d.status !== "done") : show === "soon" ? dl.filter((d) => ["overdue", "due_soon"].includes(d.status)) : dl;
  const summary = complianceSummary(list, all, now);
  const unknowns = list.map((s) => unknownPace(s, all.filter((l) => l.system_id === s.id), now));
  const pace = list.map((s) => replacementPace(s, now));
  const act = fieldActivity(all, list, now);
  const roll = ruleRollup(list, now);
  const year = programYear(now);
  const days = daysToDeadline(now);

  return (
    <div className="stack compliance">
      <div className="page-head">
        <div>
          <div className="eyebrow">Compliance · {days > 0 ? `${fmt(days)} days to 1 Nov 2027` : year ? `Program year ${year} of 10` : "Compliance date reached"}</div>
          <h1>What&apos;s due and are we on pace?</h1>
        </div>
        <div className="actions">
          {can.read && (
            <ReportButton
              label="Download PDF"
              done="Compliance dashboard downloaded"
              disabled={lines === null}
              build={(profile, opts) => complianceReport(list, all, letterhead(profile), opts)}
            />
          )}
        </div>
      </div>

      <div className="kpis">
        <Kpi value={summary.overdue} label="overdue requirements" tone={summary.overdue ? "crit" : undefined} />
        <Kpi value={summary.dueSoon} label={`due in the next ${DUE_SOON_DAYS} days`} tone={summary.dueSoon ? "warn" : undefined} />
        <Kpi value={summary.unknownBehind} label="systems behind on unknown lines" tone={summary.unknownBehind ? "warn" : undefined} />
        <Kpi value={summary.replacementBehind} label={year ? "systems behind on replacements" : "systems short on year-1 scheduling"} tone={summary.replacementBehind ? "warn" : undefined} />
        <Kpi value={lines ? act.month : "…"} label="field visits, last 30 days" />
      </div>

      {/* 1. Deadline calendar */}
      <Section id="c-deadlines" title="Deadline calendar" sub="Every dated requirement across your systems">
        <div className="card-sub">
          <div className="seg" role="group" aria-label="Show deadlines">
            <button type="button" aria-pressed={show === "soon"} onClick={() => setShow("soon")}>Overdue &amp; due soon</button>
            <button type="button" aria-pressed={show === "open"} onClick={() => setShow("open")}>All open</button>
            <button type="button" aria-pressed={show === "all"} onClick={() => setShow("all")}>Including done</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Due</th><th>System</th><th>Requirement</th><th>Rule</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((d) => (
                <tr key={`${d.systemId}-${d.key}`}>
                  <td className="nowrap">{formatDate(d.date)}<small className="muted block">{d.status === "done" ? "" : d.key === "notice" && d.neverSent ? "never sent" : when(d.days)}</small></td>
                  <td><SysLink id={d.systemId} name={d.systemName} /></td>
                  <td>{d.label}</td>
                  <td className="muted nowrap">{d.cite}</td>
                  <td><Status s={d.status} /></td>
                </tr>
              ))}
              {!shown.length && <tr><td colSpan={5} className="muted">Nothing here. {show === "soon" ? "Nothing is overdue or due soon." : ""}</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid2">
        {/* 5. Requirement rollup */}
        <Section id="c-rollup" title="Requirements across systems">
          <ul className="rollup">
            {roll.map((r) => (
              <li key={r.key}>
                <div className="rollup-h">
                  <span>{r.label}</span>
                  <b className="num">{r.done} of {r.total}</b>
                </div>
                <div className="rollup-bar" role="progressbar" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.done} aria-label={r.label}>
                  <i style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
                </div>
                {r.missing.length > 0 && (
                  <small className="muted">
                    Not yet: {r.missing.slice(0, 6).map((m, i) => <span key={m.id}>{i ? ", " : ""}<SysLink id={m.id} name={m.name} /></span>)}
                    {r.missing.length > 6 ? ` and ${r.missing.length - 6} more` : ""}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </Section>

        {/* 4. Field activity */}
        <Section id="c-field" title="Field activity" sub={lines ? undefined : "Loading…"}>
          <div className="card-sub act-kpis">
            <div><b className="num">{act.week}</b><span>visits, 7 days</span></div>
            <div><b className="num">{act.month}</b><span>visits, 30 days</span></div>
            <div><b className="num">{act.open}</b><span>open assignments</span></div>
            <div><b className="num">{act.verifiedMonth}</b><span>lines identified, 30 days</span></div>
          </div>
          {act.oldest && (
            <p className="card-sub note">
              Oldest open visit: <b>{act.oldest.address}</b> ({act.oldest.systemName}), assigned {fmt(act.oldest.days)} days ago to {act.oldest.tech || "—"}.
            </p>
          )}
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Field tech</th><th className="n">Open</th><th className="n">Done, 7 days</th><th className="n">Done, all</th></tr></thead>
              <tbody>
                {act.techs.map((t) => (
                  <tr key={t.id}><td>{t.name}</td><td className="n">{t.open}</td><td className="n">{t.week}</td><td className="n">{t.done}</td></tr>
                ))}
                {!act.techs.length && <tr><td colSpan={4} className="muted">No field assignments yet. Assign lines from a system page.</td></tr>}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* 2. Unknown-line pace */}
      <Section id="c-unknown" title="Unknown-line pace" sub={`Goal: ${pct(KNOWN_GOAL)} of lines with a known material by 1 Nov 2027`}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>System</th><th>Known</th><th className="n">Unknown</th><th className="n">Left to goal</th><th className="n">Needed / month</th><th className="n">Identified, 30 days</th><th>Status</th></tr>
            </thead>
            <tbody>
              {unknowns.map((p) => (
                <tr key={p.systemId}>
                  <td><SysLink id={p.systemId} name={p.systemName} /></td>
                  <td>
                    <span className="mini-bar" aria-hidden="true"><i style={{ width: pct(p.knownShare) }} /><b style={{ left: pct(KNOWN_GOAL) }} /></span>
                    <span className="num">{pct(p.knownShare)}</span>
                  </td>
                  <td className="n">{fmt(p.unknown)}</td>
                  <td className="n">{fmt(p.toGo)}</td>
                  <td className="n">{p.toGo ? fmt(p.perMonth) : "—"}</td>
                  <td className="n">{lines ? fmt(p.recent) : "…"}</td>
                  <td><Status s={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-sub note">
          &ldquo;Identified, 30 days&rdquo; counts lines on file whose material was verified in the last 30 days. A system is on pace when that
          meets the monthly rate needed to reach the goal. The 95% goal is a LineTally readiness target; the rule requires every
          unknown line to be identified or replaced.
        </p>
      </Section>

      {/* 3. Replacement pace */}
      <Section id="c-replace" title="Replacement pace" sub={year ? `Program year ${year} of 10 · cumulative average of at least 10% a year` : "Replacement starts 1 Nov 2027 · 10% of the pool in year 1"}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>System</th><th className="n">Baseline pool</th><th className="n">Year-1 target</th><th className="n">Scheduled</th><th className="n">Completed</th>
                <th className="n">{year ? "Due to date" : "Short of year 1"}</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pace.map((p) => (
                <tr key={p.systemId}>
                  <td><SysLink id={p.systemId} name={p.systemName} /></td>
                  <td className="n">{fmt(p.pool)}</td>
                  <td className="n">{fmt(p.yearOne)}</td>
                  <td className="n">{fmt(p.scheduled)}</td>
                  <td className="n">{fmt(p.completed)}</td>
                  <td className="n">{year ? fmt(p.dueByNow) : fmt(Math.max(0, p.yearOne - p.scheduled))}</td>
                  <td><Status s={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card-sub note">
          Enter scheduled and completed replacements on each system&apos;s page. The baseline pool is today&apos;s lead, GRR and unknown lines plus
          replacements already completed. Confirm deferred deadlines or a different rate with your state.
        </p>
      </Section>
    </div>
  );
}
