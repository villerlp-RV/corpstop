import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Modal, Swatch } from "@/components/lcri/bits";
import { notify } from "@/components/lcri/notify";
import { CONNECTORS, NON_LEAD_TYPES, connectorText, isSplit, lineFields, materialDetail } from "@/lib/pipes";
import { ID_METHODS, MATERIALS, countsAfterChange, todayIso } from "@/lib/lcri";

// Optional specific material for a non-lead line.
export function NonLeadTypeSelect({ id, value, onChange, label = "Non-lead material" }) {
  return (
    <select id={id} aria-label={label} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Type (optional)…</option>
      {NON_LEAD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
    </select>
  );
}

export function MaterialCell({ line }) {
  const detail = materialDetail(line);
  return (
    <>
      <Swatch material={line.material} />
      {detail && <small className="muted block">{detail}</small>}
    </>
  );
}

const pick = (list, id, value, onChange, placeholder) => (
  <select id={id} value={value || ""} onChange={(e) => onChange(e.target.value)}>
    {placeholder && <option value="">{placeholder}</option>}
    {list.map((m) => <option key={m.value} value={m.value}>{m.long || m.label}</option>)}
  </select>
);

// Everything the inventory records about one line: category (or each portion
// when ownership is split), specific non-lead material, connector and method.
export function LineDetails({ line, system, canEdit, onSaved, updateSystem, user }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const start = () => {
    setForm({
      ownership: isSplit(line) ? "split" : "single",
      material: line.material || "unknown",
      system_side: line.system_side || line.material || "unknown",
      customer_side: line.customer_side || line.material || "unknown",
      material_type: line.material_type || "",
      connector: line.connector || "",
      method: line.identification_method || "",
    });
    setOpen(true);
  };

  const preview = form ? lineFields(form) : null;
  const showType = preview?.fields && (form.ownership === "split" ? [form.system_side, form.customer_side].includes("non_lead") : form.material === "non_lead");

  const save = async (e) => {
    e.preventDefault();
    if (preview.error) return notify(preview.error, "error");
    const fields = preview.fields;
    const known = fields.material !== "unknown" || fields.ownership === "split";
    setSaving(true);
    try {
      await base44.entities.ServiceLine.update(line.id, {
        ...fields,
        identification_method: known ? form.method || ID_METHODS[ID_METHODS.length - 1] : form.method || "",
        ...(fields.material !== line.material && fields.material !== "unknown" ? { verified_date: todayIso(), verified_by: user?.full_name || user?.email || "" } : {}),
      });
      const counts = countsAfterChange(system, line.material, fields.material);
      if (Object.keys(counts).length) await updateSystem(system.id, counts);
      notify(`${line.address} updated`);
      setOpen(false);
      onSaved?.();
    } catch {
      notify("Couldn't save the line. Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="linkbtn line-details-btn" onClick={start} aria-label={`Details for ${line.address}`}>
        <SlidersHorizontal size={12} /> {canEdit ? "Details" : "View"}
      </button>
      <Modal open={open} title={line.address} onClose={() => setOpen(false)}>
        {form && (
          <form className="form line-form" onSubmit={save}>
            <fieldset disabled={!canEdit || saving} className="plain">
              <div className="seg" role="radiogroup" aria-label="Ownership">
                {[["single", "One owner"], ["split", "Split: system side and customer side"]].map(([v, l]) => (
                  <label key={v} className={form.ownership === v ? "on" : undefined}>
                    <input type="radio" name="ownership" value={v} checked={form.ownership === v} onChange={() => set("ownership")(v)} /> {l}
                  </label>
                ))}
              </div>
              {form.ownership === "split" ? (
                <div className="two">
                  <div className="field"><label htmlFor="ld-sys">System-side material</label>{pick(MATERIALS, "ld-sys", form.system_side, set("system_side"))}</div>
                  <div className="field"><label htmlFor="ld-cus">Customer-side material</label>{pick(MATERIALS, "ld-cus", form.customer_side, set("customer_side"))}</div>
                  <p className="note span2">
                    Whole line: <b>{MATERIALS.find((m) => m.value === preview.fields?.material)?.label}</b>. Any lead portion makes it a
                    lead service line.
                  </p>
                </div>
              ) : (
                <div className="field"><label htmlFor="ld-mat">Material</label>{pick(MATERIALS, "ld-mat", form.material, set("material"))}</div>
              )}
              {showType && (
                <div className="field">
                  <label htmlFor="ld-type">Non-lead material <span className="muted">(optional)</span></label>
                  <NonLeadTypeSelect id="ld-type" value={form.material_type} onChange={set("material_type")} />
                </div>
              )}
              <div className="field">
                <label htmlFor="ld-con">Connector (gooseneck or pigtail)</label>
                {pick(CONNECTORS, "ld-con", form.connector, set("connector"), "Not recorded")}
              </div>
              <div className="field">
                <label htmlFor="ld-meth">How identified</label>
                <select id="ld-meth" value={form.method} onChange={(e) => set("method")(e.target.value)}>
                  <option value="">—</option>
                  {[...new Set([...ID_METHODS, form.method].filter(Boolean))].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </fieldset>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>{canEdit ? "Cancel" : "Close"}</button>
              {canEdit && <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? "Saving…" : "Save line"}</button>}
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export const ConnectorCell = ({ line }) => <span className={line.connector === "lead" ? "con-lead" : line.connector ? undefined : "muted"}>{connectorText(line)}</span>;
