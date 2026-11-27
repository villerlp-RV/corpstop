// What goes into a PDF report. Pure functions (no PDF library), unit-tested;
// src/lib/report-pdf.js draws the result.
import { READINESS, checklist, counts, fmt, formatDate, noticeCurrent, portfolioSummary, readiness, replacementPool, replacementSchedule, totalLines, unknownShare, yearOneTarget } from "./lcri.js";
import { connectorOf, connectorSummary, materialText } from "./pipes.js";
import { materialOf } from "./lcri.js";
import { photosOf } from "./fieldwork.js";
import { attachmentsOf } from "./attachments.js";

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
      columns: ["Address", "Material", "Connector", "How identified", "Verified", "Field visit"],
      widths: [0.19, 0.18, 0.13, 0.17, 0.15, 0.18],
      rows: sortedLines.map((l) => [
        l.address,
        materialText(l),
        connectorOf(l.connector)?.label || "—",
        l.identification_method || "—",
        [l.verified_date ? formatDate(l.verified_date) : "", l.verified_by || ""].filter(Boolean).join(" · ") || "—",
        [
          l.assignment_status === "done" ? `Recorded · ${l.assigned_to_name || ""}`.trim() : l.assignment_status === "open" ? `Open · ${l.assigned_to_name || ""}`.trim() : "",
          photosOf(l).length ? `${photosOf(l).length} ${photosOf(l).length === 1 ? "photo" : "photos"}` : "",
          attachmentsOf(l).length ? `${attachmentsOf(l).length} ${attachmentsOf(l).length === 1 ? "file" : "files"}` : "",
        ].filter(Boolean).join(" · ") || "—",
      ]),
      note: `${fmt(lines.length)} service lines on file of ${fmt(t)} in the inventory. ${fmt(visited)} recorded in the field. Connectors on file: ${connectorSummary(lines)}. Split-ownership lines take the category of their worst portion.`,
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

