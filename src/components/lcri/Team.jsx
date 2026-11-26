import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, UserMinus, Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import { notify } from "@/components/lcri/notify";
import {
  createTeam, getTeamOverview, joinTeam, leaveTeam, removeMember, renameTeam, resetInviteCode,
} from "@/lib/server-fns";

const errorText = (err) => err?.message || "Something went wrong. Try again.";

function NoTeam({ onDone }) {
  const create = useServerFn(createTeam);
  const join = useServerFn(joinTeam);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [bring, setBring] = useState(true);
  const [busy, setBusy] = useState(null);

  const submitCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("create");
    try {
      const team = await create({ data: { name: name.trim() } });
      await onDone(`${team.name} created. Your systems are now shared with the team.`);
    } catch (err) {
      notify(errorText(err), "error");
    } finally {
      setBusy(null);
    }
  };

  const submitJoin = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy("join");
    try {
      const team = await join({ data: { code: code.trim(), bringRecords: bring } });
      await onDone(`You joined ${team.name}.`);
    } catch (err) {
      notify(errorText(err), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Team</div>
        <h1>Work as a team</h1>
        <p className="note">
          You&apos;re using a personal account, so only you can see your water systems. Create a team for your company, or
          join your company&apos;s team with an invite code from its owner.
        </p>
      </div>
      <div className="grid2 grid2--even">
        <form className="card pad" onSubmit={submitCreate}>
          <h3>Create a team</h3>
          <p className="note">You become the owner. Your existing systems move to the team, and you can invite field techs and office staff.</p>
          <div className="field">
            <label htmlFor="team-name">Company or team name</label>
            <input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Tri-County Water Services" />
          </div>
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={!name.trim() || !!busy}>
              {busy === "create" ? "Creating…" : "Create team"}
            </button>
          </div>
        </form>
        <form className="card pad" onSubmit={submitJoin}>
          <h3>Join a team</h3>
          <p className="note">Ask your team owner for the invite code on their Team page.</p>
          <div className="field">
            <label htmlFor="invite-code">Invite code</label>
            <input id="invite-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} placeholder="ABCD2345" autoComplete="off" className="mono-input" />
          </div>
          <label className="check" htmlFor="bring-records">
            <input id="bring-records" type="checkbox" checked={bring} onChange={(e) => setBring(e.target.checked)} />
            Move my existing systems to the team
          </label>
          <div className="actions">
            <button type="submit" className="btn btn--primary" disabled={!code.trim() || !!busy}>
              {busy === "join" ? "Joining…" : "Join team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamDetail({ overview, onChanged }) {
  const { team, members, me } = overview;
  const owner = me.role === "owner";
  const leave = useServerFn(leaveTeam);
  const remove = useServerFn(removeMember);
  const reset = useServerFn(resetInviteCode);
  const rename = useServerFn(renameTeam);
  const [name, setName] = useState(team.name);
  const [confirm, setConfirm] = useState(null); // { type: "remove", member } | { type: "leave" } | { type: "reset" }
  const [busy, setBusy] = useState(false);

  const run = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      setConfirm(null);
      await onChanged(message);
    } catch (err) {
      notify(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(team.invite_code);
      notify("Invite code copied");
    } catch {
      notify("Couldn't copy. Select the code and copy it.", "error");
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="eyebrow">Team · {members.length} {members.length === 1 ? "member" : "members"}</div>
          <h1>{team.name}</h1>
        </div>
        {!owner && (
          <button type="button" className="btn" onClick={() => setConfirm({ type: "leave" })}>Leave team</button>
        )}
      </div>

      {confirm?.type === "leave" && (
        <div className="confirm" role="alert">
          <span>Leave {team.name}? You&apos;ll lose access to its systems. Records you added stay with the team.</span>
          <span className="actions">
            <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => run(() => leave(), `You left ${team.name}.`)}>Leave team</button>
            <button type="button" className="btn btn--sm" onClick={() => setConfirm(null)}>Stay</button>
          </span>
        </div>
      )}

      {owner && (
        <div className="grid2 grid2--even">
          <section className="card pad" aria-labelledby="invite-h">
            <h3 id="invite-h">Invite people</h3>
            <p className="note">Share this code. Anyone who enters it on their Team page joins {team.name} and sees all its systems.</p>
            <div className="invite">
              <code className="invite-code" aria-label="Invite code">{team.invite_code}</code>
              <button type="button" className="btn" onClick={copyCode}><Copy size={15} /> Copy</button>
            </div>
            {confirm?.type === "reset" ? (
              <div className="confirm">
                <span>Make a new code? The current one stops working. People already on the team stay.</span>
                <span className="actions">
                  <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => run(() => reset(), "New invite code made")}>Make new code</button>
                  <button type="button" className="btn btn--sm" onClick={() => setConfirm(null)}>Keep current code</button>
                </span>
              </div>
            ) : (
              <div><button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirm({ type: "reset" })}><RefreshCw size={14} /> Make a new code</button></div>
            )}
          </section>
          <form
            className="card pad"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name.trim() !== team.name) run(() => rename({ data: { name: name.trim() } }), "Team renamed");
            }}
          >
            <h3>Team name</h3>
            <div className="field">
              <label htmlFor="rename-team">Name</label>
              <input id="rename-team" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div className="actions">
              <button type="submit" className="btn" disabled={busy || !name.trim() || name.trim() === team.name}>Save name</button>
            </div>
          </form>
        </div>
      )}

      <section className="card" aria-labelledby="members-h">
        <div className="card-h"><b id="members-h">Members</b></div>
        <ul className="members">
          {members.map((m) => (
            <li key={m.id}>
              <span className="avatar" aria-hidden="true">{(m.name || "?").slice(0, 1).toUpperCase()}</span>
              <div>
                <b>{m.name}{m.id === me.id && <span className="muted"> (you)</span>}</b>
                <small className="muted block">{m.email}</small>
              </div>
              <span className={`pill ${m.role === "owner" ? "pill--track" : "pill--ready"}`}>{m.role === "owner" ? "Owner" : "Member"}</span>
              {owner && m.id !== me.id ? (
                confirm?.type === "remove" && confirm.member.id === m.id ? (
                  <span className="actions">
                    <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => run(() => remove({ data: { userId: m.id } }), `${m.name} removed`)}>Remove</button>
                    <button type="button" className="btn btn--sm" onClick={() => setConfirm(null)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirm({ type: "remove", member: m })} aria-label={`Remove ${m.name}`}>
                    <UserMinus size={14} /> Remove
                  </button>
                )
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      </section>
      <p className="note">
        Everyone on the team can view and edit all of its water systems, service lines and notice batches. Removing someone
        ends their access right away; records they added stay with the team.
      </p>
    </div>
  );
}

export default function Team() {
  const { refresh } = useAuth();
  const { reload } = useData();
  const fetchOverview = useServerFn(getTeamOverview);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await fetchOverview());
      setError(false);
    } catch {
      setError(true);
    }
  }, [fetchOverview]);

  useEffect(() => {
    load();
  }, [load]);

  // Membership changed: refresh the session (team fields), the systems list and this page.
  const onChanged = async (message) => {
    await refresh();
    await Promise.all([reload(), load()]);
    if (message) notify(message);
  };

  if (error) {
    return (
      <div className="card empty">
        <Users size={28} />
        <h2>Couldn&apos;t load your team</h2>
        <button type="button" className="btn" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!overview) return <div className="spinner spinner--inline" aria-label="Loading team" />;
  return overview.team ? <TeamDetail overview={overview} onChanged={onChanged} /> : <NoTeam onDone={onChanged} />;
}
