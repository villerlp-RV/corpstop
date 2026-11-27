import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Copy, Download } from "lucide-react";
import { useData } from "@/lib/DataContext";
import { notify } from "@/components/lcri/notify";
import { fmt, readyToFile, stateCsv, todayIso, totalLines } from "@/lib/lcri";

function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 10000);
}

export default function Reports() {
  const { systems, loading, can } = useData();
  const navigate = useNavigate();
  const list = systems || [];
  const states = [...new Set(list.map((s) => s.state))].sort();
  const [picked, setPicked] = useState(null);
  const state = picked && states.includes(picked) ? picked : states[0];

  if (loading) return <div className="spinner spinner--inline" aria-label="Loading" />;
  if (list.length === 0) {
    return (
      <div className="card empty">
        <h2>No systems yet</h2>
        <p className="muted">Add a water system on the <Link to="/">Portfolio</Link> page to prepare state filings.</p>
      </div>
    );
  }

  const inState = list.filter((s) => s.state === state);
  const ready = inState.filter(readyToFile).length;
  const csv = stateCsv(inState);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(csv);
      notify(`CSV copied for ${state}`);
    } catch {
      notify("Couldn't copy. Use Download instead.", "error");
    }
  };

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">State reports</div>
        <h1>Baseline inventory filings by state</h1>
      </div>
      <div className="statebar" role="group" aria-label="State">
        {states.map((st) => (
          <button key={st} type="button" className="btn" aria-pressed={st === state} onClick={() => setPicked(st)}>
            {st} <span className="muted">· {list.filter((s) => s.state === st).length}</span>
          </button>
        ))}
      </div>
      <div className="card">
        <div className="card-h">
          <div><b>{state}</b> · {inState.length} systems · {ready} ready to file</div>
          {can.read ? <div className="actions">
            <button type="button" className="btn" onClick={copy}><Copy size={15} /> Copy CSV</button>
            <button type="button" className="btn btn--primary" onClick={() => download(csv, `lcri-inventory-${state}-${todayIso()}.csv`)}>
              <Download size={15} /> Download CSV
            </button>
          </div> : <span className="muted">Needs Read access to export</span>}
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>System</th><th className="n">Lines</th><th className="n">Unknown</th><th>Connectors</th><th>Plan</th><th>Filing</th></tr>
            </thead>
            <tbody>
              {inState.map((s) => {
                const ok = readyToFile(s);
                return (
                  <tr key={s.id} className="click" tabIndex={0} onClick={() => navigate({ to: "/systems/$id", params: { id: s.id } })} onKeyDown={(e) => e.key === "Enter" && navigate({ to: "/systems/$id", params: { id: s.id } })}>
                    <td className="sysname">{s.name}<small>{s.pwsid}</small></td>
                    <td className="n">{fmt(totalLines(s))}</td>
                    <td className="n">{fmt(s.unknown_count)}</td>
                    <td className={s.connectors_inventoried ? "chk chk--y" : "chk chk--n"}>{s.connectors_inventoried ? "✓" : "✗ Missing"}</td>
                    <td className={s.plan_drafted ? "chk chk--y" : "chk chk--n"}>{s.plan_drafted ? "✓" : "✗ Missing"}</td>
                    <td><span className={`pill ${ok ? "pill--ready" : "pill--risk"}`}>{ok ? "Ready" : "Blocked"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <pre className="csv" tabIndex={0} aria-label="CSV preview">{csv}</pre>
      </div>
      <p className="note">This is a generic layout. Each state has its own template and portal; mapping them is the next build step.</p>
    </div>
  );
}
