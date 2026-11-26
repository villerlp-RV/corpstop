import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, CheckCircle2, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { unwrap, useData } from "@/lib/DataContext";
import { notify } from "@/components/lcri/notify";
import { Swatch } from "@/components/lcri/bits";
import { AssignmentCell, PhotoLink } from "@/components/lcri/field-bits";
import { FIELD_MATERIALS, fieldRecordPatch, groupBySystem, workloadByMember } from "@/lib/fieldwork";
import { ID_METHODS, countsAfterChange, materialOf } from "@/lib/lcri";

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// One assigned line, opened into a large-target form for recording a visit.
function RecordForm({ line, onSaved, onCancel }) {
  const { user } = useAuth();
  const { systems, updateSystem } = useData();
  const [material, setMaterial] = useState("");
  const [method, setMethod] = useState(ID_METHODS[0]);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const pickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (f && f.size > MAX_PHOTO_BYTES) {
      notify("That photo is over 15 MB. Take a smaller one.", "error");
      e.target.value = "";
      return;
    }
    setPhoto(f || null);
  };

  const save = async (e) => {
    e.preventDefault();
    const check = fieldRecordPatch(line, { material, method, notes }, user);
    if (check.error) return notify(check.error, "error");
    setSaving(true);
    try {
      let photo_uri;
      if (photo) photo_uri = (await base44.integrations.Core.UploadPrivateFile({ file: photo })).file_uri;
      const { patch } = fieldRecordPatch(line, { material, method, notes, photo_uri }, user);
      await base44.entities.ServiceLine.update(line.id, patch);
      const system = (systems || []).find((s) => s.id === line.system_id);
      if (system) await updateSystem(system.id, countsAfterChange(system, line.material, material));
      notify(`${line.address} recorded as ${materialOf(material).label}`);
      onSaved();
    } catch {
      notify("Couldn't save. Check your signal and try again; nothing was lost on this screen.", "error");
      setSaving(false);
    }
  };

  return (
    <form className="record" onSubmit={save}>
      <fieldset className="choice">
        <legend>Material found</legend>
        {FIELD_MATERIALS.map((m) => (
          <label key={m} className={material === m ? "on" : undefined}>
            <input type="radio" name={`mat-${line.id}`} value={m} checked={material === m} onChange={() => setMaterial(m)} />
            <i className={materialOf(m).cls} aria-hidden="true" />
            {materialOf(m).label}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor={`method-${line.id}`}>How you identified it</label>
        <select id={`method-${line.id}`} value={method} onChange={(e) => setMethod(e.target.value)}>
          {ID_METHODS.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`notes-${line.id}`}>Notes <span className="muted">(optional)</span></label>
        <textarea id={`notes-${line.id}`} rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where you looked, what you saw" />
      </div>
      <div className="photo-row">
        <input ref={fileRef} id={`photo-${line.id}`} type="file" accept="image/*" capture="environment" onChange={pickPhoto} hidden />
        <button type="button" className="btn btn--big" onClick={() => fileRef.current?.click()}>
          <Camera size={18} /> {photo ? "Retake photo" : "Add photo"}
        </button>
        {photo && <span className="muted photo-name">{photo.name}</span>}
      </div>
      <div className="record-actions">
        <button type="button" className="btn btn--big" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn--big btn--primary" disabled={!material || saving}>
          {saving ? (photo ? "Uploading…" : "Saving…") : "Save visit"}
        </button>
      </div>
    </form>
  );
}

function MyWork() {
  const { user } = useAuth();
  const { systems, lineVersion } = useData();
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState([]);
  const [active, setActive] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [o, d] = await Promise.all([
        base44.entities.ServiceLine.filter({ assigned_to: user.id, assignment_status: "open" }, { sort: "address", limit: 500 }),
        base44.entities.ServiceLine.filter({ assigned_to: user.id, assignment_status: "done" }, { sort: "-completed_at", limit: 10 }),
      ]);
      setOpen(unwrap(o));
      setDone(unwrap(d));
    } catch {
      setOpen((prev) => prev ?? []);
      notify("Couldn't load your assignments. Check your signal; they reload when you come back to the app.", "error");
    }
  }, [user?.id]);

  // Refetch when lines change on any device (office assigns more work, etc.).
  useEffect(() => {
    load();
  }, [load, lineVersion]);

  if (open === null) return <div className="spinner spinner--inline" aria-label="Loading assignments" />;
  const groups = groupBySystem(open, systems || []);

  return (
    <div className="stack">
      {open.length === 0 ? (
        <div className="card empty">
          <CheckCircle2 size={28} />
          <h2>No open visits</h2>
          <p className="muted">When the office assigns you service lines, they appear here right away.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.system.id} className="field-group" aria-labelledby={`fg-${g.system.id}`}>
            <h2 id={`fg-${g.system.id}`}>{g.system.name} <span className="muted">· {g.lines.length}</span></h2>
            <ul className="visit-list">
              {g.lines.map((l) => (
                <li key={l.id} className="visit">
                  <div className="visit-h">
                    <MapPin size={18} aria-hidden="true" />
                    <div>
                      <b>{l.address}</b>
                      <small className="muted block">
                        On file: {materialOf(l.material).label}
                        {l.assigned_by_name ? ` · from ${l.assigned_by_name}` : ""}
                      </small>
                    </div>
                    {active !== l.id && (
                      <button type="button" className="btn btn--primary" onClick={() => setActive(l.id)}>Record</button>
                    )}
                  </div>
                  {active === l.id && (
                    <RecordForm
                      line={l}
                      onCancel={() => setActive(null)}
                      onSaved={() => {
                        setActive(null);
                        load();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {done.length > 0 && (
        <section className="card" aria-labelledby="done-h">
          <div className="card-h"><b id="done-h">Recently recorded</b></div>
          <ul className="done-list">
            {done.map((l) => (
              <li key={l.id}>
                <span>{l.address}</span>
                <Swatch material={l.material} />
                <span className="muted">{timeAgo(l.completed_at)}</span>
                <PhotoLink uri={l.photo_uri} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Everyone() {
  const { systems, lineVersion } = useData();
  const [lines, setLines] = useState(null);

  const load = useCallback(async () => {
    try {
      const [o, d] = await Promise.all([
        base44.entities.ServiceLine.filter({ assignment_status: "open" }, { sort: "address", limit: 1000 }),
        base44.entities.ServiceLine.filter({ assignment_status: "done" }, { sort: "-completed_at", limit: 50 }),
      ]);
      setLines([...unwrap(o), ...unwrap(d)]);
    } catch {
      setLines((prev) => prev ?? []);
      notify("Couldn't load field work.", "error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, lineVersion]);

  if (lines === null) return <div className="spinner spinner--inline" aria-label="Loading field work" />;
  const workload = workloadByMember(lines);
  const recent = lines.filter((l) => l.assignment_status === "done");
  const sysName = (id) => (systems || []).find((s) => s.id === id)?.name || "—";

  if (workload.length === 0) {
    return (
      <div className="card empty">
        <h2>No field work assigned yet</h2>
        <p className="muted">Open a water system, tick the service lines to visit, and assign them to a team member.</p>
        <Link className="btn" to="/">Go to portfolio</Link>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="kpis kpis--auto">
        {workload.map((w) => (
          <div key={w.id} className="kpi">
            <div className="kpi-v">{w.open}</div>
            <div className="kpi-l">open for {w.name} · {w.done} recorded</div>
          </div>
        ))}
      </div>
      <section className="card" aria-labelledby="recent-h">
        <div className="card-h"><b id="recent-h">Latest results from the field</b><span className="muted">Updates live</span></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Address</th><th>System</th><th>Found</th><th>Visit</th><th className="n">When</th></tr></thead>
            <tbody>
              {recent.map((l) => (
                <tr key={l.id}>
                  <td>{l.address}</td>
                  <td>{sysName(l.system_id)}</td>
                  <td><Swatch material={l.material} /><small className="muted block">{l.identification_method}</small></td>
                  <td><AssignmentCell line={l} /></td>
                  <td className="n">{timeAgo(l.completed_at)}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={5} className="muted">Nothing recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function FieldWork() {
  const { live } = useData();
  const [view, setView] = useState("mine");
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Field work {live && <span className="live-dot">· live</span>}</div>
          <h1>{view === "mine" ? "My visits" : "Team field work"}</h1>
        </div>
        <div className="seg" role="group" aria-label="Whose work">
          <button type="button" aria-pressed={view === "mine"} onClick={() => setView("mine")}>Mine</button>
          <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}>Everyone</button>
        </div>
      </div>
      {view === "mine" ? <MyWork /> : <Everyone />}
    </div>
  );
}
