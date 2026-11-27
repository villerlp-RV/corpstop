import test from "node:test";
import assert from "node:assert/strict";
import { combineSides, connectorSummary, connectorTally, lineFields, materialText } from "../src/lib/pipes.js";
import { fieldRecordPatch } from "../src/lib/fieldwork.js";
import { queuedVisit } from "../src/lib/offline.js";

test("a split line takes the category of its worst portion", () => {
  assert.equal(combineSides("lead", "non_lead"), "lead");
  assert.equal(combineSides("non_lead", "lead"), "lead");
  assert.equal(combineSides("non_lead", "grr"), "grr");
  assert.equal(combineSides("unknown", "non_lead"), "unknown");
  assert.equal(combineSides("non_lead", "non_lead"), "non_lead");
  assert.equal(combineSides(undefined, "non_lead"), "unknown");
});

test("lineFields normalises single and split lines", () => {
  assert.deepEqual(lineFields({ material: "non_lead", material_type: "copper", connector: "none" }).fields, {
    material: "non_lead", material_type: "copper", ownership: "single", system_side: null, customer_side: null, connector: "none",
  });
  // a type only applies to non-lead; a bad connector is dropped
  assert.deepEqual(lineFields({ material: "lead", material_type: "copper", connector: "gold" }).fields.material_type, null);
  assert.equal(lineFields({ material: "lead", connector: "gold" }).fields.connector, null);
  const split = lineFields({ ownership: "split", system_side: "non_lead", customer_side: "lead", material_type: "plastic" }).fields;
  assert.deepEqual([split.material, split.system_side, split.customer_side, split.material_type], ["lead", "non_lead", "lead", "plastic"]);
  assert.match(lineFields({ ownership: "split", system_side: "lead" }).error, /both the system side and the customer side/);
  assert.match(lineFields({ material: "steel" }).error, /Choose the material/);
});

test("labels and connector tallies", () => {
  assert.equal(materialText({ material: "non_lead", material_type: "copper" }), "Non-lead · Copper");
  assert.equal(materialText({ material: "lead", ownership: "split", system_side: "lead", customer_side: "non_lead" }), "Lead · system lead, customer non-lead");
  const lines = [{ connector: "lead" }, { connector: "none" }, { connector: "none" }, {}];
  assert.deepEqual(connectorTally(lines), { lead: 1, non_lead: 0, unknown: 0, none: 2, not_recorded: 1 });
  assert.equal(connectorSummary(lines), "1 lead · 2 no connector present · 1 not recorded");
  assert.equal(connectorSummary([]), "None on file");
});

test("field visits record split ownership, type and connector", () => {
  const now = new Date("2026-11-26T10:00:00Z");
  const { patch } = fieldRecordPatch({}, { ownership: "split", system_side: "non_lead", customer_side: "grr", method: "Potholing", connector: "lead" }, {}, now);
  assert.deepEqual([patch.material, patch.ownership, patch.system_side, patch.customer_side, patch.connector], ["grr", "split", "non_lead", "grr", "lead"]);
  assert.match(fieldRecordPatch({}, { ownership: "split", system_side: "unknown", customer_side: "unknown", method: "Potholing" }, {}).error, /at least one side/);
  const plain = fieldRecordPatch({}, { material: "non_lead", material_type: "copper", method: "Tap card" }, {}, now).patch;
  assert.equal(plain.material_type, "copper");
  assert.equal("connector" in plain, false, "a visit without a connector leaves the office's value alone");
  const q = queuedVisit({ line: { id: "l", system_id: "s", address: "a" }, input: { material: "grr", method: "Potholing", ownership: "split", system_side: "non_lead", customer_side: "grr", connector: "none" }, photos: [], user: {}, now });
  assert.deepEqual(q.input, { material: "grr", method: "Potholing", notes: "", ownership: "split", system_side: "non_lead", customer_side: "grr", connector: "none" });
});
