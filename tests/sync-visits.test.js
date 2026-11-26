import test from "node:test";
import assert from "node:assert/strict";
import { syncAll } from "../src/lib/sync-visits.js";
import { queuedVisit } from "../src/lib/offline.js";

function memStore(items = []) {
  const m = new Map(items.map((i) => [i.id, i]));
  return { m, list: async () => [...m.values()], put: async (i) => void m.set(i.id, i), remove: async (id) => void m.delete(id) };
}

function fakeBase44({ failUpload = 0, offlineOnUpdate = false, lineStatus } = {}) {
  const db = {
    ServiceLine: new Map([["l1", { id: "l1", system_id: "s1", address: "9 Main", material: "unknown", assignment_status: "open" }]]),
    WaterSystem: new Map([["s1", { id: "s1", unknown_count: 10, nonlead_count: 5 }]]),
  };
  let uploads = 0;
  let uploadFailures = failUpload;
  const ent = (name) => ({
    get: async (id) => {
      if (lineStatus && name === "ServiceLine") throw { status: lineStatus };
      const r = db[name].get(id);
      if (!r) throw { status: 404 };
      return r;
    },
    update: async (id, patch) => {
      if (offlineOnUpdate) throw new TypeError("Failed to fetch");
      Object.assign(db[name].get(id), patch);
    },
  });
  return {
    db,
    uploads: () => uploads,
    entities: { ServiceLine: ent("ServiceLine"), WaterSystem: ent("WaterSystem") },
    integrations: { Core: { UploadPrivateFile: async () => {
      if (uploadFailures > 0) { uploadFailures -= 1; throw new TypeError("Failed to fetch"); }
      uploads += 1;
      return { file_uri: `p://${uploads}` };
    } } },
  };
}

const visit = (photos = []) =>
  queuedVisit({ line: { id: "l1", system_id: "s1", address: "9 Main" }, input: { material: "non_lead", method: "Potholing", notes: "" }, photos, user: { full_name: "Jo" }, now: new Date("2026-11-26T10:00:00Z") });

test("a queued visit updates the line, photos and system counts, then leaves the queue", async () => {
  const b = fakeBase44();
  const store = memStore([visit([new Blob(["a"]), new Blob(["b"])])]);
  const r = await syncAll(b, store);
  assert.deepEqual(r, { synced: 1, failed: 0, stopped: false });
  const line = b.db.ServiceLine.get("l1");
  assert.equal(line.material, "non_lead");
  assert.equal(line.assignment_status, "done");
  assert.equal(line.completed_at, "2026-11-26T10:00:00.000Z", "keeps the time it was recorded, not the upload time");
  assert.deepEqual(line.photo_uris, ["p://1", "p://2"]);
  assert.equal(b.db.WaterSystem.get("s1").unknown_count, 9);
  assert.equal(b.db.WaterSystem.get("s1").nonlead_count, 6);
  assert.equal(store.m.size, 0);
});

test("no signal mid-upload: stays queued and doesn't re-upload finished photos", async () => {
  const b = fakeBase44();
  const v = visit([new Blob(["a"]), new Blob(["b"])]);
  const store = memStore([v]);
  // first photo uploads, then the connection drops on the second
  let calls = 0;
  const real = b.integrations.Core.UploadPrivateFile;
  b.integrations.Core.UploadPrivateFile = async (x) => { calls += 1; if (calls === 2) throw new TypeError("Failed to fetch"); return real(x); };
  const r1 = await syncAll(b, store);
  assert.equal(r1.stopped, true);
  assert.deepEqual(store.m.get(v.id).uploaded, ["p://1"]);
  b.integrations.Core.UploadPrivateFile = real;
  const r2 = await syncAll(b, store);
  assert.equal(r2.synced, 1);
  assert.deepEqual(b.db.ServiceLine.get("l1").photo_uris, ["p://1", "p://2"]);
  assert.equal(b.uploads(), 2, "two photos, two uploads in total");
});

test("a deleted line is marked failed instead of retrying forever", async () => {
  const b = fakeBase44({ lineStatus: 404 });
  const v = visit();
  const store = memStore([v]);
  const r = await syncAll(b, store);
  assert.deepEqual(r, { synced: 0, failed: 1, stopped: false });
  assert.match(store.m.get(v.id).error, /deleted/);
  assert.deepEqual(await syncAll(b, store), { synced: 0, failed: 0, stopped: false }, "failed items are skipped");
});

test("offline during the update keeps the visit queued", async () => {
  const b = fakeBase44({ offlineOnUpdate: true });
  const v = visit();
  const store = memStore([v]);
  const r = await syncAll(b, store);
  assert.equal(r.stopped, true);
  assert.equal(store.m.get(v.id).attempts, 1);
  assert.equal(store.m.get(v.id).error, null);
});
