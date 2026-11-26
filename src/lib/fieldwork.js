// Field assignments: office staff assign service lines to a team member, who
// records what they find from a phone. Pure functions, unit-tested.

export const FIELD_MATERIALS = ["lead", "grr", "non_lead"];

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
  if (!FIELD_MATERIALS.includes(input.material)) return { error: "Choose the material you found." };
  if (!input.method) return { error: "Choose how you identified it." };
  const notes = String(input.notes || "").trim().slice(0, 1000);
  const p = (n) => String(n).padStart(2, "0");
  return {
    patch: {
      material: input.material,
      identification_method: input.method,
      verified_date: `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`,
      verified_by: user?.full_name || user?.email || "",
      field_notes: notes || null,
      ...(input.photo_uri ? { photo_uri: input.photo_uri } : {}),
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
