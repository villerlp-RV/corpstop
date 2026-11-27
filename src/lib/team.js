// Team rules shared by the server functions and the UI. Pure, unit-tested.

// Custom User fields can arrive top-level or under `data`, depending on the call.
export const teamIdOf = (user) => user?.team_id ?? user?.data?.team_id ?? null;
export const teamRoleOf = (user) => user?.team_role ?? user?.data?.team_role ?? null;
export const isOwner = (user) => !!teamIdOf(user) && teamRoleOf(user) === "owner";

// No 0/O, 1/I/L: codes are read aloud and typed from paper.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 8;

export function newInviteCode(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(INVITE_LENGTH);
  let out = "";
  for (let i = 0; i < INVITE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const normalizeInviteCode = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Returns an error message, or null when the action is allowed.
export function checkTeamAction(action, actor, target) {
  const teamId = teamIdOf(actor);
  switch (action) {
    case "create":
    case "join":
      return teamId ? "You're already on a team. Leave it before you create or join another." : null;
    case "leave":
      if (!teamId) return "You're not on a team.";
      return isOwner(actor) ? "Team owners can't leave. Remove the other members first, or ask support to transfer ownership." : null;
    case "manage":
      return isOwner(actor) ? null : "Only the team owner can do that.";
    case "remove": {
      if (!isOwner(actor)) return "Only the team owner can remove members.";
      if (!target || teamIdOf(target) !== teamId) return "That person isn't on your team.";
      if (target.id === actor.id) return "You can't remove yourself.";
      return null;
    }
    default:
      return "Unknown action.";
  }
}

const flag = (u, name) => !!(u?.[name] ?? u?.data?.[name]);
const legacy = (u) => ["perm_read", "perm_write", "perm_edit"].every((n) => (u?.[n] ?? u?.data?.[n]) == null);

export function memberView(u) {
  const role = teamRoleOf(u) || "member";
  const all = role === "owner";
  return {
    id: u.id,
    name: u.full_name || u.email || "Unnamed user",
    email: u.email || "",
    role,
    perms: legacy(u) && !all
      ? { view: true, read: true, write: true, edit: false }
      : { view: true, read: all || flag(u, "perm_read"), write: all || flag(u, "perm_write"), edit: all || flag(u, "perm_edit") },
  };
}
