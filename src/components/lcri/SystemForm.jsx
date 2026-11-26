import { useState } from "react";

const EMPTY = {
  name: "", state: "", pwsid: "", population: "", field_tech: "",
  lead_count: 0, grr_count: 0, unknown_count: 0, nonlead_count: 0,
};

const COUNT_FIELDS = [
  ["lead_count", "Lead"],
  ["grr_count", "GRR"],
  ["unknown_count", "Unknown"],
  ["nonlead_count", "Non-lead"],
];

// Create or edit a water system's details and inventory totals.
export default function SystemForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [v, setV] = useState({ ...EMPTY, ...(initial || {}) });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const state = String(v.state || "").trim().toUpperCase();
    if (!String(v.name).trim()) return setError("Enter the system name.");
    if (!/^[A-Z]{2}$/.test(state)) return setError("Enter the state as a two-letter code, for example OH.");
    const toInt = (x) => Math.max(0, parseInt(x, 10) || 0);
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        name: String(v.name).trim(),
        state,
        pwsid: String(v.pwsid || "").trim().toUpperCase(),
        population: toInt(v.population),
        field_tech: String(v.field_tech || "").trim(),
        lead_count: toInt(v.lead_count),
        grr_count: toInt(v.grr_count),
        unknown_count: toInt(v.unknown_count),
        nonlead_count: toInt(v.nonlead_count),
      });
    } catch {
      setError("Couldn't save. Check your connection and try again.");
      setSaving(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="sf-name">System name</label>
        <input id="sf-name" value={v.name} onChange={set("name")} autoFocus />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="sf-state">State</label>
          <input id="sf-state" value={v.state} onChange={set("state")} maxLength={2} placeholder="OH" />
        </div>
        <div className="field">
          <label htmlFor="sf-pwsid">PWS ID</label>
          <input id="sf-pwsid" value={v.pwsid} onChange={set("pwsid")} placeholder="OH2140117" />
        </div>
        <div className="field">
          <label htmlFor="sf-pop">Population served</label>
          <input id="sf-pop" type="number" min="0" value={v.population} onChange={set("population")} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="sf-tech">Field tech or contact</label>
        <input id="sf-tech" value={v.field_tech} onChange={set("field_tech")} />
      </div>
      <fieldset className="fieldset">
        <legend>Service-line inventory totals</legend>
        <div className="form-row form-row--4">
          {COUNT_FIELDS.map(([k, label]) => (
            <div className="field" key={k}>
              <label htmlFor={`sf-${k}`}>{label}</label>
              <input id={`sf-${k}`} type="number" min="0" value={v[k]} onChange={set(k)} />
            </div>
          ))}
        </div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
