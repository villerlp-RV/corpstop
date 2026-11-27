import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Images, ShieldCheck } from "lucide-react";
import { useData, linesFor } from "@/lib/DataContext";
import { getTeamOverview, setMemberPermissions } from "@/lib/server-fns";
import { PERMISSIONS, permissionCode } from "@/lib/permissions";
import { photosOf } from "@/lib/fieldwork";
import { notify } from "@/components/lcri/notify";
import { PhotoGallery } from "@/components/lcri/field-bits";

// Owner-only: set each member's Read / Write / Edit access (View is always on).
function Permissions() {
  const fetchOverview = useServerFn(getTeamOverview);
  const save = useServerFn(setMemberPermissions);
  const [overview, setOverview] = useState(null);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    fetchOverview().then(setOverview).catch(() => setOverview({ error: true }));
  }, [fetchOverview]);

  const toggle = async (m, key) => {
    const next = { ...m.perms, [key]: !m.perms[key] };
    setSaving(m.id);
    try {
      await save({ data: { userId: m.id, read: next.read, write: next.write, edit: next.edit } });
      setOverview((o) => ({ ...o, members: o.members.map((x) => (x.id === m.id ? { ...x, perms: next } : x)) }));
      notify(`${m.name}: ${permissionCode(next)}`);
    } catch (e) {
      notify(e?.message || "Couldn't save that change. Try again.", "error");
    } finally {
      setSaving(null);
    }
  };

  if (!overview) return <div className="spinner spinner--inline" aria-label="Loading members" />;
  if (overview.error) return <p className="muted">Couldn&apos;t load your team. Reload the page to try again.</p>;
  if (!overview.team) return <p className="muted">Permissions apply to team members. Create a team on the Team page to invite people.</p>;

  return (
    <>
      <div className="tbl-wrap">
        <table className="perm-table">
          <thead>
            <tr>
              <th>Member</th>
              {PERMISSIONS.map((p) => <th key={p.key} className="perm-col" title={p.desc}>{p.label}</th>)}
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {overview.members.map((m) => {
              const owner = m.role === "owner";
              return (
                <tr key={m.id}>
                  <td>{m.name}<small className="muted block">{owner ? "Owner · always has every permission" : m.email}</small></td>
                  {PERMISSIONS.map((p) => (
                    <td key={p.key} className="perm-col">
                      <input
                        type="checkbox"
                        checked={!!m.perms[p.key]}
                        disabled={owner || p.always || saving === m.id}
                        onChange={() => toggle(m, p.key)}
                        aria-label={`${p.label} for ${m.name}`}
                      />
                    </td>
                  ))}
                  <td><span className="tag tag--mono">{permissionCode(m.perms)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className="perm-legend">
        {PERMISSIONS.map((p) => (
          <div key={p.key}><dt>{p.label}</dt><dd>{p.desc}{p.always ? " Always on." : ""}</dd></div>
        ))}
      </dl>
      <p className="note">
        New members start with View, Read and Write. Members who only have Write can still record visits and add photos on
        lines assigned to them. Anyone who can see a record could copy what&apos;s on screen, so Read controls the download
        buttons rather than what members can view.
      </p>
    </>
  );
}

// Every photo on every line the owner can see, with a Remove button in each gallery.
function PhotoLibrary() {
  const { systems } = useData();
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    const list = systems || [];
    const perSystem = await Promise.all(
      list.map((s) => linesFor(s.id, 1000).then((lines) => lines.filter((l) => photosOf(l).length).map((l) => ({ system: s, line: l }))).catch(() => []))
    );
    setRows(perSystem.flat());
  }, [systems]);

  useEffect(() => {
    if (systems) load();
  }, [systems, load]);

  if (!rows) return <div className="spinner spinner--inline" aria-label="Loading photos" />;
  if (!rows.length) return <p className="muted">No photos on file yet.</p>;
  const total = rows.reduce((n, r) => n + photosOf(r.line).length, 0);
  return (
    <>
      <p className="muted">{total} {total === 1 ? "photo" : "photos"} on {rows.length} service {rows.length === 1 ? "line" : "lines"}. Open a set to review or remove photos.</p>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>System</th><th>Address</th><th>Photos</th></tr></thead>
          <tbody>
            {rows.map(({ system, line }) => (
              <tr key={line.id}>
                <td>{system.name}</td>
                <td>{line.address}</td>
                <td><PhotoGallery uris={photosOf(line)} title={`Photos · ${line.address}`} lineId={line.id} canRemove onChanged={load} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Admin() {
  const { can } = useData();
  if (!can.admin) {
    return (
      <div className="card empty">
        <ShieldCheck size={28} />
        <h2>Admin tools are for the team owner</h2>
        <p className="muted">Ask your team owner if you need different permissions or a photo removed.</p>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Team owner</div>
          <h1>Admin</h1>
        </div>
      </div>
      <section className="card pad" aria-labelledby="perm-h">
        <div className="eyebrow" id="perm-h"><ShieldCheck size={13} /> Member permissions · RWEV</div>
        <Permissions />
      </section>
      <section className="card pad" aria-labelledby="photo-h">
        <div className="eyebrow" id="photo-h"><Images size={13} /> Photo library</div>
        <PhotoLibrary />
      </section>
    </div>
  );
}
