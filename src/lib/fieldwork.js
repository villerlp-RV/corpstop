// Field assignments: office staff assign service lines to a team member, who
// records what they find from a phone. Pure functions, unit-tested.

import { lineFields } from "./pipes.js";
import { addAttachmentsPatch } from "./attachments.js";

export const FIELD_MATERIALS = ["lead", "grr", "non_lead"];
export const MAX_PHOTOS_PER_ENTRY = 5;
const MAX_PHOTOS_PER_LINE = 30;

// Every photo on a line, oldest first (photo_uri is the single-photo field of early records).
export function photosOf(line) {
  const all = [...(line?.photo_uri ? [line.photo_uri] : []), ...(Array.isArray(line?.photo_uris) ? line.photo_uris : [])];
  return [...new Set(all.filter(Boolean))];
}

// Field update that adds new photos to a line, keeping the ones already there.
export function addPhotosPatch(line, newUris) {
  return { photo_uris: [...new Set([...photosOf(line), ...(newUris || []).filter(Boolean)])].slice(-MAX_PHOTOS_PER_LINE) };
}

export function assignPatch(member, assigner, now = new Date()) {
  return {
    assigned_to: member.id,
    assigned_to_name: member.name,
    assigned_by_name: assigner?.full_name || assigner?.email || "",
    assigned_at: now.toISOString(),
    assignment_status: "open",
    completed_at: null,
  };
}

export const unassignPatch = () => ({
  assigned_to: null,
  assigned_to_name: null,
  assigned_by_name: null,
  assigned_at: null,
  assignment_status: null,
});

export const isOpen = (line) => line.assignment_status === "open" && !!line.assigned_to;

// The line update for a field visit. Returns { patch } or { error }.
export function fieldRecordPatch(line, input, user, now = new Date()) {
  const split = input.ownership === "split";
  if (!split && !FIELD_MATERIALS.includes(input.material)) return { error: "Choose the material you found." };
  const detail = lineFields(input);
  if (detail.error) return detail;
  if (split && detail.fields.system_side === "unknown" && detail.fields.customer_side === "unknown") {
    return { error: "Record what you found on at least one side." };
  }
  if (!input.method) return { error: "Choose how you identified it." };
  // A visit that didn't look at the connector leaves what the office recorded.
  const { connector, ...fields } = detail.fields;
  const notes = String(input.notes || "").trim().slice(0, 1000);
  const p = (n) => String(n).padStart(2, "0");
  return {
    patch: {
      ...fields,
      ...(input.connector !== undefined ? { connector } : {}),
      identification_method: input.method,
      verified_date: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
      verified_by: user?.full_name || user?.email || "",
      field_notes: notes || null,
      ...(input.photo_uris?.length ? addPhotosPatch(line, input.photo_uris) : {}),
      ...(input.attachments?.length ? addAttachmentsPatch(line, input.attachments) : {}),
      assignment_status: "done",
      completed_at: now.toISOString(),
    },
  };
}

// Group lines under their system, systems in name order, lines by address.
export function groupBySystem(lines, systems) {
  const byId = new Map(systems.map((s) => [s.id, s]));
  const groups = new Map();
  for (const l of lines) {
    if (!groups.has(l.system_id)) groups.set(l.system_id, { system: byId.get(l.system_id) || { id: l.system_id, name: "Unknown system" }, lines: [] });
    groups.get(l.system_id).lines.push(l);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, lines: g.lines.sort((a, b) => a.address.localeCompare(b.address)) }))
    .sort((a, b) => a.system.name.localeCompare(b.system.name));
}

// Open and done counts per assignee, for the office view.
export function workloadByMember(lines) {
  const out = new Map();
  for (const l of lines) {
    if (!l.assigned_to) continue;
    const row = out.get(l.assigned_to) || { id: l.assigned_to, name: l.assigned_to_name || "Unknown", open: 0, done: 0 };
    if (l.assignment_status === "done") row.done += 1;
    else if (l.assignment_status === "open") row.open += 1;
    out.set(l.assigned_to, row);
  }
  return [...out.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}
