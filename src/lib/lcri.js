// LCRI (Lead and Copper Rule Improvements) calculations. No React, no SDK:
// everything here is pure so it can be unit-tested with `npm test`.
//
// Counts live on the WaterSystem record (inventory totals). Identifying an
// unknown service line moves one count from `unknown_count` to the material
// found, so the totals and the line records stay in step.

export const LCRI_DEADLINE = new Date("2027-11-01T00:00:00");

// Year-1 target: 10% of the replacement pool (lead + GRR + unknown lines).
// Confirm against the rule text (40 CFR 141.84) before relying on it.
export const REPLACEMENT_RATE = 0.1;

export const MATERIALS = [
  { value: "lead", label: "Lead", cls: "m-lead", field: "lead_count" },
  { value: "grr", label: "GRR", long: "Galvanized requiring replacement (GRR)", cls: "m-grr", field: "grr_count" },
  { value: "unknown", label: "Unknown", cls: "m-unk", field: "unknown_count" },
  { value: "non_lead", label: "Non-lead", cls: "m-ok", field: "nonlead_count" },
];

export const ID_METHODS = ["Visual (curb stop)", "Potholing", "Customer photo", "Tap card", "Records review"];

export const materialOf = (value) => MATERIALS.find((m) => m.value === value) || MATERIALS[2];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function counts(s) {
  return {
    lead: num(s.lead_count),
    grr: num(s.grr_count),
    unknown: num(s.unknown_count),
    nonLead: num(s.nonlead_count),
  };
}

export function totalLines(s) {
  const c = counts(s);
  return c.lead + c.grr + c.unknown + c.nonLead;
}

export function replacementPool(s) {
  const c = counts(s);
  return c.lead + c.grr + c.unknown;
}

export const yearOneTarget = (s) => Math.ceil(replacementPool(s) * REPLACEMENT_RATE);

export function unknownShare(s) {
  const t = totalLines(s);
  return t ? counts(s).unknown / t : 0;
}

export function daysSince(isoDate, now = new Date()) {
  if (!isoDate) return Infinity;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return Infinity;
  return (now - d) / 864e5;
}

export const noticeCurrent = (s, now = new Date()) => daysSince(s.last_notice_date, now) < 365;

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function checklist(s, now = new Date()) {
  const share = unknownShare(s);
  return [
    {
      key: "unknowns",
      label: "Unknown lines identified",
      detail: `${Math.round((1 - share) * 100)}% of lines have a known material (goal: 95%)`,
      done: totalLines(s) > 0 && share <= 0.05,
    },
    { key: "connectors", label: "Lead connectors inventoried", detail: "Required in the baseline inventory", done: !!s.connectors_inventoried },
    { key: "plan", label: "Replacement plan drafted", detail: "Due with the baseline inventory", done: !!s.plan_drafted },
    {
      key: "notice",
      label: "Annual notice sent (last 12 months)",
      detail: s.last_notice_date ? `Last sent ${formatDate(s.last_notice_date)}` : "Never sent",
      done: noticeCurrent(s, now),
    },
  ];
}

export const READINESS = {
  ready: { label: "Ready", cls: "pill--ready" },
  on_track: { label: "On track", cls: "pill--track" },
  at_risk: { label: "At risk", cls: "pill--risk" },
  behind: { label: "Behind", cls: "pill--behind" },
};

export function readiness(s, now = new Date()) {
  const done = checklist(s, now).filter((c) => c.done).length;
  const share = unknownShare(s);
  if (done === 4) return "ready";
  if (share > 0.25 && done <= 1) return "behind";
  if (done >= 3 || share <= 0.1) return "on_track";
  return "at_risk";
}

export const needsAttention = (s, now) => ["behind", "at_risk"].includes(readiness(s, now));
export const readyToFile = (s) => !!s.connectors_inventoried && !!s.plan_drafted;
export const daysToDeadline = (now = new Date()) => Math.ceil((LCRI_DEADLINE - now) / 864e5);

export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const fmt = (n) => num(n).toLocaleString("en-US");

// Count changes when a line moves from one material to another.
export function countsAfterChange(system, fromMaterial, toMaterial) {
  if (fromMaterial === toMaterial) return {};
  const from = materialOf(fromMaterial).field;
  const to = materialOf(toMaterial).field;
  return { [from]: Math.max(0, num(system[from]) - 1), [to]: num(system[to]) + 1 };
}

