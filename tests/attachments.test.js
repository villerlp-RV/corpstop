import test from "node:test";
import assert from "node:assert/strict";
import { MAX_ATTACHMENTS, addAttachmentsPatch, attachmentRecord, attachmentsOf, checkFile, cleanName, formatBytes, removeAttachmentPatch, roomFor } from "../src/lib/attachments.js";
import { fieldRecordPatch } from "../src/lib/fieldwork.js";
import { queuedVisit } from "../src/lib/offline.js";
import { syncVisit } from "../src/lib/sync-visits.js";

test("which files can be attached", () => {
  assert.equal(checkFile({ name: "Tap card 12 Oak.PDF", size: 1000 }), null);
  assert.equal(checkFile({ name: "permit.docx", size: 1000 }), null);
  assert.match(checkFile({ name: "virus.exe", size: 1000 }), /use PDF, image/);
  assert.match(checkFile({ name: "big.pdf", size: 21 * 1024 * 1024 }), /over 20 MB/);
  assert.match(checkFile({ name: "empty.pdf", size: 0 }), /empty/);
  assert.equal(cleanName('a/b:c*?.pdf'), "a_b_c_.pdf");
  assert.equal(formatBytes(1536), "2 KB");
  assert.equal(formatBytes(5.25 * 1024 * 1024), "5.3 MB");
});

test("adding and removing attachments on a line", () => {
  const now = new Date("2026-11-27T18:00:00Z");
  const a = attachmentRecord({ uri: "p://1", name: "tap.pdf", type: "application/pdf", size: 10 }, { full_name: "Jo" }, now);
  assert.deepEqual(a, { uri: "p://1", name: "tap.pdf", type: "application/pdf", size: 10, added_at: now.toISOString(), added_by: "Jo" });
  const line = { attachments: [a] };
  const b = { ...a, uri: "p://2", name: "permit.pdf" };
  assert.deepEqual(addAttachmentsPatch(line, [a, b]).attachments.map((x) => x.uri), ["p://1", "p://2"], "no duplicates");
  assert.deepEqual(removeAttachmentPatch({ attachments: [a, b] }, "p://1").attachments.map((x) => x.uri), ["p://2"]);
  assert.deepEqual(attachmentsOf({}), []);
  const full = { attachments: Array.from({ length: MAX_ATTACHMENTS }, (_, i) => ({ ...a, uri: `p://x${i}` })) };
  assert.equal(roomFor(full), 0);
  assert.equal(addAttachmentsPatch(full, [b]).attachments.length, MAX_ATTACHMENTS);
});

test("field visits carry attachments through the offline queue", async () => {
  const blob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
  const file = Object.assign(blob, { name: "tap-card.pdf" });
  const item = queuedVisit({ line: { id: "l1", system_id: "s1", address: "9 Main" }, input: { material: "non_lead", method: "Tap card" }, photos: [], files: [file], user: { full_name: "Jo" }, now: new Date("2026-11-26T10:00:00Z") });
  assert.equal(item.files[0].name, "tap-card.pdf");

  const line = { id: "l1", system_id: "s1", material: "unknown", attachments: [] };
  const uploads = [];
  const base44 = {
    entities: {
      ServiceLine: { get: async () => line, update: async (_, p) => Object.assign(line, p) },
      WaterSystem: { get: async () => ({ id: "s1", unknown_count: 5, nonlead_count: 1 }), update: async () => ({}) },
    },
    integrations: { Core: { UploadPrivateFile: async ({ file }) => (uploads.push(file.name), { file_uri: `p://${uploads.length}` }) } },
  };
  const store = { put: async () => {}, remove: async () => {} };
  await syncVisit(base44, store, item);
  assert.deepEqual(uploads, ["tap-card.pdf"]);
  assert.equal(line.attachments.length, 1);
  assert.deepEqual([line.attachments[0].name, line.attachments[0].uri, line.attachments[0].added_by], ["tap-card.pdf", "p://1", "Jo"]);
  assert.equal(fieldRecordPatch({}, { material: "lead", method: "Tap card" }, {}).patch.attachments, undefined);
});
