// Uploads queued field visits. Every visit, online or not, goes through the
// queue, so there is one save path. The Base44 client and the store are passed
// in so tests can use fakes.
import { countsAfterChange } from "./lcri.js";
import { fieldRecordPatch } from "./fieldwork.js";
import { isRetryable } from "./offline.js";

const photoFile = (blob, i, recordedAt) =>
  new File([blob], `visit-${recordedAt.slice(0, 10)}-${i + 1}.jpg`, { type: blob.type || "image/jpeg" });

export async function syncVisit(base44, store, item) {
  let line;
  try {
    line = await base44.entities.ServiceLine.get(item.lineId);
  } catch (err) {
    if (err?.status === 404) throw Object.assign(new Error("This service line was deleted, so the visit can't be saved."), { status: 404 });
    throw err;
  }

  const fromMaterial = line.material; // read before the update changes it

  // Upload photos once; remember the results so a retry doesn't upload twice.
  if (item.photos?.length) {
    const uris = [...(item.uploaded || [])];
    for (let i = uris.length; i < item.photos.length; i++) {
      const res = await base44.integrations.Core.UploadPrivateFile({ file: photoFile(item.photos[i], i, item.recordedAt) });
      uris.push(res.file_uri);
      item = { ...item, uploaded: uris };
      await store.put(item);
    }
    item = { ...item, photos: [], uploaded: uris };
    await store.put(item);
  }

  const { patch, error } = fieldRecordPatch(line, { ...item.input, photo_uris: item.uploaded || [] }, item.user, new Date(item.recordedAt));
  if (error) throw Object.assign(new Error(error), { status: 400 });
  await base44.entities.ServiceLine.update(line.id, patch);

  // Move the system's count from whatever the line was on the server just now.
  const system = await base44.entities.WaterSystem.get(item.systemId).catch(() => null);
  if (system) {
    const counts = countsAfterChange(system, fromMaterial, patch.material);
    if (Object.keys(counts).length) await base44.entities.WaterSystem.update(system.id, counts);
  }
  await store.remove(item.id);
}

// Sync everything in order. Stops at the first retryable failure (no signal);
// marks refusals on the item so the tech can see and discard them.
export async function syncAll(base44, store, { online = true } = {}) {
  const result = { synced: 0, failed: 0, stopped: false };
  for (const item of await store.list()) {
    if (item.error) continue;
    try {
      await syncVisit(base44, store, item);
      result.synced += 1;
    } catch (err) {
      // syncVisit saves upload progress as it goes; build on that copy, not the stale one.
      const latest = (await store.list()).find((x) => x.id === item.id) || item;
      if (isRetryable(err, online)) {
        await store.put({ ...latest, attempts: (latest.attempts || 0) + 1 });
        result.stopped = true;
        break;
      }
      await store.put({ ...latest, error: err?.message || "The server refused this visit." });
      result.failed += 1;
    }
  }
  return result;
}
