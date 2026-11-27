// Compliance dashboard: deadlines, pace and activity across every system.
// Pure functions over systems and their service lines, unit-tested.
// Planning aids only; the state primacy agency decides what applies.
import {
  LCRI_DEADLINE, REPLACEMENT_RATE, checklist, counts, formatDate, replacementPool, todayIso, totalLines, unknownShare,
} from "./lcri.js";
import { workloadByMember } from "./fieldwork.js";

const DAY = 864e5;
export const KNOWN_GOAL = 0.95; // LineTally readiness goal, not a rule requirement
export const DUE_SOON_DAYS = 60;
const DEADLINE_ISO = "2027-11-01";

const iso = (d) => todayIso(d);
const addDays = (isoDate, n) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const daysUntil = (isoDate, now) => Math.ceil((new Date(`${isoDate}T00:00:00`) - new Date(`${iso(now)}T00:00:00`)) / DAY);

export function deadlineStatus(isoDate, done, now = new Date()) {
  if (done) return "done";
  const d = daysUntil(isoDate, now);
  if (d < 0) return "overdue";
  if (d <= DUE_SOON_DAYS) return "due_soon";
  return "upcoming";
}

export const STATUS_LABEL = { done: "Done", overdue: "Overdue", due_soon: "Due soon", upcoming: "Upcoming", on_pace: "On pace", behind: "Behind", not_started: "Starts Nov 1, 2027", no_unknowns: "No unknowns left" };

// Program years run Nov 1 – Oct 31 from the compliance date. 0 before it starts.
export function programYear(now = new Date()) {
  if (now < LCRI_DEADLINE) return 0;
  const y = now.getFullYear() - 2027 + (now.getMonth() >= 10 ? 1 : 0);
  return Math.min(10, Math.max(1, y));
}

// The pool when replacement started: today's pool plus lines already replaced.
export const baselinePool = (s) => replacementPool(s) + Math.max(0, Number(s.replacements_completed) || 0);

