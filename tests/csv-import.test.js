import test from "node:test";
import assert from "node:assert/strict";
import { IMPORT_TEMPLATE, addressKey, importTally, materialFrom, parseCsv, planImport } from "../src/lib/csv-import.js";

test("parses quoted fields, CRLF, BOM and other delimiters", () => {
  assert.deepEqual(parseCsv('﻿address,material\r\n"12 Oak St, Apt 2",lead\r\n"Say ""hi"" Rd",\r\n\r\n'), [["address", "material"], ["12 Oak St, Apt 2", "lead"], ['Say "hi" Rd', ""]]);
  assert.deepEqual(parseCsv("address;material\n1 A St;copper"), [["address", "material"], ["1 A St", "copper"]]);
  assert.deepEqual(parseCsv("address\tmaterial\n1 A St\tPb"), [["address", "material"], ["1 A St", "Pb"]]);
});

test("maps common material spellings", () => {
  assert.equal(materialFrom("Lead"), "lead");
  assert.equal(materialFrom("Galvanized Requiring Replacement"), "grr");
  assert.equal(materialFrom("COPPER"), "non_lead");
  assert.equal(materialFrom("Non-Lead"), "non_lead");
  assert.equal(materialFrom(""), "unknown");
  assert.equal(materialFrom("Lead Status Unknown"), "unknown");
  assert.equal(materialFrom("asbestos cement?"), null);
});

test("plans an import with duplicates, blanks and warnings", () => {
  const csv = "Service Address,Line Material,How identified\n12 Oak Street,Copper,Tap card\n12 oak st.,lead,\n,lead,\n14 Oak St,weird,\n16 Oak St,Lead,\n";
  const plan = planImport(csv, ["16 OAK ST"]);
  assert.deepEqual(plan.lines, [
    { address: "12 Oak Street", material: "non_lead", material_type: "copper", identification_method: "Tap card" },
    { address: "14 Oak St", material: "unknown", identification_method: "" },
  ]);
  assert.deepEqual(plan.skipped.map((s) => [s.row, s.reason]), [[3, "Already on file or repeated"], [4, "No address"], [6, "Already on file or repeated"]]);
  assert.equal(plan.warnings.length, 1);
  assert.equal(plan.warnings[0].row, 5);
  assert.deepEqual(importTally(plan.lines), { lead: 0, grr: 0, unknown: 1, non_lead: 1 });
});

test("joins house number and street, adds units, and defaults the method", () => {
  const plan = planImport("House Number,Street Name,Unit,Status\n12,Oak St,2,galvanized\n14,Oak St,,");
  assert.deepEqual(plan.lines, [
    { address: "12 Oak St #2", material: "grr", identification_method: "Records review" },
    { address: "14 Oak St", material: "unknown", identification_method: "" },
  ]);
});

test("a plain list of addresses with no header works", () => {
  const plan = planImport("12 Oak St\n14 Oak St\n");
  assert.deepEqual(plan.lines.map((l) => l.address), ["12 Oak St", "14 Oak St"]);
  assert.equal(planImport("Addresses\n12 Oak St").lines.length, 1);
});

test("the template imports cleanly", () => {
  const plan = planImport(IMPORT_TEMPLATE);
  assert.deepEqual(importTally(plan.lines), { lead: 1, grr: 1, unknown: 1, non_lead: 1 });
  assert.equal(plan.skipped.length + plan.warnings.length, 0);
  assert.equal(addressKey("12 Oak Avenue"), addressKey("12 oak ave."));
});

test("reads connectors and split ownership columns", () => {
  const csv = "Address,Material,Gooseneck,System Side Material,Customer Side Material\n" +
    "1 A St,PVC,No connector,,\n" +
    "2 A St,,lead,copper,lead\n" +
    "3 A St,lead,maybe,,\n" +
    "4 A St,,,non-lead,\n";
  const plan = planImport(csv);
  assert.deepEqual(plan.lines[0], { address: "1 A St", material: "non_lead", material_type: "plastic", connector: "none", identification_method: "Records review" });
  assert.deepEqual(plan.lines[1], { address: "2 A St", ownership: "split", system_side: "non_lead", customer_side: "lead", material: "lead", material_type: "copper", connector: "lead", identification_method: "Records review" });
  assert.equal(plan.lines[2].connector, undefined);
  assert.match(plan.warnings[0].reason, /Connector "maybe" not recognised/);
  assert.deepEqual([plan.lines[3].system_side, plan.lines[3].customer_side, plan.lines[3].material], ["non_lead", "unknown", "unknown"]);
});

test("reads customer name and email for emailed notices", () => {
  const plan = planImport("Address,Material,Customer Name,Email\n1 A St,lead,Ann Lee,Ann@Example.com\n2 A St,lead,,not-an-email\n");
  assert.deepEqual([plan.lines[0].customer_name, plan.lines[0].customer_email], ["Ann Lee", "ann@example.com"]);
  assert.equal(plan.lines[1].customer_email, undefined);
  assert.match(plan.warnings[0].reason, /Email "not-an-email" not valid/);
});
