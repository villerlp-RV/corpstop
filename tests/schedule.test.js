import test from "node:test";
import assert from "node:assert/strict";
import { replacementSchedule } from "../src/lib/lcri.js";

test("ten-year schedule reaches the whole pool by year 10", () => {
  const s = replacementSchedule(191);
  assert.equal(s.length, 10);
  assert.deepEqual(s[0], { year: 1, from: "Nov 1, 2027", to: "Oct 31, 2028", annual: 20, cumulative: 20, percent: 10 });
  assert.equal(s[9].cumulative, 191);
  assert.equal(s[9].to, "Oct 31, 2037");
  assert.equal(s.reduce((a, r) => a + r.annual, 0), 191);
  assert.ok(s.every((r, i) => i === 0 || r.cumulative >= s[i - 1].cumulative));
});

test("exact tens and small or empty pools", () => {
  assert.deepEqual(replacementSchedule(100).map((r) => r.annual), Array(10).fill(10));
  const small = replacementSchedule(3);
  assert.equal(small[9].cumulative, 3);
  assert.equal(small.reduce((a, r) => a + r.annual, 0), 3);
  assert.ok(replacementSchedule(0).every((r) => r.annual === 0 && r.percent === 0));
});
