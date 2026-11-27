// Filters for the service-line table and the portfolio. Pure, unit-tested.
import { attachmentsOf } from "./attachments.js";
import { photosOf } from "./fieldwork.js";
import { isSplit } from "./pipes.js";
import { readiness } from "./lcri.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const matchesText = (q, ...fields) => {
  const words = norm(q).split(" ").filter(Boolean);
  const hay = norm(fields.join(" "));
  return words.every((w) => hay.includes(w));
};

export const EMPTY_LINE_FILTER = { q: "", material: "", connector: "", visit: "", has: "" };

export const LINE_FILTER_OPTIONS = {
  connector: [
    ["", "Any connector"], ["lead", "Lead"], ["non_lead", "Non-lead"], ["unknown", "Unknown"], ["none", "No connector"], ["not_recorded", "Not recorded"],
  ],
  visit: [["", "Any field status"], ["open", "Visit open"], ["done", "Recorded in field"], ["unassigned", "Not assigned"]],
  has: [["", "Photos, files, notes"], ["photos", "Has photos"], ["files", "Has files"], ["no_photos", "No photos"], ["split", "Split ownership"], ["notes", "Has field notes"]],
};

export function filterLines(lines, f = EMPTY_LINE_FILTER) {
  return lines.filter((l) => {
    if (f.q && !matchesText(f.q, l.address, l.verified_by, l.assigned_to_name, l.identification_method)) return false;
    if (f.material && l.material !== f.material) return false;
    if (f.connector === "not_recorded" ? !!l.connector : f.connector && l.connector !== f.connector) return false;
    if (f.visit === "open" && l.assignment_status !== "open") return false;
    if (f.visit === "done" && l.assignment_status !== "done") return false;
    if (f.visit === "unassigned" && l.assignment_status) return false;
    if (f.has === "photos" && !photosOf(l).length) return false;
    if (f.has === "no_photos" && photosOf(l).length) return false;
    if (f.has === "files" && !attachmentsOf(l).length) return false;
    if (f.has === "split" && !isSplit(l)) return false;
    if (f.has === "notes" && !l.field_notes) return false;
    return true;
  });
}

export const isFiltered = (f) => Object.values(f).some(Boolean);

export const EMPTY_SYSTEM_FILTER = { q: "", state: "", status: "", attention: false };

export function filterSystems(systems, f = EMPTY_SYSTEM_FILTER, now = new Date()) {
  return systems.filter((s) => {
    if (f.q && !matchesText(f.q, s.name, s.pwsid, s.field_tech, s.state)) return false;
    if (f.state && s.state !== f.state) return false;
    const r = readiness(s, now);
    if (f.status && r !== f.status) return false;
    if (f.attention && !["behind", "at_risk"].includes(r)) return false;
    return true;
  });
}

export const statesOf = (systems) => [...new Set(systems.map((s) => s.state).filter(Boolean))].sort();
