// What goes into a PDF report. Pure functions (no PDF library), unit-tested;
// src/lib/report-pdf.js draws the result.
import { READINESS, checklist, counts, fmt, formatDate, noticeCurrent, portfolioSummary, readiness, replacementPool, totalLines, unknownShare, yearOneTarget } from "./lcri.js";
import { materialOf } from "./lcri.js";
import { photosOf } from "./fieldwork.js";

export function addressLines(profile) {
  if (!profile) return [];
  const cityLine = [profile.city, [profile.state, profile.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [profile.address_line1, profile.address_line2, cityLine].map((s) => (s || "").trim()).filter(Boolean);
}

export function contactLine(profile) {
  if (!profile) return "";
  return [profile.phone, profile.email, profile.website].map((s) => (s || "").trim()).filter(Boolean).join("  ·  ");
}

export function letterhead(profile) {
  return {
    name: profile?.business_name?.trim() || "",
    address: addressLines(profile),
    contact: contactLine(profile),
    license: profile?.license_number?.trim() ? `License / certification: ${profile.license_number.trim()}` : "",
    logo: profile?.logo_data || null,
  };
}

const date = (d) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const pct = (x) => `${Math.round(x * 100)}%`;
const slug = (s) => String(s || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "report";
const iso = (d) => d.toISOString().slice(0, 10);

const MATERIAL_ORDER = { lead: 0, grr: 1, unknown: 2, non_lead: 3 };

export function systemReport(system, lines, profile, { now = new Date(), preparedBy = "" } = {}) {
  const c = counts(system);
  const t = totalLines(system);
  const status = readiness(system, now);
  const sortedLines = [...lines].sort((a, b) => (MATERIAL_ORDER[a.material] ?? 9) - (MATERIAL_ORDER[b.material] ?? 9) || a.address.localeCompare(b.address));
  const visited = lines.filter((l) => l.assignment_status === "done").length;
  return {
    kind: "system",
    filename: `${slug(system.name)}-lcri-report-${iso(now)}.pdf`,
    letterhead: letterhead(profile),
    title: "Lead Service Line Compliance Report",
    subtitle: system.name,
    meta: [
      ["Water system", system.name],
      ["PWS ID", system.pwsid || "—"],
      ["State", system.state || "—"],
      ["Population served", system.population ? fmt(system.population) : "—"],
      ["Field contact", system.field_tech || "—"],
      ["Report date", date(now)],
      ...(preparedBy ? [["Prepared by", preparedBy]] : []),
    ],
    status: { label: READINESS[status].label, key: status },
    tiles: [
      ["Service lines", fmt(t)],
      ["Lead", fmt(c.lead)],
      ["Galvanized (GRR)", fmt(c.grr)],
      ["Unknown", `${fmt(c.unknown)} (${pct(unknownShare(system))})`],
      ["Non-lead", fmt(c.nonLead)],
    ],
    checklist: checklist(system, now).map((i) => ({ label: i.label, detail: i.detail, done: i.done })),
    pace: [
      ["Replacement pool (lead + GRR + unknown)", fmt(replacementPool(system))],
      ["Year-1 replacement target (10%)", fmt(yearOneTarget(system))],
      ["Replacements scheduled", fmt(system.replacements_scheduled || 0)],
    ],
    lines: {
      columns: ["Address", "Material", "How identified", "Verified", "Field visit", "Photos"],
      widths: [0.25, 0.11, 0.17, 0.18, 0.19, 0.1],
      rows: sortedLines.map((l) => [
        l.address,
        materialOf(l.material).label,
        l.identification_method || "—",
        [l.verified_date ? formatDate(l.verified_date) : "", l.verified_by || ""].filter(Boolean).join(" · ") || "—",
        l.assignment_status === "done" ? `Recorded · ${l.assigned_to_name || ""}`.trim() : l.assignment_status === "open" ? `Open · ${l.assigned_to_name || ""}`.trim() : "—",
        photosOf(l).length ? String(photosOf(l).length) : "—",
      ]),
      note: `${fmt(lines.length)} service lines on file of ${fmt(t)} in the inventory. ${fmt(visited)} recorded in the field.`,
    },
    notes: sortedLines.filter((l) => l.field_notes).map((l) => [l.address, l.field_notes]),
    disclaimer: "Readiness and targets are planning aids based on the inventory recorded in LineTally, not compliance advice. Confirm requirements with your state primacy agency.",
  };
}

export function portfolioReport(systems, profile, { now = new Date(), preparedBy = "" } = {}) {
  const s = portfolioSummary(systems, now);
  const sorted = [...systems].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  return {
    kind: "portfolio",
    filename: `portfolio-lcri-report-${iso(now)}.pdf`,
    letterhead: letterhead(profile),
    title: "LCRI Portfolio Readiness Report",
    subtitle: `${s.systems} water ${s.systems === 1 ? "system" : "systems"} in ${new Set(systems.map((x) => x.state)).size} ${new Set(systems.map((x) => x.state)).size === 1 ? "state" : "states"}`,
    meta: [["Report date", date(now)], ["Compliance date", "1 November 2027"], ...(preparedBy ? [["Prepared by", preparedBy]] : [])],
    tiles: [
      ["Service lines", fmt(s.lines)],
      ["Unknown material", pct(s.unknownShare)],
      ["Replacement pool", fmt(s.pool)],
      ["Notices not current", fmt(s.noticesDue)],
      ["Behind or at risk", fmt(s.attention)],
    ],
    systems: {
      columns: ["System", "PWS ID", "Readiness", "Lines", "Lead", "GRR", "Unknown", "Y1 target", "Plan", "Notice"],
      widths: [0.22, 0.11, 0.1, 0.07, 0.07, 0.06, 0.1, 0.08, 0.08, 0.11],
      rows: sorted.map((x) => {
        const c = counts(x);
        return [
          x.name, x.pwsid || "—", READINESS[readiness(x, now)].label, fmt(totalLines(x)), fmt(c.lead), fmt(c.grr),
          `${fmt(c.unknown)} (${pct(unknownShare(x))})`, fmt(yearOneTarget(x)), x.plan_drafted ? "Drafted" : "Missing",
          noticeCurrent(x, now) ? formatDate(x.last_notice_date) : "Due",
        ];
      }),
    },
    disclaimer: "Readiness and targets are planning aids based on the inventory recorded in LineTally, not compliance advice. Confirm requirements with your state primacy agency.",
  };
}
