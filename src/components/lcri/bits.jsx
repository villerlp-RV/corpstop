import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { MATERIALS, READINESS, counts, totalLines } from "@/lib/lcri";

export function MaterialBar({ system, big = false }) {
  const c = counts(system);
  const t = totalLines(system);
  const parts = [["m-lead", c.lead], ["m-grr", c.grr], ["m-unk", c.unknown], ["m-ok", c.nonLead]].filter(([, v]) => v > 0);
  return (
    <div
      className={big ? "mbar mbar--big" : "mbar"}
      role="img"
      aria-label={`${c.lead} lead, ${c.grr} GRR, ${c.unknown} unknown, ${c.nonLead} non-lead`}
    >
      {t > 0 && parts.map(([cls, v]) => <i key={cls} className={cls} style={{ width: `${(v / t) * 100}%` }} />)}
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      {MATERIALS.map((m) => (
        <span key={m.value}>
          <i className={m.cls} />
          {m.long || m.label}
        </span>
      ))}
    </div>
  );
}

export function Swatch({ material }) {
  const m = MATERIALS.find((x) => x.value === material) || MATERIALS[2];
  return (
    <span className="swatch">
      <i className={m.cls} />
      {m.label}
    </span>
  );
}

export function ReadinessPill({ status }) {
  const r = READINESS[status];
  return <span className={`pill ${r.cls}`}>{r.label}</span>;
}

export function Kpi({ value, label, tone }) {
  return (
    <div className={`kpi${tone ? ` kpi--${tone}` : ""}`}>
      <div className="kpi-v">{value}</div>
      <div className="kpi-l">{label}</div>
    </div>
  );
}

// Accessible modal built on <dialog>.
export function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="modal-title">
      <div className="modal-h">
        <h3 id="modal-title">{title}</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}
