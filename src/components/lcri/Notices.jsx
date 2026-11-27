import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { base44 } from "@/api/base44Client";
import { linesFor, useData } from "@/lib/DataContext";
import { notify } from "@/components/lcri/notify";
import { fmt, formatDate, noticeCurrent, replacementPool, todayIso } from "@/lib/lcri";

const MATERIAL_PHRASE = {
  lead: "lead",
  grr: "galvanized pipe that requires replacement",
  unknown: "of unknown material",
};

export default function Notices() {
  const { systems, loading, updateSystem, teamId, can } = useData();
  const list = systems || [];
  const [selected, setSelected] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [sample, setSample] = useState(null);
  const [queuing, setQueuing] = useState(false);

  // Pre-select every system whose notice is not current, once data arrives.
  useEffect(() => {
    if (selected === null && systems) {
      setSelected(new Set(systems.filter((s) => !noticeCurrent(s)).map((s) => s.id)));
    }
  }, [systems, selected]);

  const chosen = useMemo(() => list.filter((s) => selected?.has(s.id)), [list, selected]);
  const preview = list.find((s) => s.id === previewId) || chosen[0] || list[0];
  const letters = chosen.reduce((a, s) => a + replacementPool(s), 0);

  useEffect(() => {
    let active = true;
    setSample(null);
    if (!preview) return undefined;
    linesFor(preview.id, 50)
      .then((rows) => {
        if (!active) return;
        setSample((rows || []).find((r) => r.material !== "non_lead") || null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [preview?.id]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const queue = async () => {
    setQueuing(true);
    const today = todayIso();
    try {
      await base44.entities.NoticeBatch.create({ team_id: teamId, system_ids: chosen.map((s) => s.id), letter_count: letters, queued_date: today });
      for (const s of chosen) await updateSystem(s.id, { last_notice_date: today });
      setSelected(new Set());
      notify(`${fmt(letters)} letters queued for ${chosen.length} ${chosen.length === 1 ? "system" : "systems"}`);
    } catch {
      notify("Couldn't queue the notices. Try again.", "error");
    } finally {
      setQueuing(false);
    }
  };

  if (loading) return <div className="spinner spinner--inline" aria-label="Loading" />;
  if (list.length === 0) {
    return (
      <div className="card empty">
        <h2>No systems yet</h2>
        <p className="muted">Add a water system on the Portfolio page to send its annual notices.</p>
      </div>
    );
  }

  const due = list.filter((s) => !noticeCurrent(s)).length;

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Annual notices</div>
        <h1>Notify every customer on a lead, GRR or unknown line</h1>
      </div>
      <div className="split">
        <div className="card">
          <div className="card-h">
            <b>Systems</b>
            <span className="muted">{due} not current</span>
          </div>
          <ul className="pick">
            {list.map((s) => {
              const current = noticeCurrent(s);
              return (
                <li key={s.id}>
                  <input type="checkbox" id={`ns-${s.id}`} checked={!!selected?.has(s.id)} onChange={() => toggle(s.id)} />
                  <label htmlFor={`ns-${s.id}`}>
                    <b>{s.name}</b>
                    <small>
                      {fmt(replacementPool(s))} letters · {current ? `sent ${formatDate(s.last_notice_date)}` : "not sent in 12 months"}
                    </small>
                  </label>
                  <button type="button" className="btn btn--sm" aria-pressed={preview?.id === s.id} onClick={() => setPreviewId(s.id)}>
                    {preview?.id === s.id ? "Previewing" : "Preview"}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="summary">
            <span><b className="num">{fmt(letters)}</b> letters across <b>{chosen.length}</b> systems</span>
            {can.write ? (
              <button type="button" className="btn btn--primary" disabled={!chosen.length || queuing} onClick={queue}>
                {queuing ? "Queuing…" : "Queue for print and mail"}
              </button>
            ) : (
              <span className="muted">Needs Write access to queue notices</span>
            )}
          </div>
        </div>

        {preview && (
          <article className="letter" aria-label="Letter preview">
            <div className="eyebrow">Preview · draft template · confirm wording with your state</div>
            <div>
              <span className="merge">{preview.name}</span>
              <br />
              PWS ID <span className="merge">{preview.pwsid || "—"}</span>
            </div>
            <div>To the resident at <span className="merge">{sample?.address || "[service address]"}</span></div>
            <h4>Important information about lead in your drinking water</h4>
            <p>
              Our records show the service line connecting your home to the water main is{" "}
              <span className="merge">{MATERIAL_PHRASE[sample?.material] || "lead, galvanized or of unknown material"}</span>.
              Lead can enter drinking water from these pipes.
            </p>
            <p>Steps you can take now to reduce your exposure:</p>
            <ul>
              <li>Run your tap for a few minutes when water has sat for several hours.</li>
              <li>Use only cold water for drinking, cooking and making baby formula.</li>
              <li>Use a filter certified to reduce lead.</li>
            </ul>
            <p>
              We plan to replace lead and galvanized service lines over the next ten years. To find out when your line is
              scheduled, or to let us inspect it, contact <span className="merge">{preview.field_tech || "[contact]"}</span>.
            </p>
          </article>
        )}
      </div>
      {can.edit && (
        <p className="note">
          Have customer email addresses? <Link to="/email">Email the notices</Link> to them instead (needs a verified sending domain).
        </p>
      )}
      <p className="note">Letter count is the number of lead, GRR and unknown lines in each system. Queuing records the batch and marks each system&apos;s notice as sent today.</p>
    </div>
  );
}
