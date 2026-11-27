import test from "node:test";
import assert from "node:assert/strict";
import { isStaleBuildError, shouldReload } from "../src/lib/stale-build.js";

test("recognises errors from a tab running an older version", () => {
  assert.ok(isStaleBuildError(new Error("useOffline must be used inside OfflineQueueProvider")));
  assert.ok(isStaleBuildError(new Error("useData must be used inside DataProvider")));
  assert.ok(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: https://app.linetally.com/assets/field-x.js")));
  assert.ok(isStaleBuildError({ message: "Importing a module script failed." }));
  assert.ok(!isStaleBuildError(new Error("Cannot read properties of undefined")));
  assert.ok(!isStaleBuildError(null));
});

test("reloads at most once a minute", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(shouldReload(storage, 1_000_000), true);
  assert.equal(shouldReload(storage, 1_030_000), false);
  assert.equal(shouldReload(storage, 1_061_000), true);
  assert.equal(shouldReload({ getItem: () => { throw new Error("blocked"); } }), false);
});
