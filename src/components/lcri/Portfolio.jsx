import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { unwrap, useData } from "@/lib/DataContext";
import { notify } from "@/components/lcri/notify";
import { Kpi, Legend, MaterialBar, Modal, ReadinessPill } from "@/components/lcri/bits";
import SystemForm from "@/components/lcri/SystemForm";
import ReportButton from "@/components/lcri/ReportButton";
import { portfolioReport } from "@/lib/report";
import {
  EXAMPLE_SYSTEMS, exampleLines, fmt, formatDate, needsAttention, noticeCurrent,
  portfolioSummary, readiness, totalLines, unknownShare, yearOneTarget,
} from "@/lib/lcri";

export default function Portfolio() {
  const { systems, loading, reload, teamId } = useData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const list = systems || [];
  const summary = useMemo(() => portfolioSummary(list), [list]);
  const states = new Set(list.map((s) => s.state)).size;
  const rows = filter === "all" ? list : list.filter((s) => needsAttention(s));
  const hasExamples = list.some((s) => s.is_example);

  const addSystem = async (data) => {
    const created = await base44.entities.WaterSystem.create({ ...data, team_id: teamId });
    setAdding(false);
    await reload();
    notify(`${data.name} added`);
    if (created?.id) navigate({ to: "/systems/$id", params: { id: created.id } });
  };

  const loadExamples = async () => {
    setBusy(true);
    try {
      for (const ex of EXAMPLE_SYSTEMS) {
        const { key: _key, ...data } = ex;
        const created = await base44.entities.WaterSystem.create({ ...data, is_example: true, team_id: teamId });
        await base44.entities.ServiceLine.bulkCreate(exampleLines(ex, created.id).map((l) => ({ ...l, team_id: teamId })));
      }
      await reload();
      notify(`${EXAMPLE_SYSTEMS.length} example systems added`);
    } catch {
      notify("Couldn't add the example data. Try again.", "error");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const removeExamples = async () => {
    setBusy(true);
    try {
      const lines = await base44.entities.ServiceLine.filter({ is_example: true }, { limit: 1000 }).then(unwrap);
      for (const l of lines) await base44.entities.ServiceLine.delete(l.id);
      for (const s of list.filter((x) => x.is_example)) await base44.entities.WaterSystem.delete(s.id);
      await reload();
      notify("Example data removed");
    } catch {
      notify("Couldn't remove all example data. Try again.", "error");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="spinner spinner--inline" aria-label="Loading systems" />;
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Portfolio</div>
          <h1>
            {list.length === 0
              ? "Your water systems"
              : `${list.length} ${list.length === 1 ? "system" : "systems"} in ${states} ${states === 1 ? "state" : "states"}`}
          </h1>
        </div>
        <div className="actions">
          {list.length > 0 && <ReportButton build={(profile, opts) => portfolioReport(list, profile, opts)} />}
          {hasExamples && (
            <button type="button" className="btn" onClick={removeExamples} disabled={busy}>
              Remove example data
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add system
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="card empty">
          <h2>Add your first water system</h2>
          <p className="muted">
            Enter each system you operate with its service-line inventory totals. The console then tracks readiness for
            1 Nov 2027, year-one replacement targets, annual notices and state filings.
          </p>
          <div className="actions actions--center">
            <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add system
            </button>
            <button type="button" className="btn" onClick={loadExamples} disabled={busy}>
              {busy ? "Adding examples…" : "Load example data"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="kpis">
            <Kpi value={fmt(summary.lines)} label="service lines in inventory" />
            <Kpi value={`${Math.round(summary.unknownShare * 100)}%`} label="still unknown material" tone={summary.unknownShare > 0.15 ? "warn" : undefined} />
            <Kpi value={fmt(summary.pool)} label="lines in replacement pool" />
            <Kpi value={summary.noticesDue} label="annual notices not current" tone={summary.noticesDue ? "crit" : undefined} />
            <Kpi value={summary.attention} label="systems behind or at risk" tone={summary.attention ? "crit" : undefined} />
          </div>

          <div className="card">
            <div className="card-h">
              <b>Systems</b>
              <Legend />
              <div className="seg" role="group" aria-label="Filter systems">
                <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button>
                <button type="button" aria-pressed={filter === "attn"} onClick={() => setFilter("attn")}>Needs attention</button>
              </div>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>System</th>
                    <th>Readiness</th>
                    <th>Inventory mix</th>
                    <th className="n">Lines</th>
                    <th className="n">Unknown</th>
                    <th className="n">Year-1 target</th>
                    <th>Plan</th>
                    <th>Notice</th>
                    <th>Tech</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const go = () => navigate({ to: "/systems/$id", params: { id: s.id } });
                    const current = noticeCurrent(s);
                    return (
                      <tr key={s.id} className="click" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === "Enter" && go()}>
                        <td className="sysname">
                          {s.name}
                          {s.is_example && <span className="tag">Example</span>}
                          <small>{[s.pwsid, s.state, s.population ? `pop. ${fmt(s.population)}` : null].filter(Boolean).join(" · ")}</small>
                        </td>
                        <td><ReadinessPill status={readiness(s)} /></td>
                        <td><MaterialBar system={s} /></td>
                        <td className="n">{fmt(totalLines(s))}</td>
                        <td className="n">
                          {fmt(s.unknown_count)} <span className="muted">({Math.round(unknownShare(s) * 100)}%)</span>
                        </td>
                        <td className="n">{fmt(yearOneTarget(s))}</td>
                        <td className={s.plan_drafted ? "chk chk--y" : "chk chk--n"}>{s.plan_drafted ? "✓ Drafted" : "✗ Missing"}</td>
                        <td className={current ? "chk chk--y" : "chk chk--n"}>{current ? `✓ ${formatDate(s.last_notice_date)}` : "✗ Due"}</td>
                        <td>{s.field_tech}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="muted">No systems need attention right now.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="note">
            Year-1 target is 10% of the replacement pool (lead, GRR and unknown lines) for the first year after 1 Nov 2027.
            Readiness checks four things the baseline inventory and first year depend on. Select a system to open it.
          </p>
        </>
      )}

      <Modal open={adding} title="Add water system" onClose={() => setAdding(false)}>
        <SystemForm submitLabel="Add system" onSubmit={addSystem} onCancel={() => setAdding(false)} />
      </Modal>
    </div>
  );
}