// 1. Every dated requirement for every system, earliest first.
export function deadlines(systems, now = new Date()) {
  const out = [];
  for (const s of systems) {
    const base = { systemId: s.id, systemName: s.name, state: s.state };
    out.push({ ...base, key: "connectors", date: DEADLINE_ISO, label: "Baseline inventory with lead connectors", cite: "§ 141.84(a)", done: !!s.connectors_inventoried });
    out.push({ ...base, key: "plan", date: DEADLINE_ISO, label: "Service line replacement plan", cite: "§ 141.84(c)", done: !!s.plan_drafted });
    const noticeDue = s.last_notice_date ? addDays(s.last_notice_date, 365) : iso(now);
    const owes = replacementPool(s) > 0;
    out.push({
      ...base, key: "notice", date: noticeDue,
      label: s.last_notice_date ? "Annual notice to lead, GRR and unknown lines" : "Annual notice (none on record)",
      cite: "§ 141.85(e)", done: !owes, neverSent: !s.last_notice_date,
    });
    const y1 = Math.ceil(baselinePool(s) * REPLACEMENT_RATE);
    out.push({
      ...base, key: "year1", date: "2028-10-31", label: `Year-1 replacements (${y1} lines)`, cite: "§ 141.84(d)(5)",
      done: baselinePool(s) === 0 || (Number(s.replacements_completed) || 0) >= y1,
    });
  }
  return out
    .map((d) => ({ ...d, status: d.key === "notice" && d.neverSent && !d.done ? "overdue" : deadlineStatus(d.date, d.done, now), days: daysUntil(d.date, now) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.systemName.localeCompare(b.systemName));
}

// 2. Unknown-line pace towards the 95% known goal by 1 Nov 2027.
export function unknownPace(system, lines = [], now = new Date()) {
  const total = totalLines(system);
  const unknown = counts(system).unknown;
  const allowed = Math.floor(total * (1 - KNOWN_GOAL));
  const toGo = Math.max(0, unknown - allowed);
  const monthsLeft = Math.max(0, (LCRI_DEADLINE - now) / (30.44 * DAY));
  const perMonth = toGo === 0 ? 0 : monthsLeft >= 1 ? Math.ceil(toGo / monthsLeft) : toGo;
  const since = iso(new Date(now.getTime() - 30 * DAY));
  const recent = lines.filter((l) => l.material !== "unknown" && l.verified_date && l.verified_date >= since && l.verified_date <= iso(now)).length;
  let status;
  if (unknown === 0) status = "no_unknowns";
  else if (toGo === 0) status = "done";
  else status = recent >= perMonth ? "on_pace" : "behind";
  return { systemId: system.id, systemName: system.name, total, unknown, knownShare: total ? 1 - unknownShare(system) : 0, toGo, perMonth, recent, monthsLeft, status };
}

// 3. Replacement pace: cumulative average of at least 10% of the baseline pool a year.
export function replacementPace(system, now = new Date()) {
  const pool = baselinePool(system);
  const completed = Math.max(0, Number(system.replacements_completed) || 0);
  const scheduled = Math.max(0, Number(system.replacements_scheduled) || 0);
  const year = programYear(now);
  const yearOne = Math.ceil(pool * REPLACEMENT_RATE);
  const endOfYear = year ? Math.min(pool, Math.ceil(pool * REPLACEMENT_RATE * year - 1e-9)) : yearOne;
  let dueByNow = 0;
  if (year) {
    const elapsedYears = (now - LCRI_DEADLINE) / (365.25 * DAY);
    dueByNow = Math.min(pool, Math.floor(pool * REPLACEMENT_RATE * elapsedYears));
  }
  let status;
  if (pool === 0) status = "done";
  else if (!year) status = scheduled >= yearOne ? "on_pace" : "not_started";
  else status = completed >= dueByNow ? "on_pace" : "behind";
  return {
    systemId: system.id, systemName: system.name, pool, yearOne, scheduled, completed, year, endOfYear, dueByNow,
    percent: pool ? completed / pool : 1, status,
  };
}

// 4. Field activity from service lines across systems.
export function fieldActivity(lines, systems, now = new Date()) {
  const ago = (d) => new Date(now.getTime() - d * DAY).toISOString();
  const done = lines.filter((l) => l.assignment_status === "done" && l.completed_at);
  const open = lines.filter((l) => l.assignment_status === "open");
  const byId = new Map(systems.map((s) => [s.id, s.name]));
  const oldest = open.filter((l) => l.assigned_at).sort((a, b) => a.assigned_at.localeCompare(b.assigned_at))[0] || null;
  const week = done.filter((l) => l.completed_at >= ago(7)).length;
  const month = done.filter((l) => l.completed_at >= ago(30)).length;
  const verifiedMonth = lines.filter((l) => l.material !== "unknown" && l.verified_date && l.verified_date >= iso(new Date(now.getTime() - 30 * DAY))).length;
  return {
    week, month, open: open.length, verifiedMonth,
    oldest: oldest && {
      address: oldest.address, systemName: byId.get(oldest.system_id) || "", tech: oldest.assigned_to_name || "",
      days: Math.floor((now - new Date(oldest.assigned_at)) / DAY),
    },
    techs: workloadByMember(lines).map((w) => ({
      ...w,
      week: done.filter((l) => l.assigned_to === w.id && l.completed_at >= ago(7)).length,
    })),
  };
}

// 5. Each readiness requirement: how many systems have it done, and which don't.
export function ruleRollup(systems, now = new Date()) {
  const rows = new Map();
  for (const s of systems) {
    for (const item of checklist(s, now)) {
      if (!rows.has(item.key)) rows.set(item.key, { key: item.key, label: item.label, done: 0, total: 0, missing: [] });
      const r = rows.get(item.key);
      r.total += 1;
      if (item.done) r.done += 1;
      else r.missing.push({ id: s.id, name: s.name });
    }
  }
  const out = [...rows.values()];
  const pace = systems.map((s) => replacementPace(s, now));
  out.push({
    key: "pace", label: programYear(now) ? "Replacements on pace (10% a year)" : "Year-1 replacements scheduled",
    done: pace.filter((p) => p.status === "on_pace" || p.status === "done").length, total: systems.length,
    missing: pace.filter((p) => !["on_pace", "done"].includes(p.status)).map((p) => ({ id: p.systemId, name: p.systemName })),
  });
  return out;
}

export function complianceSummary(systems, lines, now = new Date()) {
  const dl = deadlines(systems, now);
  return {
    overdue: dl.filter((d) => d.status === "overdue").length,
    dueSoon: dl.filter((d) => d.status === "due_soon").length,
    unknownBehind: systems.map((s) => unknownPace(s, lines.filter((l) => l.system_id === s.id), now)).filter((p) => p.status === "behind").length,
    replacementBehind: systems.map((s) => replacementPace(s, now)).filter((p) => ["behind", "not_started"].includes(p.status)).length,
  };
}

const pct = (x) => `${Math.round(x * 100)}%`;

// 6. The printable report (drawn by report-pdf.js, kind "compliance").
export function complianceReport(systems, lines, letterhead, { now = new Date(), preparedBy = "" } = {}) {
  const dl = deadlines(systems, now).filter((d) => d.status !== "done");
  const s = complianceSummary(systems, lines, now);
  const act = fieldActivity(lines, systems, now);
  return {
    kind: "compliance",
    filename: `lcri-compliance-dashboard-${iso(now)}.pdf`,
    letterhead,
    title: "LCRI Compliance Dashboard",
    subtitle: `${systems.length} water ${systems.length === 1 ? "system" : "systems"}`,
    meta: [["Report date", formatDate(iso(now))], ["Compliance date", "Nov 1, 2027"], ...(preparedBy ? [["Prepared by", preparedBy]] : [])],
    status: s.overdue ? { label: `${s.overdue} overdue`, key: "behind" } : s.dueSoon ? { label: `${s.dueSoon} due soon`, key: "at_risk" } : { label: "Nothing overdue", key: "ready" },
    tiles: [
      ["Overdue", String(s.overdue)],
      [`Due in ${DUE_SOON_DAYS} days`, String(s.dueSoon)],
      ["Behind on unknowns", String(s.unknownBehind)],
      ["Behind on replacements", String(s.replacementBehind)],
      ["Visits, last 30 days", String(act.month)],
    ],
    sections: [
      {
        title: "Open deadlines",
        table: {
          columns: ["Due", "System", "Requirement", "Rule", "Status"],
          widths: [0.12, 0.26, 0.36, 0.12, 0.14],
          rows: dl.map((d) => [formatDate(d.date), d.systemName, d.label, d.cite, STATUS_LABEL[d.status]]),
        },
        empty: "No open deadlines.",
      },
      {
        title: "Unknown-line pace (goal: 95% known by Nov 1, 2027)",
        table: {
          columns: ["System", "Known", "Unknown", "Left to goal", "Needed / month", "Verified, 30 days", "Status"],
          widths: [0.26, 0.1, 0.11, 0.12, 0.13, 0.14, 0.14],
          rows: systems.map((x) => unknownPace(x, lines.filter((l) => l.system_id === x.id), now)).map((p) => [
            p.systemName, pct(p.knownShare), String(p.unknown), String(p.toGo), String(p.perMonth), String(p.recent), STATUS_LABEL[p.status],
          ]),
        },
      },
      {
        title: "Replacement pace (cumulative average of at least 10% a year)",
        table: {
          columns: ["System", "Baseline pool", "Year-1 target", "Scheduled", "Completed", "Due to date", "Status"],
          widths: [0.26, 0.12, 0.12, 0.11, 0.11, 0.12, 0.16],
          rows: systems.map((x) => replacementPace(x, now)).map((p) => [
            p.systemName, String(p.pool), String(p.yearOne), String(p.scheduled), String(p.completed), p.year ? String(p.dueByNow) : "—", STATUS_LABEL[p.status],
          ]),
        },
      },
      {
        title: "Requirements across systems",
        table: {
          columns: ["Requirement", "Done", "Not done"],
          widths: [0.34, 0.12, 0.54],
          rows: ruleRollup(systems, now).map((r) => [r.label, `${r.done} of ${r.total}`, r.missing.map((m) => m.name).join(", ") || "—"]),
        },
      },
      {
        title: "Field activity",
        table: {
          columns: ["Field tech", "Open visits", "Recorded, 7 days", "Recorded, all time"],
          widths: [0.4, 0.2, 0.2, 0.2],
          rows: act.techs.map((t) => [t.name, String(t.open), String(t.week), String(t.done)]),
        },
        note: `${act.week} visits recorded in the last 7 days, ${act.month} in the last 30. ${act.open} open.${act.oldest ? ` Oldest open: ${act.oldest.address} (${act.oldest.systemName}), ${act.oldest.days} days, ${act.oldest.tech}.` : ""}`,
        empty: "No field assignments yet.",
      },
    ],
    disclaimer: "Planning aid based on the records in LineTally, not compliance advice. Deadlines and replacement pace follow 40 CFR 141 subpart I as published Oct 30, 2024; deferred deadlines, state rules and how replacements are counted are set by the state primacy agency. The 95% known goal is a LineTally readiness goal.",
  };
}
