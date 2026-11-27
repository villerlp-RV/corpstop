// Service-line detail beyond the four LCRI categories, per 40 CFR 141.84(a):
// - the specific material of a non-lead line (systems "may use the material
//   (e.g., plastic or copper) as an alternative to categorizing it as Non-Lead"),
// - each portion of a line where ownership is shared (system side, customer side),
// - the connector (gooseneck, pigtail): Lead, Non-Lead, Unknown or No connector present.
import { MATERIALS, materialOf } from "./lcri.js";

export const NON_LEAD_TYPES = [
  { value: "copper", label: "Copper", short: "Copper" },
  { value: "plastic", label: "Plastic (PVC, PE, PEX)", short: "Plastic" },
  { value: "galvanized", label: "Galvanized, never downstream of lead", short: "Galvanized (not GRR)" },
  { value: "iron", label: "Ductile or cast iron", short: "Iron" },
  { value: "brass", label: "Brass or bronze", short: "Brass" },
  { value: "other", label: "Other non-lead", short: "Other non-lead" },
];

export const CONNECTORS = [
  { value: "lead", label: "Lead" },
  { value: "non_lead", label: "Non-lead" },
  { value: "unknown", label: "Unknown" },
  { value: "none", label: "No connector present" },
];

const MATERIAL_VALUES = MATERIALS.map((m) => m.value);
const RANK = { lead: 0, grr: 1, unknown: 2, non_lead: 3 };

// A line is as bad as its worst portion: any lead portion makes it a lead
// service line; otherwise GRR, then unknown; non-lead only if both sides are.
export function combineSides(systemSide, customerSide) {
  const sides = [systemSide, customerSide].map((s) => (MATERIAL_VALUES.includes(s) ? s : "unknown"));
  return sides.sort((a, b) => RANK[a] - RANK[b])[0];
}

export const typeOf = (v) => NON_LEAD_TYPES.find((t) => t.value === v) || null;
export const connectorOf = (v) => CONNECTORS.find((c) => c.value === v) || null;
export const isSplit = (line) => line?.ownership === "split";

// Normalise what someone entered into the line fields to save.
// input: { material, material_type, ownership, system_side, customer_side, connector }
export function lineFields(input) {
  const split = input.ownership === "split";
  let material = input.material;
  if (split) {
    if (!MATERIAL_VALUES.includes(input.system_side) || !MATERIAL_VALUES.includes(input.customer_side)) {
      return { error: "Choose the material on both the system side and the customer side." };
    }
    material = combineSides(input.system_side, input.customer_side);
  } else if (!MATERIAL_VALUES.includes(material)) {
    return { error: "Choose the material." };
  }
  const nonLeadOnly = split ? input.customer_side === "non_lead" || input.system_side === "non_lead" : material === "non_lead";
  return {
    fields: {
      material,
      material_type: nonLeadOnly && typeOf(input.material_type) ? input.material_type : null,
      ownership: split ? "split" : "single",
      system_side: split ? input.system_side : null,
      customer_side: split ? input.customer_side : null,
      connector: connectorOf(input.connector) ? input.connector : null,
    },
  };
}

// "Non-lead · Copper", "Lead · split: system Lead, customer Non-lead"
export function materialDetail(line) {
  const parts = [];
  const t = typeOf(line?.material_type);
  if (t) parts.push(t.short);
  if (isSplit(line)) parts.push(`system ${materialOf(line.system_side).label.toLowerCase()}, customer ${materialOf(line.customer_side).label.toLowerCase()}`);
  return parts.join(" · ");
}

export const materialText = (line) => [materialOf(line?.material).label, materialDetail(line)].filter(Boolean).join(" · ");
export const connectorText = (line) => connectorOf(line?.connector)?.label || "Not recorded";

export function connectorTally(lines) {
  const t = { lead: 0, non_lead: 0, unknown: 0, none: 0, not_recorded: 0 };
  for (const l of lines) t[connectorOf(l.connector) ? l.connector : "not_recorded"]++;
  return t;
}

export function connectorSummary(lines) {
  const t = connectorTally(lines);
  const parts = CONNECTORS.filter((c) => t[c.value]).map((c) => `${t[c.value]} ${c.label.toLowerCase()}`);
  if (t.not_recorded) parts.push(`${t.not_recorded} not recorded`);
  return parts.join(" · ") || "None on file";
}
