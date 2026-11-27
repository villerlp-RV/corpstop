import test from "node:test";
import assert from "node:assert/strict";
import { addressLines, contactLine, letterhead, portfolioReport, systemReport } from "../src/lib/report.js";

const NOW = new Date("2026-11-27T12:00:00");
const profile = { business_name: "Tri-County Water Services", address_line1: "412 Mill Rd", address_line2: "Suite 3", city: "Millersburg", state: "OH", postal_code: "44654", phone: "(330) 555-0142", email: "ops@tricounty.example", website: "", license_number: "OH Class II 2041", logo_data: "data:image/png;base64,AAA" };
const system = { id: "s1", name: "Cedar Hollow Water District", state: "OH", pwsid: "OH2140117", population: 1240, lead_count: 38, grr_count: 22, unknown_count: 131, nonlead_count: 312, connectors_inventoried: true, plan_drafted: false, last_notice_date: "2026-03-12", replacements_scheduled: 12, field_tech: "D. Alvarez" };
const lines = [
  { address: "9 Main St", material: "non_lead", identification_method: "Potholing", verified_date: "2026-11-20", verified_by: "Jo Okafor", assignment_status: "done", assigned_to_name: "Jo Okafor", photo_uris: ["p1", "p2"], field_notes: "Copper at curb stop" },
  { address: "1 Elm Ct", material: "lead", identification_method: "Tap card" },
  { address: "5 Oak Ln", material: "unknown", assignment_status: "open", assigned_to_name: "Ray Patel" },
];

test("letterhead and address formatting", () => {
  assert.deepEqual(addressLines(profile), ["412 Mill Rd", "Suite 3", "Millersburg, OH 44654"]);
  assert.equal(contactLine(profile), "(330) 555-0142  ·  ops@tricounty.example");
  assert.deepEqual(addressLines({ city: "Akron" }), ["Akron"]);
  assert.deepEqual(addressLines(null), []);
  const lh = letterhead(profile);
  assert.equal(lh.name, "Tri-County Water Services");
  assert.match(lh.license, /Class II 2041/);
  assert.equal(letterhead(null).name, "");
});

test("system report content", () => {
  const r = systemReport(system, lines, profile, { now: NOW, preparedBy: "Dana Ops" });
  assert.equal(r.filename, "cedar-hollow-water-district-lcri-report-2026-11-27.pdf");
  assert.equal(r.subtitle, "Cedar Hollow Water District");
  assert.deepEqual(r.meta.at(-1), ["Prepared by", "Dana Ops"]);
  assert.deepEqual(r.tiles[3], ["Unknown", "131 (26%)"]);
  assert.equal(r.checklist.length, 4);
  assert.deepEqual(r.pace[1], ["Year-1 replacement target (10%)", "20"]);
  assert.deepEqual(r.lines.rows.map((x) => x[0]), ["1 Elm Ct", "5 Oak Ln", "9 Main St"], "lead first, then unknown, then non-lead");
  assert.deepEqual(r.lines.rows[2].slice(1), ["Non-lead", "Potholing", "Nov 20, 2026 · Jo Okafor", "Recorded · Jo Okafor", "2"]);
  assert.equal(r.lines.rows[1][4], "Open · Ray Patel");
  assert.deepEqual(r.notes, [["9 Main St", "Copper at curb stop"]]);
  assert.match(r.lines.note, /3 service lines on file of 503/);
  assert.ok(Math.abs(r.lines.widths.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("portfolio report content", () => {
  const other = { ...system, id: "s2", name: "Ashby Water", state: "IA", pwsid: "IA1", plan_drafted: true, last_notice_date: null };
  const r = portfolioReport([system, other], profile, { now: NOW });
  assert.equal(r.subtitle, "2 water systems in 2 states");
  assert.deepEqual(r.systems.rows.map((x) => x[0]), ["Ashby Water", "Cedar Hollow Water District"], "sorted by state then name");
  assert.equal(r.systems.rows[0][9], "Due");
  assert.equal(r.systems.rows[1][9], "Mar 12, 2026");
  assert.ok(Math.abs(r.systems.widths.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(r.systems.columns.length, r.systems.widths.length);
});
