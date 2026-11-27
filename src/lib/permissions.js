// Team permissions: View (everyone), Read, Write, Edit, plus Admin for the
// team owner. Personal accounts and team owners can do everything.
import { isOwner, teamIdOf } from "./team.js";

export const PERMISSIONS = [
  { key: "view", label: "View", desc: "See systems, service lines, field work and notices.", always: true },
  { key: "read", label: "Read", desc: "Download reports, replacement plans and exports." },
  { key: "write", label: "Write", desc: "Add systems, lines and notice batches; record visits on lines assigned to them." },
  { key: "edit", label: "Edit", desc: "Change or delete existing records, assign field work and add photos." },
];

// What a new member gets when they join with an invite code.
export const DEFAULT_MEMBER = { read: true, write: true, edit: false };

const flag = (user, name) => !!(user?.[name] ?? user?.data?.[name]);

export function permissionsOf(user) {
  if (!user) return { view: false, read: false, write: false, edit: false, admin: false };
  if (!teamIdOf(user) || isOwner(user)) return { view: true, read: true, write: true, edit: true, admin: true };
  return { view: true, read: flag(user, "perm_read"), write: flag(user, "perm_write"), edit: flag(user, "perm_edit"), admin: false };
}

export const permFields = ({ read, write, edit }) => ({ perm_read: !!read, perm_write: !!write, perm_edit: !!edit });

export function permissionCode(p) {
  return ["R", "W", "E", "V"].filter((l) => ({ R: p.read, W: p.write, E: p.edit, V: p.view })[l]).join("") || "—";
}
