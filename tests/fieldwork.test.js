import test from "node:test";
import assert from "node:assert/strict";
import { assignPatch, fieldRecordPatch, groupBySystem, isOpen, unassignPatch, workloadByMember } from "../src/lib/fieldwork.js";

const NOW = new Date("2026-11-26T15:30:00Z");

test("assign and unassign", () => {
  const p = assignPatch({ id: "u2", name: "Jo" }, { full_name: "Dana" }, NOW);
  assert.deepEqual(p, { assigned_to: "u2", assigned_to_name: "Jo", assigned_by_name: "Dana", assigned_at: NOW.toISOString(), assignment_status: "open", completed_at: null });
  assert.equal(isOpen({ ...p }), true);
  assert.equal(isOpen({ ...p, ...unassignPatch() }), false);
});

test("field record validates and marks the assignment done", () => {
  assert.match(fieldRecordPatch({}, { material: "unknown", method: "Potholing" }, {}).error, /material/);
  assert.match(fieldRecordPatch({}, { material: "lead", method: "" }, {}).error, /how you identified/);
  const { patch } = fieldRecordPatch({}, { material: "non_lead", method: "Visual (curb stop)", notes: "  copper at curb stop ", photo_uri: "priv://x" }, { full_name: "Jo" }, NOW);
  assert.equal(patch.material, "non_lead");
  assert.equal(patch.verified_by, "Jo");
  assert.equal(patch.field_notes, "copper at curb stop");
  assert.equal(patch.photo_uri, "priv://x");
  assert.equal(patch.assignment_status, "done");
  assert.equal(patch.completed_at, NOW.toISOString());
  assert.match(patch.verified_date, /^\d{4}-\d{2}-\d{2}$/);
  const noPhoto = fieldRecordPatch({}, { material: "lead", method: "Tap card" }, {}, NOW).patch;
  assert.equal("photo_uri" in noPhoto, false, "keeps an existing photo when none is added");
  assert.equal(noPhoto.field_notes, null);
});

test("grouping and workload", () => {
  const systems = [{ id: "a", name: "Zeta" }, { id: "b", name: "Alpha" }];
  const lines = [
    { id: 1, system_id: "a", address: "9 Main", assigned_to: "u2", assigned_to_name: "Jo", assignment_status: "open" },
    { id: 2, system_id: "b", address: "5 Oak", assigned_to: "u2", assigned_to_name: "Jo", assignment_status: "done" },
    { id: 3, system_id: "a", address: "1 Elm", assigned_to: "u3", assigned_to_name: "Ray", assignment_status: "open" },
    { id: 4, system_id: "a", address: "2 Elm" },
  ];
  const g = groupBySystem(lines.slice(0, 3), systems);
  assert.deepEqual(g.map((x) => x.system.name), ["Alpha", "Zeta"]);
  assert.deepEqual(g[1].lines.map((l) => l.address), ["1 Elm", "9 Main"]);
  assert.deepEqual(workloadByMember(lines), [
    { id: "u2", name: "Jo", open: 1, done: 1 },
    { id: "u3", name: "Ray", open: 1, done: 0 },
  ]);
});
