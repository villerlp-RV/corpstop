import test from "node:test";
import assert from "node:assert/strict";
import {
  baselinePool, complianceReport, complianceSummary, deadlineStatus, deadlines, fieldActivity, programYear, replacementPace, ruleRollup, unknownPace,
} from "../src/lib/compliance.js";

const NOW = new Date("2026-11-27T12:00:00");
const sys = (o) => ({ id: "s", name: "Cedar", state: "OH", lead_count: 38, grr_count: 22, unknown_count: 131, nonlead_count: 312, connectors_inventoried: false, plan_drafted: false, last_notice_date: "2026-03-12", replacements_scheduled: 0, ...o });

test("deadline status and program years", () => {
  assert.equal(deadlineStatus("2026-11-01", false, NOW), "overdue");
  assert.equal(deadlineStatus("2027-01-15", false, NOW), "due_soon");
  assert.equal(deadlineStatus("2027-11-01", false, NOW), "upcoming");
  assert.equal(deadlineStatus("2026-11-01", true, NOW), "done");
  assert.equal(programYear(NOW), 0);
  assert.equal(programYear(new Date("2027-11-01T08:00:00")), 1);
  assert.equal(programYear(new Date("2028-10-31T08:00:00")), 1);
  assert.equal(programYear(new Date("2028-11-02T08:00:00")), 2);
  assert.equal(programYear(new Date("2040-01-01T08:00:00")), 10);
});

test("deadlines for each system, earliest first", () => {
  const d = deadlines([sys({}), sys({ id: "t", name: "Harlan", last_notice_date: null, plan_drafted: true })], NOW);
  assert.deepEqual(d.map((x) => [x.systemName, x.key, x.status]).slice(0, 3), [
    ["Harlan", "notice", "overdue"], ["Cedar", "notice", "upcoming"], ["Cedar", "connectors", "upcoming"],
  ]);
  const cedarNotice = d.find((x) => x.systemName === "Cedar" && x.key === "notice");
  assert.equal(cedarNotice.date, "2027-03-12");
  assert.equal(d.find((x) => x.systemName === "Harlan" && x.key === "plan").status, "done");
  assert.equal(d.find((x) => x.key === "year1").label, "Year-1 replacements (20 lines)");
  // a system with nothing in the pool owes no notice
  assert.equal(deadlines([sys({ lead_count: 0, grr_count: 0, unknown_count: 0, last_notice_date: null })], NOW).find((x) => x.key === "notice").status, "done");
});

test("unknown-line pace towards 95% known", () => {
  const lines = [
    { material: "non_lead", verified_date: "2026-11-20" },
    { material: "lead", verified_date: "2026-11-01" },
    { material: "non_lead", verified_date: "2026-09-01" },
    { material: "unknown" },
  ];
  const p = unknownPace(sys({}), lines, NOW);
  assert.equal(p.total, 503);
  assert.equal(p.toGo, 131 - 25);
  assert.equal(p.recent, 2);
  assert.equal(p.perMonth, Math.ceil(106 / p.monthsLeft));
  assert.equal(p.status, "behind");
  assert.equal(unknownPace(sys({ unknown_count: 10 }), [], NOW).status, "done");
  assert.equal(unknownPace(sys({ unknown_count: 0 }), [], NOW).status, "no_unknowns");
});

test("replacement pace: year-1 scheduling before 2027, cumulative 10% after", () => {
  const before = replacementPace(sys({}), NOW);
  assert.deepEqual([before.pool, before.yearOne, before.status], [191, 20, "not_started"]);
  assert.equal(replacementPace(sys({ replacements_scheduled: 20 }), NOW).status, "on_pace");
  const mid = new Date("2029-05-01T12:00:00"); // 1.5 years in
  const done30 = sys({ lead_count: 8, replacements_completed: 30 });
  assert.equal(baselinePool(done30), 161 + 30);
  const r = replacementPace(done30, mid);
  assert.deepEqual([r.year, r.dueByNow, r.status], [2, Math.floor(191 * 0.1 * ((mid - new Date("2027-11-01T00:00:00")) / (365.25 * 864e5))), "on_pace"]);
  assert.equal(replacementPace(sys({ replacements_completed: 5 }), mid).status, "behind");
  assert.equal(replacementPace(sys({ lead_count: 0, grr_count: 0, unknown_count: 0 }), mid).status, "done");
});

test("field activity and the requirement rollup", () => {
  const lines = [
    { id: "1", system_id: "s", address: "1 A", assignment_status: "open", assigned_to: "u2", assigned_to_name: "Jo", assigned_at: "2026-11-01T10:00:00Z" },
    { id: "2", system_id: "s", address: "2 A", assignment_status: "open", assigned_to: "u2", assigned_to_name: "Jo", assigned_at: "2026-11-20T10:00:00Z" },
    { id: "3", system_id: "s", address: "3 A", assignment_status: "done", assigned_to: "u2", assigned_to_name: "Jo", completed_at: "2026-11-25T10:00:00Z", material: "non_lead", verified_date: "2026-11-25" },
    { id: "4", system_id: "s", address: "4 A", assignment_status: "done", assigned_to: "u3", assigned_to_name: "Ray", completed_at: "2026-10-01T10:00:00Z", material: "lead", verified_date: "2026-10-01" },
  ];
  const a = fieldActivity(lines, [sys({})], NOW);
  assert.deepEqual([a.week, a.month, a.open, a.verifiedMonth], [1, 1, 2, 1]);
  assert.deepEqual([a.oldest.address, a.oldest.systemName, a.oldest.tech, a.oldest.days], ["1 A", "Cedar", "Jo", 26]);
  assert.deepEqual(a.techs.find((t) => t.name === "Jo"), { id: "u2", name: "Jo", open: 2, done: 1, week: 1 });

  const roll = ruleRollup([sys({}), sys({ id: "t", name: "Harlan", connectors_inventoried: true })], NOW);
  const con = roll.find((r) => r.key === "connectors");
  assert.deepEqual([con.done, con.total, con.missing.map((m) => m.name)], [1, 2, ["Cedar"]]);
  assert.equal(roll.at(-1).label, "Year-1 replacements scheduled");

  const sum = complianceSummary([sys({}), sys({ id: "t", name: "Harlan", last_notice_date: null })], lines, NOW);
  assert.deepEqual(sum, { overdue: 1, dueSoon: 0, unknownBehind: 2, replacementBehind: 2 });
});

test("the printable report", () => {
  const r = complianceReport([sys({})], [], { name: "Tri-County" }, { now: NOW, preparedBy: "Dana" });
  assert.equal(r.kind, "compliance");
  assert.equal(r.filename, "lcri-compliance-dashboard-2026-11-27.pdf");
  assert.equal(r.sections.length, 5);
  for (const s of r.sections) {
    assert.equal(s.table.columns.length, s.table.widths.length, s.title);
    assert.ok(Math.abs(s.table.widths.reduce((x, y) => x + y, 0) - 1) < 1e-9, s.title);
  }
  assert.equal(r.sections[0].table.rows.length, 4, "open deadlines only");
  assert.deepEqual(r.status, { label: "Nothing overdue", key: "ready" });
});