// ---------- Service line replacement plan (40 CFR 141.84(c)) ----------
// A draft built from the system's data: required elements (i)-(x) in order,
// with suggested wording where LineTally can supply it and "To complete"
// prompts for decisions only the water system can make.
export function replacementPlan(system, lines, profile, { now = new Date(), preparedBy = "" } = {}) {
  const c = counts(system);
  const pool = replacementPool(system);
  const known = c.lead + c.grr;
  const schedule = replacementSchedule(pool);
  const verified = lines.filter((l) => l.verified_date || l.assignment_status === "done").length;
  const operator = profile?.business_name?.trim() || "the water system's operator";
  const ordered = [...lines]
    .filter((l) => ["lead", "grr", "unknown"].includes(l.material))
    .sort((a, b) => (MATERIAL_ORDER[a.material] ?? 9) - (MATERIAL_ORDER[b.material] ?? 9) || a.address.localeCompare(b.address));

  const sections = [
    {
      title: "System and inventory summary",
      paragraphs: [
        `${system.name} (PWS ID ${system.pwsid || "—"}, ${system.state || "—"}) serves about ${system.population ? fmt(system.population) : "—"} people. The service line inventory currently records ${fmt(totalLines(system))} service lines: ${fmt(c.lead)} lead, ${fmt(c.grr)} galvanized requiring replacement (GRR), ${fmt(c.unknown)} lead status unknown and ${fmt(c.nonLead)} non-lead.`,
        `The replacement pool (lead + GRR + lead status unknown, per § 141.84(d)(6)(i)) is ${fmt(pool)} service lines. Unknown lines identified as non-lead are subtracted from the pool; unknown lines identified as lead or GRR stay in it.`,
      ],
    },
    {
      cite: "§ 141.84(c)(1)(i)",
      title: "Strategy for identifying lead status unknown service lines",
      paragraphs: [
        `${fmt(c.unknown)} service lines (${pct(unknownShare(system))} of the inventory) are lead status unknown. ${system.name} will identify their material through field verification recorded in LineTally: visual inspection at the curb stop, potholing, customer-submitted photos, tap cards and records review. ${fmt(verified)} service lines on file have been verified so far.`,
        "Unknown lines are scheduled for verification ahead of replacement work in the same area, so crews can replace confirmed lead or GRR lines in the same mobilization.",
      ],
      complete: ["Methods approved by the State for this system, and any it does not accept.", "Target date to resolve all unknown lines."],
    },
    {
      cite: "§ 141.84(c)(1)(ii)",
      title: "Standard operating procedure for full service line replacement",
      paragraphs: [
        "Replacements will be full service line replacements of both the system-owned and customer-owned portions. Partial replacements will be avoided except in emergencies or where full replacement is not possible, and then handled as required by § 141.84(h).",
      ],
      complete: ["Replacement techniques to be used (for example open trench, pipe bursting, directional boring) and when each applies.", "Crews or contractors, and how work is inspected and recorded.", "Steps for gooseneck, pigtail and connector replacement."],
    },
    {
      cite: "§ 141.84(c)(1)(iii)",
      title: "Communication before full or partial replacement",
      paragraphs: [
        "Consumers and customers at each address will be notified before a full or partial lead or GRR service line replacement, with the information and mitigation measures required by § 141.84(h).",
      ],
      complete: ["How and how far in advance notice is given (door hanger, letter, phone, text).", "Languages used and how renters and tenants are reached."],
    },
    {
      cite: "§ 141.84(c)(1)(iv)",
      title: "Flushing procedure after disturbance or replacement",
      paragraphs: [
        "After a lead, GRR or lead status unknown service line is disturbed, or a lead or GRR line is fully or partially replaced, consumers will receive instructions to flush service lines and premise plumbing of particulate lead, in accordance with § 141.85(f) and § 141.84(h).",
      ],
      complete: ["The flushing instructions given to consumers (which taps, how long, and when)."],
    },
    {
      cite: "§ 141.84(c)(1)(v)",
      title: "Prioritization strategy",
      paragraphs: [
        `Proposed order: known lead service lines first (${fmt(c.lead)}), then GRR service lines (${fmt(c.grr)}), then unknown lines as they are identified as lead or GRR. Within each group, priority goes to community-specific factors such as populations disproportionately impacted by lead and populations most sensitive to its effects.`,
      ],
      complete: ["Locations to prioritize: schools, child care facilities, health care facilities, and neighborhoods with disadvantaged or highly exposed populations.", "How replacements are grouped geographically to reduce cost."],
    },
    {
      cite: "§ 141.84(c)(1)(vi)",
      title: "Funding strategy",
      paragraphs: [`Estimated replacements: ${fmt(pool)} over the program (${fmt(schedule[0]?.annual || 0)} in year 1).`],
      complete: [
        "Funding sources (for example rates, Drinking Water State Revolving Fund, grants, loans) and estimated cost per replacement.",
        "Whether customers are charged for any portion of the line under State or local law or tariff, and if so how customers unable to pay are assisted.",
      ],
    },
    {
      cite: "§ 141.84(c)(1)(vii)",
      title: "Communication about the replacement plan and program",
      paragraphs: [
        "Residential and non-residential customers and consumers, including property owners, renters and tenants, will be informed about this plan and program. The plan will be made accessible to the public as required by § 141.84(c)(2).",
      ],
      complete: ["Channels used (bill inserts, website, public meetings, annual notices) and where the plan can be viewed."],
    },
    {
      cite: "§ 141.84(c)(1)(viii)",
      title: "Laws, regulations and tariff provisions affecting access",
      paragraphs: ["No provisions are listed yet."],
      complete: ["Citations to any State or local laws, regulations or water tariff provisions that affect access to private property for full replacement.", "Any that require customer consent, or require or authorize customer cost-sharing."],
    },
    {
      cite: "§ 141.84(c)(1)(ix)",
      title: "Lead-lined galvanized service lines",
      paragraphs: ["Applies only if the inventory identifies lead-lined galvanized service lines. If it does, they are categorized as lead."],
      complete: ["If applicable: the strategy to determine how widely lead-lined galvanized lines are used in the distribution system."],
    },
    {
      cite: "§ 141.84(c)(1)(x)",
      title: "Deferred deadline (only if eligible and used)",
      paragraphs: ["Default schedule: replacement of all lead and GRR service lines over 10 years from the compliance date, with a cumulative average replacement rate of at least 10% each program year (§ 141.84(d)(5)). The schedule below shows the minimum cumulative replacements to keep that pace."],
      complete: ["If using a deferred deadline: documentation of eligibility (10% of known lead and GRR lines exceeds 39 annual replacements per 1,000 service connections), the deferred deadline and rate, and why a faster rate is not feasible."],
    },
  ];

  return {
    kind: "plan",
    filename: `${slug(system.name)}-service-line-replacement-plan-draft-${iso(now)}.pdf`,
    letterhead: letterhead(profile),
    title: "Service Line Replacement Plan · Draft",
    subtitle: system.name,
    meta: [
      ["Water system", system.name],
      ["PWS ID", system.pwsid || "—"],
      ["State", system.state || "—"],
      ["Operator", operator],
      ["Draft date", date(now)],
      ...(preparedBy ? [["Prepared by", preparedBy]] : []),
    ],
    tiles: [
      ["Replacement pool", fmt(pool)],
      ["Known lead + GRR", fmt(known)],
      ["Lead status unknown", fmt(c.unknown)],
      ["Year-1 replacements", fmt(schedule[0]?.annual || 0)],
      ["Complete by", schedule.at(-1) ? `Oct ${schedule.at(-1).to.slice(-4)}` : "—"],
    ],
    sections,
    schedule: {
      columns: ["Program year", "Period", "In year", "Cumulative", "% of pool"],
      widths: [0.16, 0.34, 0.18, 0.16, 0.16],
      rows: schedule.map((r) => [`Year ${r.year}`, `${r.from} – ${r.to}`, fmt(r.annual), fmt(r.cumulative), `${r.percent}%`]),
    },
    priority: {
      columns: ["Priority", "Address", "Material", "Status"],
      widths: [0.12, 0.44, 0.2, 0.24],
      rows: ordered.slice(0, 60).map((l, i) => [String(i + 1), l.address, materialOf(l.material).label, l.assignment_status === "open" ? `Field visit open · ${l.assigned_to_name || ""}`.trim() : "—"]),
      note: ordered.length > 60 ? `Showing the first 60 of ${fmt(ordered.length)} lead, GRR and unknown lines on file.` : `${fmt(ordered.length)} lead, GRR and unknown lines on file, in proposed order.`,
    },
    closing: [
      "Make this plan accessible to the public (online if the system serves more than 50,000 people), per § 141.84(c)(2).",
      "Update it annually with any new information and submit the update to the State, or certify that there are no updates, per § 141.84(c)(3).",
    ],
    disclaimer: "Draft generated by LineTally from the system's inventory. It is a starting point, not compliance advice: complete every \"To complete\" item, check it against 40 CFR 141.84 and your State's requirements, and have it approved before submitting.",
  };
}