export function portfolioSummary(systems, now = new Date()) {
  let lines = 0;
  let unknown = 0;
  let pool = 0;
  let noticesDue = 0;
  let attention = 0;
  for (const s of systems) {
    lines += totalLines(s);
    unknown += counts(s).unknown;
    pool += replacementPool(s);
    if (!noticeCurrent(s, now)) noticesDue += 1;
    if (needsAttention(s, now)) attention += 1;
  }
  return { systems: systems.length, lines, unknown, unknownShare: lines ? unknown / lines : 0, pool, noticesDue, attention };
}

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function stateCsv(systems) {
  const header = ["pwsid", "system_name", "population", "lines_total", "lead", "grr", "unknown", "non_lead", "connectors_inventoried", "replacement_plan", "year1_target"];
  const rows = systems.map((s) => {
    const c = counts(s);
    return [s.pwsid, s.name, num(s.population), totalLines(s), c.lead, c.grr, c.unknown, c.nonLead, s.connectors_inventoried ? "Y" : "N", s.plan_drafted ? "Y" : "N", yearOneTarget(s)];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

// ---------- Example data (flagged is_example so it can be removed) ----------

const STREETS = ["Maple St", "Mill Rd", "Church St", "N 3rd Ave", "Railroad St", "Oak Ln", "Main St", "Water St", "Depot Rd", "Elm Ct", "Hill St", "River Rd"];
const METHODS = ["Tap card", "Visual (curb stop)", "Potholing", "Customer photo"];

export const EXAMPLE_SYSTEMS = [
  { key: "cedar", name: "Cedar Hollow Water District", state: "OH", pwsid: "OH2140117", population: 1240, lead_count: 38, grr_count: 22, unknown_count: 131, nonlead_count: 312, connectors_inventoried: true, plan_drafted: false, last_notice_date: "2026-03-12", field_tech: "D. Alvarez" },
  { key: "bluff", name: "Pine Bluff Village", state: "OH", pwsid: "OH2140342", population: 860, lead_count: 12, grr_count: 5, unknown_count: 24, nonlead_count: 301, connectors_inventoried: true, plan_drafted: true, last_notice_date: "2026-02-20", field_tech: "D. Alvarez" },
  { key: "harlan", name: "Harlan Mobile Home Park", state: "OH", pwsid: "OH2141906", population: 310, lead_count: 0, grr_count: 0, unknown_count: 61, nonlead_count: 44, connectors_inventoried: false, plan_drafted: false, last_notice_date: null, field_tech: "K. Moss" },
  { key: "stone", name: "Stoneford Borough Authority", state: "PA", pwsid: "PA3060088", population: 2890, lead_count: 142, grr_count: 61, unknown_count: 208, nonlead_count: 704, connectors_inventoried: true, plan_drafted: true, last_notice_date: "2026-04-02", field_tech: "R. Patel" },
  { key: "kettle", name: "Kettle Run Municipal Authority", state: "PA", pwsid: "PA3060471", population: 1720, lead_count: 66, grr_count: 30, unknown_count: 96, nonlead_count: 455, connectors_inventoried: false, plan_drafted: false, last_notice_date: "2025-11-30", field_tech: "R. Patel" },
  { key: "mesa", name: "Mesa Verde WSC", state: "TX", pwsid: "TX1010455", population: 3120, lead_count: 9, grr_count: 40, unknown_count: 286, nonlead_count: 812, connectors_inventoried: false, plan_drafted: false, last_notice_date: null, field_tech: "J. Okafor" },
  { key: "prairie", name: "Prairie Glen Water Co.", state: "IL", pwsid: "IL0310450", population: 1980, lead_count: 118, grr_count: 24, unknown_count: 77, nonlead_count: 401, connectors_inventoried: true, plan_drafted: false, last_notice_date: "2026-01-15", field_tech: "D. Alvarez" },
];

function hashOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// Sample service lines for an example system. They illustrate the inventory
// totals already on the system, so creating them does not change its counts.
// The first three are unknown so field verification has something to act on.
export function exampleLines(sys, systemId, perSystem = 10) {
  let h = hashOf(sys.key);
  const tot = sys.lead_count + sys.grr_count + sys.unknown_count + sys.nonlead_count;
  const pools = [["lead", sys.lead_count], ["grr", sys.grr_count], ["unknown", sys.unknown_count], ["non_lead", sys.nonlead_count]];
  const out = [];
  for (let k = 0; k < perSystem; k++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const r = ((h % 1000) / 1000) * tot;
    let acc = 0;
    let material = "non_lead";
    for (const [m, c] of pools) {
      acc += c;
      if (r < acc) {
        material = m;
        break;
      }
    }
    if (k < 3 && sys.unknown_count > 0) material = "unknown";
    out.push({
      system_id: systemId,
      address: `${100 + ((h >>> 8) % 880)} ${STREETS[(h >>> 4) % STREETS.length]}`,
      material,
      identification_method: material === "unknown" ? "" : METHODS[(h >>> 3) % METHODS.length],
      // Connector and specific non-lead material, as a field visit would record them.
      ...(material === "unknown" ? {} : { connector: material === "lead" ? "lead" : ["none", "non_lead", "none", "lead"][(h >>> 5) % 4] }),
      ...(material === "non_lead" ? { material_type: ["copper", "plastic", "copper", "iron"][(h >>> 6) % 4] } : {}),
      is_example: true,
    });
  }
  return out;
}

// Ten-year replacement schedule from the compliance date: an average of 10% of
// the replacement pool per year, cumulative, rounded up. Confirm deferred
// deadlines or a different pace with the state before relying on it.
export function replacementSchedule(pool, startYear = 2027, years = 10) {
  const n = Math.max(0, Math.round(Number(pool) || 0));
  const rows = [];
  let prev = 0;
  for (let k = 1; k <= years; k++) {
    const cumulative = Math.min(n, Math.ceil(n * REPLACEMENT_RATE * k - 1e-9));
    rows.push({
      year: k,
      from: `Nov 1, ${startYear + k - 1}`,
      to: `Oct 31, ${startYear + k}`,
      annual: cumulative - prev,
      cumulative,
      percent: n ? Math.round((cumulative / n) * 100) : 0,
    });
    prev = cumulative;
  }
  return rows;
}
