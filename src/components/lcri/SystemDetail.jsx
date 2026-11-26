import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { linesFor, useData } from "@/lib/DataContext";
import { notify } from "@/components/lcri/notify";
import { MaterialBar, Modal, ReadinessPill, Swatch } from "@/components/lcri/bits";
import SystemForm from "@/components/lcri/SystemForm";
import {
  ID_METHODS, MATERIALS, checklist, counts, countsAfterChange, fmt, readiness,
  replacementPool, todayIso, totalLines, yearOneTarget,
} from "@/lib/lcri";

function VerifyControls({ line, onSave }) {
  const [material, setMaterial] = useState("");
  const [method, setMethod] = useState(ID_METHODS[0]);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await onSave(line, material, method);
    } finally {
      setSaving(false);
    }
  };
  return (
    <span className="inline-form">
      <select id={`mat-${line.id}`} aria-label={`Material found at ${line.address}`} value={material} onChange={(e) => setMaterial(e.target.value)}>
        <option value="">Material found…</option>
        {MATERIALS.filter((m) => m.value !== "unknown").map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
      <select id={`meth-${line.id}`} aria-label="How it was identified" value={method} onChange={(e) => setMethod(e.target.value)}>
        {ID_METHODS.map((m) => <option key={m}>{m}</option>)}
      </select>
      <button type="button" className="btn btn--sm btn--primary" disabled={!material || saving} onClick={save}>
        {saving ? "Saving…" : "Save"}
      </button>
    </span>
  );
}

