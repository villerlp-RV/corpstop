import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_LINE_FILTER, filterLines, filterSystems, isFiltered, statesOf } from "../src/lib/filters.js";

const lines = [
  { id: "1", address: "12 Oak St", material: "lead", connector: "lead", assignment_status: "open", assigned_to_name: "Jo Okafor", photo_uris: ["p"] },
  { id: "2", address: "14 Oak Street", material: "non_lead", connector: "none", assignment_status: "done", attachments: [{ uri: "f" }], field_notes: "copper" },
  { id: "3", address: "9 Main St", material: "unknown", ownership: "split", system_side: "non_lead", customer_side: "unknown" },
];
const ids = (r) => r.map((l) => l.id);
const f = (o) => ({ ...EMPTY_LINE_FILTER, ...o });

test("line filters combine", () => {
  assert.deepEqual(ids(filterLines(lines, f({}))), ["1", "2", "3"]);
  assert.deepEqual(ids(filterLines(lines, f({ q: "oak" }))), ["1", "2"]);
  assert.deepEqual(ids(filterLines(lines, f({ q: "jo oak" }))), ["1"], "searches the assignee too, every word must match");
  assert.deepEqual(ids(filterLines(lines, f({ material: "unknown" }))), ["3"]);
  assert.deepEqual(ids(filterLines(lines, f({ connector: "not_recorded" }))), ["3"]);
  assert.deepEqual(ids(filterLines(lines, f({ connector: "none" }))), ["2"]);
  assert.deepEqual(ids(filterLines(lines, f({ visit: "unassigned" }))), ["3"]);
  assert.deepEqual(ids(filterLines(lines, f({ visit: "done" }))), ["2"]);
  assert.deepEqual(ids(filterLines(lines, f({ has: "photos" }))), ["1"]);
  assert.deepEqual(ids(filterLines(lines, f({ has: "no_photos" }))), ["2", "3"]);
  assert.deepEqual(ids(filterLines(lines, f({ has: "files" }))), ["2"]);
  assert.deepEqual(ids(filterLines(lines, f({ has: "split" }))), ["3"]);
  assert.deepEqual(ids(filterLines(lines, f({ has: "notes" }))), ["2"]);
  assert.deepEqual(ids(filterLines(lines, f({ q: "oak", material: "lead", visit: "open" }))), ["1"]);
  assert.equal(isFiltered(f({})), false);
  assert.equal(isFiltered(f({ has: "files" })), true);
});

test("system filters", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  const base = { lead_count: 0, grr_count: 0, nonlead_count: 100, connectors_inventoried: true, plan_drafted: true, last_notice_date: "2026-06-01" };
  const systems = [
    { ...base, id: "a", name: "Cedar Hollow", pwsid: "OH2140117", state: "OH", field_tech: "D. Alvarez", unknown_count: 0 },
    { ...base, id: "b", name: "Stoneford Borough", pwsid: "PA1", state: "PA", unknown_count: 400, plan_drafted: false },
  ];
  assert.deepEqual(filterSystems(systems, { q: "oh214" }, now).map((s) => s.id), ["a"]);
  assert.deepEqual(filterSystems(systems, { q: "alvarez" }, now).map((s) => s.id), ["a"]);
  assert.deepEqual(filterSystems(systems, { state: "PA" }, now).map((s) => s.id), ["b"]);
  assert.deepEqual(filterSystems(systems, { status: "ready" }, now).map((s) => s.id), ["a"]);
  assert.deepEqual(filterSystems(systems, { attention: true }, now).map((s) => s.id), ["b"]);
  assert.deepEqual(statesOf([...systems, { state: "OH" }]), ["OH", "PA"]);
});
