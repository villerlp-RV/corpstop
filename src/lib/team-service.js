// Team operations. Each takes the service-role client (`admin`), the
// authenticated caller (`me`) and validated input, checks the rule in
// team.js, then acts. No framework imports, so tests can pass a fake `admin`.
import { checkTeamAction, memberView, newInviteCode, normalizeInviteCode, teamIdOf, teamRoleOf } from "./team.js";

export const SHARED_ENTITIES = ["WaterSystem", "ServiceLine", "NoticeBatch"];
const unwrap = (res) => (Array.isArray(res) ? res : res?.items ?? []);

export class TeamError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function guard(action, me, target, status) {
  const problem = checkTeamAction(action, me, target);
  if (problem) throw new TeamError(problem, status);
}

const setMembership = (admin, userId, teamId, role) =>
  admin.entities.User.update(userId, { team_id: teamId, team_role: role });

// Move the caller's personal records (team_id null) into a team.
export async function adoptPersonalRecords(admin, userId, teamId) {
  for (const name of SHARED_ENTITIES) {
    for (let i = 0; i < 50; i++) {
      const res = await admin.entities[name].updateMany({ created_by_id: userId, team_id: null }, { $set: { team_id: teamId } });
      if (!res?.has_more) break;
    }
  }
}

async function membersOf(admin, teamId) {
  const users = unwrap(await admin.entities.User.filter({ team_id: teamId }, { limit: 500 }));
  return users
    .map(memberView)
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
}

export async function overview(admin, me) {
  const teamId = teamIdOf(me);
  const none = { team: null, members: [], me: { id: me.id, role: null } };
  if (!teamId) return none;
  const team = await admin.entities.Team.get(teamId).catch(() => null);
  if (!team) return none;
  const role = teamRoleOf(me);
  return {
    team: { id: team.id, name: team.name, invite_code: role === "owner" ? team.invite_code : null },
    members: await membersOf(admin, teamId),
    me: { id: me.id, role },
  };
}

export async function create(admin, me, { name }) {
  guard("create", me, null, 409);
  const team = await admin.entities.Team.create({ name, invite_code: newInviteCode() });
  await setMembership(admin, me.id, team.id, "owner");
  await adoptPersonalRecords(admin, me.id, team.id);
  return { id: team.id, name: team.name };
}

export async function join(admin, me, { code, bringRecords }) {
  guard("join", me, null, 409);
  const normalized = normalizeInviteCode(code);
  if (normalized.length < 6) throw new TeamError("Enter the invite code from your team owner.");
  const [team] = unwrap(await admin.entities.Team.filter({ invite_code: normalized }, { limit: 1 }));
  if (!team) throw new TeamError("That invite code isn't valid. Check it with your team owner.", 404);
  await setMembership(admin, me.id, team.id, "member");
  if (bringRecords) await adoptPersonalRecords(admin, me.id, team.id);
  return { id: team.id, name: team.name };
}

export async function leave(admin, me) {
  guard("leave", me, null, 409);
  await setMembership(admin, me.id, null, null);
  return { ok: true };
}

export async function remove(admin, me, { userId }) {
  const target = await admin.entities.User.get(userId).catch(() => null);
  guard("remove", me, target, 403);
  await setMembership(admin, target.id, null, null);
  return { ok: true };
}

export async function resetInvite(admin, me) {
  guard("manage", me, null, 403);
  const code = newInviteCode();
  await admin.entities.Team.update(teamIdOf(me), { invite_code: code });
  return { invite_code: code };
}

export async function rename(admin, me, { name }) {
  guard("manage", me, null, 403);
  await admin.entities.Team.update(teamIdOf(me), { name });
  return { name };
}
