import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CloudOff, MapPin, RefreshCw, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { unwrap, useData } from "@/lib/DataContext";
import { notify } from "@/components/lcri/notify";
import { Swatch } from "@/components/lcri/bits";
import { AssignmentCell, PhotoGallery } from "@/components/lcri/field-bits";
import { PhotoPicker } from "@/components/lcri/Camera";
import { useOffline } from "@/lib/OfflineQueue";
import { cacheStore } from "@/lib/offline-store";
import { hideQueued, queuedVisit } from "@/lib/offline";
import { FIELD_MATERIALS, MAX_PHOTOS_PER_ENTRY, fieldRecordPatch, groupBySystem, photosOf, workloadByMember } from "@/lib/fieldwork";
import { ID_METHODS, materialOf } from "@/lib/lcri";

function timeAgo(iso) {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// One assigned line, opened into a large-target form for recording a visit.
// Every save goes into the offline queue and uploads straight away when there
// is signal, so it works the same with or without a connection.
function RecordForm({ line, onSaved, onCancel }) {
  const { user } = useAuth();
  const { enqueue } = useOffline();
  const [material, setMaterial] = useState("");
  const [method, setMethod] = useState(ID_METHODS[0]);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const check = fieldRecordPatch(line, { material, method, notes }, user);
    if (check.error) return notify(check.error, "error");
    setSaving(true);
    try {
      const outcome = await enqueue(queuedVisit({ line, input: { material, method, notes }, photos, user }));
      if (outcome === "saved") notify(`${line.address} recorded as ${materialOf(material).label}`);
      else if (outcome === "queued") notify(`Saved on this phone. ${line.address} uploads when you have signal.`);
      else notify(`${line.address} couldn't be saved. See "Waiting to upload".`, "error");
      onSaved();
    } catch {
      notify("Couldn't save on this phone. Try again.", "error");
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
      <div className="field">
        <span className="field-label">Photos <span className="muted">(optional)</span></span>
        <PhotoPicker photos={photos} onChange={setPhotos} max={MAX_PHOTOS_PER_ENTRY} idPrefix={`visit-${line.id}`} />
      </div>
      <div className="record-actions">
        <button type="button" className="btn btn--big" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn--big btn--primary" disabled={!material || saving}>
          {saving ? "Saving…" : "Save visit"}
        </button>
      </div>
    </form>
  );
}

const fmtTime = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function WaitingList() {
  const { queue, online, syncing, syncNow, discard, retry } = useOffline();
  const [confirm, setConfirm] = useState(null);
  if (!queue.length) return null;
  return (
    <section className="card waiting" aria-labelledby="waiting-h">
      <div className="card-h">
        <b id="waiting-h">Waiting to upload · {queue.length}</b>
        <button type="button" className="btn btn--sm" disabled={!online || syncing} onClick={syncNow}>
          <RefreshCw size={14} className={syncing ? "spin" : undefined} /> {online ? (syncing ? "Uploading…" : "Upload now") : "No signal"}
        </button>
      </div>
      <ul className="done-list">
        {queue.map((q) => (
          <li key={q.id} className={q.error ? "is-bad" : undefined}>
            <span>{q.address}</span>
            <span className="swatch"><i className={materialOf(q.input.material).cls} />{materialOf(q.input.material).label}</span>
            <span className="muted">{fmtTime(q.recordedAt)}{(q.photos?.length || q.uploaded?.length) ? ` · ${Math.max(q.photos?.length || 0, q.uploaded?.length || 0)} photos` : ""}</span>
            {q.error ? (
              <span className="queue-error">
                {q.error}{" "}
                {confirm === q.id ? (
                  <>
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => discard(q.id)}>Discard visit</button>
                    <button type="button" className="btn btn--sm" onClick={() => setConfirm(null)}>Keep</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn--sm" onClick={() => retry(q.id)}>Try again</button>
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirm(q.id)} aria-label={`Discard visit at ${q.address}`}><Trash2 size={14} /></button>
                  </>
                )}
              </span>
            ) : (
              <span className="muted">{online ? "Uploading soon" : "Uploads when you have signal"}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyWork() {
  const { user } = useAuth();
  const { systems, lineVersion, can } = useData();
  const { queue, online } = useOffline();
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState([]);
  const [active, setActive] = useState(null);
  const [savedAt, setSavedAt] = useState(null); // set when showing the copy kept on this phone
  const [cachedSystems, setCachedSystems] = useState([]);

  // Online: fetch and keep a copy on the phone. No signal: show that copy.
  const load = useCallback(async () => {
    if (!user?.id) return;
    const key = `my-work:${user.id}`;
    try {
      const [o, d] = await Promise.all([
        base44.entities.ServiceLine.filter({ assigned_to: user.id, assignment_status: "open" }, { sort: "address", limit: 500 }),
        base44.entities.ServiceLine.filter({ assigned_to: user.id, assignment_status: "done" }, { sort: "-completed_at", limit: 10 }),
      ]);
      const snapshot = { open: unwrap(o), done: unwrap(d), systems: (systems || []).map((s) => ({ id: s.id, name: s.name })), at: new Date().toISOString() };
      setOpen(snapshot.open);
      setDone(snapshot.done);
      setSavedAt(null);
      cacheStore.set(key, snapshot).catch(() => {});
    } catch {
      const snapshot = await cacheStore.get(key).catch(() => null);
      if (snapshot) {
        setOpen(snapshot.open);
        setDone(snapshot.done);
        setCachedSystems(snapshot.systems || []);
        setSavedAt(snapshot.at);
      } else {
        setOpen((prev) => prev ?? []);
        notify("Couldn't load your assignments, and none are saved on this phone yet.", "error");
      }
    }
  }, [user?.id, systems]);

  // Refetch when lines change on any device (office assigns more work, etc.).
  useEffect(() => {
    load();
  }, [load, lineVersion]);

  if (open === null) return <div className="spinner spinner--inline" aria-label="Loading assignments" />;
  const todo = hideQueued(open, queue);
  const groups = groupBySystem(todo, systems?.length ? systems : cachedSystems);

  return (
    <div className="stack">
      {(!online || savedAt) && (
        <div className="offline-note" role="status">
          <CloudOff size={16} />
          <span>
            {online ? "Couldn't reach the server." : "No signal."} Showing your assignments as saved on this phone
            {savedAt ? ` at ${fmtTime(savedAt)}` : ""}. Visits you record are kept here and upload automatically.
          </span>
        </div>
      )}
      <WaitingList />
      {todo.length === 0 ? (
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
                    {active !== l.id && (can.write || can.edit) && (
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
                <PhotoGallery uris={photosOf(l)} />
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
                  <td><AssignmentCell line={l} /> <PhotoGallery uris={photosOf(l)} title={`Photos · ${l.address}`} /></td>
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
  const { online } = useOffline();
  const [view, setView] = useState("mine");
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Field work {online ? live && <span className="live-dot">· live</span> : <span className="off-dot">· offline</span>}</div>
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
