import test from "node:test";
import assert from "node:assert/strict";
import { hideQueued, isRetryable, queueSummary, queuedVisit } from "../src/lib/offline.js";

test("retry network failures and server hiccups, not refusals", () => {
  assert.equal(isRetryable(new TypeError("Failed to fetch")), true);
  assert.equal(isRetryable({ status: 503 }), true);
  assert.equal(isRetryable({ status: 429 }), true);
  assert.equal(isRetryable({ status: 403 }), false);
  assert.equal(isRetryable({ status: 404 }), false);
  assert.equal(isRetryable({ status: 403 }, false), true, "anything is retryable while offline");
});

test("queued visit keeps what the sync needs", () => {
  const now = new Date("2026-11-26T15:00:00Z");
  const blob = { size: 10 };
  const q = queuedVisit({ line: { id: "l1", system_id: "s1", address: "9 Main" }, input: { material: "lead", method: "Tap card", notes: "x" }, photos: [blob], user: { full_name: "Jo" }, now });
  assert.equal(q.lineId, "l1");
  assert.equal(q.systemId, "s1");
  assert.equal(q.recordedAt, now.toISOString());
  assert.deepEqual(q.input, { material: "lead", method: "Tap card", notes: "x" });
  assert.equal(q.photos[0], blob);
  assert.match(q.id, /^v/);
});

test("queued lines leave the to-do list; summary counts failures", () => {
  const lines = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(hideQueued(lines, [{ lineId: "a" }]), [{ id: "b" }]);
  assert.deepEqual(queueSummary([{ error: null }, { error: "Line deleted" }]), { pending: 1, failed: 1, total: 2 });
});