function AddLineForm({ onAdd }) {
  const [address, setAddress] = useState("");
  const [material, setMaterial] = useState("unknown");
  const [method, setMethod] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!address.trim()) return;
    setSaving(true);
    try {
      await onAdd({ address: address.trim(), material, identification_method: material === "unknown" ? "" : method || ID_METHODS[0] });
      setAddress("");
      setMaterial("unknown");
      setMethod("");
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className="inline-form add-line" onSubmit={submit}>
      <input id="new-line-address" aria-label="Service address" placeholder="Service address" value={address} onChange={(e) => setAddress(e.target.value)} />
      <select id="new-line-material" aria-label="Material" value={material} onChange={(e) => setMaterial(e.target.value)}>
        {MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
      {material !== "unknown" && (
        <select id="new-line-method" aria-label="How it was identified" value={method || ID_METHODS[0]} onChange={(e) => setMethod(e.target.value)}>
          {ID_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
      )}
      <button type="submit" className="btn btn--sm" disabled={!address.trim() || saving}>
        <Plus size={14} /> Add line
      </button>
    </form>
  );
}

export default function SystemDetail({ id }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { systems, loading, updateSystem, reload, teamId } = useData();
  const system = (systems || []).find((s) => s.id === id);
  const [lines, setLines] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scheduled, setScheduled] = useState("");

  const loadLines = useCallback(async () => {
    try {
      setLines(await linesFor(id));
    } catch {
      setLines([]);
      notify("Couldn't load service lines.", "error");
    }
  }, [id]);

  useEffect(() => {
    loadLines();
  }, [loadLines]);

  useEffect(() => {
    if (system) setScheduled(String(system.replacements_scheduled || 0));
  }, [system?.id, system?.replacements_scheduled]);

  if (loading) return <div className="spinner spinner--inline" aria-label="Loading" />;
  if (!system) {
    return (
      <div className="empty">
        <h2>System not found</h2>
        <p className="muted">It may have been deleted.</p>
        <Link className="btn" to="/">Back to portfolio</Link>
      </div>
    );
  }

  const c = counts(system);
  const target = yearOneTarget(system);
  const sched = system.replacements_scheduled || 0;
  const items = checklist(system);

  const save = async (patch, message) => {
    try {
      await updateSystem(system.id, patch);
      if (message) notify(message);
    } catch {
      notify("Couldn't save. Try again.", "error");
    }
  };

  const saveScheduled = () => {
    const n = Math.max(0, Math.min(replacementPool(system), parseInt(scheduled, 10) || 0));
    setScheduled(String(n));
    if (n !== sched) save({ replacements_scheduled: n }, "Scheduled replacements saved");
  };

  const verifyLine = async (line, material, method) => {
    try {
      await base44.entities.ServiceLine.update(line.id, {
        material,
        identification_method: method,
        verified_date: todayIso(),
        verified_by: user?.full_name || user?.email || "",
      });
      await updateSystem(system.id, countsAfterChange(system, line.material, material));
      await loadLines();
      notify(`${line.address} recorded as ${MATERIALS.find((m) => m.value === material).label}`);
    } catch {
      notify("Couldn't save the verification. Try again.", "error");
      await loadLines();
    }
  };

  // A new line record is a new line in the inventory, so its count goes up.
  const addLine = async (data) => {
    try {
      await base44.entities.ServiceLine.create({ ...data, team_id: system.team_id ?? teamId, system_id: system.id, verified_date: data.material === "unknown" ? undefined : todayIso() });
      const field = MATERIALS.find((m) => m.value === data.material).field;
      await updateSystem(system.id, { [field]: (system[field] || 0) + 1 });
      await loadLines();
      notify(`${data.address} added`);
    } catch {
      notify("Couldn't add the line. Try again.", "error");
    }
  };

  const saveEdit = async (data) => {
    await updateSystem(system.id, data);
    setEditing(false);
    notify("System updated");
  };

  const deleteSystem = async () => {
    try {
      for (const l of lines || []) await base44.entities.ServiceLine.delete(l.id);
      await base44.entities.WaterSystem.delete(system.id);
      await reload();
      notify(`${system.name} deleted`);
      navigate({ to: "/" });
    } catch {
      notify("Couldn't delete the system. Try again.", "error");
    }
  };

  return (
    <div className="stack">
      <div className="crumb"><Link to="/">Portfolio</Link> / {system.name}</div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {[system.pwsid, system.state, system.population ? `pop. ${fmt(system.population)}` : null, system.field_tech ? `field tech ${system.field_tech}` : null].filter(Boolean).join(" · ")}
          </div>
          <h1>{system.name}</h1>
        </div>
        <div className="actions">
          <ReadinessPill status={readiness(system)} />
          <button type="button" className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>
        </div>
      </div>

      <div className="grid2">
        <section className="card pad" aria-labelledby="inv-h">
          <div className="eyebrow" id="inv-h">Service-line inventory · {fmt(totalLines(system))} lines</div>
          <MaterialBar system={system} big />
          <div className="counts">
            {[["m-lead", "Lead", c.lead], ["m-grr", "GRR", c.grr], ["m-unk", "Unknown", c.unknown], ["m-ok", "Non-lead", c.nonLead]].map(([cls, label, v]) => (
              <div key={label}>
                <b>{fmt(v)}</b>
                <span><i className={cls} />{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card pad" aria-labelledby="ready-h">
          <div className="eyebrow" id="ready-h">Ready for 1 Nov 2027</div>
          <ul className="checklist">
            {items.map((it) => (
              <li key={it.key}>
                <span className={it.done ? "tick tick--y" : "tick"} aria-hidden="true">{it.done && <Check size={12} />}</span>
                <div>
                  {it.label}
                  <small>{it.detail}</small>
                </div>
                {it.key === "connectors" && (
                  <button type="button" className="btn btn--sm" onClick={() => save({ connectors_inventoried: !system.connectors_inventoried }, system.connectors_inventoried ? "Marked as not done" : "Connectors marked as inventoried")}>
                    {system.connectors_inventoried ? "Undo" : "Mark done"}
                  </button>
                )}
                {it.key === "plan" && (
                  <button type="button" className="btn btn--sm" onClick={() => save({ plan_drafted: !system.plan_drafted }, system.plan_drafted ? "Marked as not drafted" : "Replacement plan marked as drafted")}>
                    {system.plan_drafted ? "Undo" : "Mark drafted"}
                  </button>
                )}
                {it.key === "notice" && !it.done && <Link className="btn btn--sm" to="/notices">Send</Link>}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card pad pace" aria-labelledby="pace-h">
        <div className="eyebrow" id="pace-h">Replacement pace · year 1</div>
        <div className="pace-row">
          <span>
            Pool <b className="num">{fmt(replacementPool(system))}</b> lines → year-1 target <b className="num">{fmt(target)}</b> replacements
          </span>
          <span className="inline-form">
            <label htmlFor="scheduled">Scheduled</label>
            <input id="scheduled" type="number" min="0" className="num-input" value={scheduled} onChange={(e) => setScheduled(e.target.value)} onBlur={saveScheduled} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
          </span>
        </div>
        <div className="pace-track" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(sched, target)} aria-label="Scheduled against year-1 target">
          <i style={{ width: `${target ? Math.min(100, (sched / target) * 100) : 100}%` }} />
        </div>
        <p className="note">
          {sched >= target
            ? "Scheduled replacements meet the year-1 target."
            : `Schedule ${fmt(target - sched)} more to meet the year-1 target.`}{" "}
          Every unknown line identified as non-lead shrinks the pool.
        </p>
      </section>

      <section className="card" aria-labelledby="lines-h">
        <div className="card-h">
          <b id="lines-h">Service lines</b>
          <span className="muted">{lines ? `${fmt(lines.length)} on file of ${fmt(totalLines(system))} in inventory` : "Loading…"}</span>
        </div>
        <div className="card-sub"><AddLineForm onAdd={addLine} /></div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>Address</th><th>Material</th><th>How identified</th><th>Field verification</th></tr>
            </thead>
            <tbody>
              {(lines || []).map((l) => (
                <tr key={l.id}>
                  <td>{l.address}{l.is_example && <span className="tag">Example</span>}</td>
                  <td><Swatch material={l.material} /></td>
                  <td>{l.identification_method || "—"}{l.verified_by ? <small className="muted block">{l.verified_by}</small> : null}</td>
                  <td>{l.material === "unknown" ? <VerifyControls line={l} onSave={verifyLine} /> : <span className="muted">—</span>}</td>
                </tr>
              ))}
              {lines && lines.length === 0 && (
                <tr><td colSpan={4} className="muted">No individual lines on file yet. Add lines as you visit them in the field.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="danger-zone">
        {confirmDelete ? (
          <span className="inline-form">
            <span>Delete {system.name} and its {fmt(lines?.length || 0)} line records?</span>
            <button type="button" className="btn btn--danger btn--sm" onClick={deleteSystem}>Delete system</button>
            <button type="button" className="btn btn--sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </span>
        ) : (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete system</button>
        )}
      </div>

      <Modal open={editing} title="Edit water system" onClose={() => setEditing(false)}>
        <SystemForm initial={system} submitLabel="Save changes" onSubmit={saveEdit} onCancel={() => setEditing(false)} />
      </Modal>
    </div>
  );
}
