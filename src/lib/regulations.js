export const STATUSES = [
  { id: "monitor", label: "Monitor", tone: "bg-slate-400" },
  { id: "assess", label: "Assess", tone: "bg-sky-400" },
  { id: "action_required", label: "Action required", tone: "bg-rose-400" },
  { id: "in_progress", label: "In progress", tone: "bg-amber-400" },
  { id: "compliant", label: "Compliant", tone: "bg-brand" },
  { id: "not_applicable", label: "Not applicable", tone: "bg-zinc-300" },
];

export const STATUS_BADGE = {
  monitor: "bg-slate-100 text-slate-700",
  assess: "bg-sky-100 text-sky-700",
  action_required: "bg-rose-100 text-rose-700",
  in_progress: "bg-amber-100 text-amber-800",
  compliant: "bg-brand/30 text-foreground",
  not_applicable: "bg-zinc-100 text-zinc-600",
};

export const RISKS = [
  { id: "low", label: "Low", tone: "bg-emerald-100 text-emerald-700" },
  { id: "medium", label: "Medium", tone: "bg-amber-100 text-amber-800" },
  { id: "high", label: "High", tone: "bg-orange-100 text-orange-800" },
  { id: "critical", label: "Critical", tone: "bg-rose-100 text-rose-700" },
];

export const JURISDICTIONS = [
  { id: "federal", label: "Federal" },
  { id: "state", label: "State" },
  { id: "local", label: "Local" },
  { id: "international", label: "International" },
];

export const INDUSTRIES = [
  { id: "energy", label: "Energy & utilities" },
  { id: "manufacturing", label: "Manufacturing" },
  { id: "construction", label: "Construction & real estate" },
  { id: "agriculture", label: "Agriculture" },
];

export const UPDATE_TYPES = [
  { id: "note", label: "Note" },
  { id: "update", label: "Update" },
  { id: "inspection", label: "Inspection" },
  { id: "filing", label: "Filing" },
];

export function statusMeta(id) {
  return STATUSES.find((item) => item.id === id) || STATUSES[0];
}

export function statusLabel(id) {
  return statusMeta(id).label;
}

export function riskMeta(id) {
  return RISKS.find((item) => item.id === id) || RISKS[1];
}

export function riskLabel(id) {
  return riskMeta(id).label;
}

export function riskTone(id) {
  return riskMeta(id).tone;
}

export function industryLabel(id) {
  return INDUSTRIES.find((item) => item.id === id)?.label || id;
}

export function jurisdictionLabel(id) {
  return JURISDICTIONS.find((item) => item.id === id)?.label || "—";
}

export function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatShortDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function isOverdue(iso) {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export function daysUntil(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}

export function deadlineLabel(iso) {
  if (!iso) return "";
  const days = daysUntil(iso);
  if (days === null) return "";
  if (days < 0) return `Overdue ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  if (days <= 14) return `Due in ${days}d`;
  return formatShortDate(iso);
}

export function isClosed(status) {
  return status === "compliant" || status === "not_applicable";
}