import test from "node:test";
import assert from "node:assert/strict";
import {
  countsAfterChange, exampleLines, EXAMPLE_SYSTEMS, noticeCurrent, portfolioSummary, readiness,
  replacementPool, stateCsv, totalLines, unknownShare, yearOneTarget,
} from "../src/lib/lcri.js";

const NOW = new Date("2026-11-26T12:00:00");
const base = { name: "Test", state: "OH", lead_count: 38, grr_count: 22, unknown_count: 131, nonlead_count: 312 };

test("totals, pool and year-1 target", () => {
  assert.equal(totalLines(base), 503);
  assert.equal(replacementPool(base), 191);
  assert.equal(yearOneTarget(base), 20); // ceil(19.1)
  assert.equal(yearOneTarget({ ...base, lead_count: 0, grr_count: 0, unknown_count: 0 }), 0);
});

test("handles missing or bad counts", () => {
  assert.equal(totalLines({}), 0);
  assert.equal(unknownShare({}), 0);
  assert.equal(totalLines({ lead_count: "5", grr_count: null, unknown_count: "x" }), 5);
});

test("notice is current for 365 days", () => {
  assert.equal(noticeCurrent({ last_notice_date: "2026-03-12" }, NOW), true);
  assert.equal(noticeCurrent({ last_notice_date: "2025-11-20" }, NOW), false);
  assert.equal(noticeCurrent({ last_notice_date: null }, NOW), false);
});

test("readiness levels", () => {
  const ready = { ...base, unknown_count: 10, connectors_inventoried: true, plan_drafted: true, last_notice_date: "2026-06-01" };
  assert.equal(readiness(ready, NOW), "ready");
  const behind = { ...base, unknown_count: 400, connectors_inventoried: false, plan_drafted: false, last_notice_date: null };
  assert.equal(readiness(behind, NOW), "behind");
  const onTrack = { ...base, connectors_inventoried: true, plan_drafted: true, last_notice_date: "2026-06-01" };
  assert.equal(readiness(onTrack, NOW), "on_track");
  const atRisk = { ...base, connectors_inventoried: true, plan_drafted: false, last_notice_date: "2026-06-01" };
  assert.equal(readiness(atRisk, NOW), "at_risk");
});

test("identifying an unknown line moves one count", () => {
  assert.deepEqual(countsAfterChange(base, "unknown", "non_lead"), { unknown_count: 130, nonlead_count: 313 });
  assert.deepEqual(countsAfterChange(base, "unknown", "lead"), { unknown_count: 130, lead_count: 39 });
  assert.deepEqual(countsAfterChange({ ...base, unknown_count: 0 }, "unknown", "grr"), { unknown_count: 0, grr_count: 23 });
  assert.deepEqual(countsAfterChange(base, "lead", "lead"), {});
});

test("portfolio summary", () => {
  const s = portfolioSummary([base, { ...base, last_notice_date: "2026-06-01" }], NOW);
  assert.equal(s.systems, 2);
  assert.equal(s.lines, 1006);
  assert.equal(s.pool, 382);
  assert.equal(s.noticesDue, 1);
});

test("CSV escapes commas and quotes", () => {
  const csv = stateCsv([{ ...base, name: 'Smith, "North" WSD', pwsid: "OH1", population: 10 }]);
  const [header, row] = csv.split("\n");
  assert.ok(header.startsWith("pwsid,system_name"));
  assert.ok(row.startsWith('OH1,"Smith, ""North"" WSD",10,503,38,22,131,312,N,N,20'));
});

test("example lines are deterministic with valid materials and addresses", () => {
  const a = exampleLines(EXAMPLE_SYSTEMS[0], "sys1");
  const b = exampleLines(EXAMPLE_SYSTEMS[0], "sys1");
  assert.deepEqual(a, b);
  assert.equal(a.length, 10);
  assert.equal(a.filter((l) => l.material === "unknown").length >= 3, true);
  for (const l of a) {
    assert.match(l.address, /^\d{3} [A-Z0-9]/);
    assert.ok(["lead", "grr", "unknown", "non_lead"].includes(l.material));
    assert.equal(l.system_id, "sys1");
  }
});
