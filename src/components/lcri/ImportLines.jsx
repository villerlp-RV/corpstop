import { useState } from "react";
import { FileUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { linesFor } from "@/lib/DataContext";
import { Modal } from "@/components/lcri/bits";
import { notify } from "@/components/lcri/notify";
import { IMPORT_TEMPLATE, MAX_IMPORT_ROWS, importTally, planImport } from "@/lib/csv-import";
import { connectorOf, materialText } from "@/lib/pipes";
import { MATERIALS, fmt, todayIso, totalLines } from "@/lib/lcri";

const CHUNK = 200;

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([IMPORT_TEMPLATE], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "linetally-service-lines-template.csv" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Bulk-add service lines to a system from a CSV of addresses.
export default function ImportLines({ system, teamId, onDone, updateSystem }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(null);
  const [fileName, setFileName] = useState("");
  const [addToTotals, setAddToTotals] = useState(false);
  const [progress, setProgress] = useState(null);
  const [reading, setReading] = useState(false);

  const close = () => {
    if (progress !== null) return;
    setOpen(false);
    setPlan(null);
    setFileName("");
  };

  const choose = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return notify("That file is over 5 MB. Split it and import in parts.", "error");
    setReading(true);
    try {
      const [text, existing] = await Promise.all([file.text(), linesFor(system.id, 10000)]);
      const p = planImport(text, existing.map((l) => l.address));
      setPlan(p);
      setFileName(file.name);
      // If the system's totals already cover the lines on file, these are probably
      // lines already counted in the inventory; otherwise they're new lines.
      setAddToTotals(totalLines(system) === 0 || totalLines(system) <= existing.length);
    } catch {
      notify("Couldn't read that file. Save it as CSV and try again.", "error");
    } finally {
      setReading(false);
    }
  };

  const run = async () => {
    const lines = plan.lines;
    setProgress(0);
    let done = 0;
    try {
      for (let i = 0; i < lines.length; i += CHUNK) {
        const batch = lines.slice(i, i + CHUNK).map((l) => ({
          ...l,
          team_id: system.team_id ?? teamId ?? null,
          system_id: system.id,
          ...(l.material === "unknown" ? {} : { verified_date: todayIso() }),
        }));
        await base44.entities.ServiceLine.bulkCreate(batch);
        done += batch.length;
        setProgress(done);
      }
    } catch {
      notify(done ? `Imported ${fmt(done)} lines, then the upload stopped. Import the file again to add the rest; lines already added are skipped.` : "Couldn't import the lines. Check your connection and try again.", "error");
    }
    if (done && addToTotals) {
      const t = importTally(lines.slice(0, done));
      const patch = Object.fromEntries(MATERIALS.map((m) => [m.field, (system[m.field] || 0) + t[m.value]]));
      await updateSystem(system.id, patch).catch(() => notify("Lines imported, but the inventory totals didn't update. Edit the system to fix them.", "error"));
    }
    if (done === lines.length) notify(`${fmt(done)} service ${done === 1 ? "line" : "lines"} imported`);
    setProgress(null);
    setOpen(false);
    setPlan(null);
    setFileName("");
    onDone?.();
  };

  const t = plan ? importTally(plan.lines) : null;
  const busy = progress !== null;

  return (
    <>
      <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>
        <FileUp size={14} /> Import CSV
      </button>
      <Modal open={open} title={`Import service lines · ${system.name}`} onClose={close}>
        <div className="form import">
          <p className="muted">
            Upload a CSV with one service line per row. LineTally looks for an <b>address</b> column (or house number and
            street), and optionally <b>material</b> (lead, galvanized/GRR, unknown, non-lead, copper, plastic…) and{" "}
            <b>identification method</b>, <b>connector</b>, and <b>system-side</b> / <b>customer-side material</b> for split
            ownership, and <b>customer name</b> / <b>email</b> for emailed notices. Addresses already on file are skipped.{" "}
            <button type="button" className="linkbtn" onClick={downloadTemplate}>Download a template</button>
          </p>
          <label className="file-pick">
            <input type="file" className="sr-only" accept=".csv,text/csv,.txt" disabled={busy || reading} onChange={(e) => choose(e.target.files?.[0])} aria-label="CSV file" />
            <FileUp size={18} />
            <span>{reading ? "Reading…" : fileName ? <><b>{fileName}</b> · choose another file</> : "Choose a CSV file"}</span>
          </label>

          {plan && (
            <>
              {plan.lines.length ? (
                <div className="import-sum">
                  <b>{fmt(plan.lines.length)} {plan.lines.length === 1 ? "line" : "lines"} ready to import</b>
                  <span className="muted">
                    {MATERIALS.filter((m) => t[m.value]).map((m) => `${fmt(t[m.value])} ${m.label.toLowerCase()}`).join(" · ")}
                  </span>
                </div>
              ) : (
                <div className="alert" role="alert">No new addresses found in this file.</div>
              )}
              {plan.tooMany && <p className="note">Only the first {fmt(MAX_IMPORT_ROWS)} rows are imported. Split larger files.</p>}
              {(plan.skipped.length > 0 || plan.warnings.length > 0) && (
                <details className="import-issues">
                  <summary>
                    {[plan.skipped.length && `${fmt(plan.skipped.length)} skipped`, plan.warnings.length && `${fmt(plan.warnings.length)} set to Unknown`].filter(Boolean).join(" · ")}
                  </summary>
                  <ul>
                    {[...plan.skipped, ...plan.warnings].sort((a, b) => a.row - b.row).slice(0, 50).map((s) => (
                      <li key={`${s.row}-${s.reason}`}>Row {s.row}{s.address ? ` · ${s.address}` : ""}: {s.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
              {plan.lines.length > 0 && (
                <>
                  <div className="tbl-wrap">
                    <table>
                      <thead><tr><th>Address</th><th>Material</th><th>Connector</th><th>How identified</th></tr></thead>
                      <tbody>
                        {plan.lines.slice(0, 6).map((l) => (
                          <tr key={l.address}><td>{l.address}</td><td>{materialText(l)}</td><td>{connectorOf(l.connector)?.label || "—"}</td><td>{l.identification_method || "—"}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {plan.lines.length > 6 && <p className="note">…and {fmt(plan.lines.length - 6)} more.</p>}
                  <label className="check check--top">
                    <input type="checkbox" checked={addToTotals} onChange={(e) => setAddToTotals(e.target.checked)} disabled={busy} />
                    <span>
                      Add these lines to the inventory totals
                      <small className="muted block">
                        Leave unticked if the system&apos;s totals ({fmt(totalLines(system))} lines) already include them.
                      </small>
                    </span>
                  </label>
                </>
              )}
              <div className="actions">
                <button type="button" className="btn" onClick={close} disabled={busy}>Cancel</button>
                <button type="button" className="btn btn--primary" disabled={busy || !plan.lines.length} onClick={run}>
                  {busy ? `Importing ${fmt(progress)} of ${fmt(plan.lines.length)}…` : `Import ${fmt(plan.lines.length)} ${plan.lines.length === 1 ? "line" : "lines"}`}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
