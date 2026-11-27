// Offline visit queue: rules shared by the store and the sync loop. Pure, unit-tested.

// A failure worth retrying later (no signal, timeout, server briefly down),
// as opposed to a refusal (no permission, line deleted) that retrying won't fix.
export function isRetryable(err, online = true) {
  if (!online) return true;
  const status = err?.status ?? err?.response?.status;
  if (status == null) return true; // network error: the request never got an answer
  return status === 408 || status === 429 || status >= 500;
}

export function newQueueId(now = Date.now(), rand = Math.random) {
  return `v${now.toString(36)}${Math.floor(rand() * 1e8).toString(36)}`;
}

// What the phone keeps for one visit until it reaches the server.
export function queuedVisit({ line, input, photos, user, now = new Date() }) {
  return {
    id: newQueueId(now.getTime()),
    lineId: line.id,
    systemId: line.system_id,
    address: line.address,
    input: {
      material: input.material,
      method: input.method,
      notes: input.notes || "",
      ...(input.ownership ? { ownership: input.ownership, system_side: input.system_side, customer_side: input.customer_side } : {}),
      ...(input.material_type ? { material_type: input.material_type } : {}),
      ...(input.connector !== undefined ? { connector: input.connector } : {}),
    },
    photos: photos || [], // Blobs; IndexedDB stores them as-is
    user: { full_name: user?.full_name || "", email: user?.email || "" },
    recordedAt: now.toISOString(),
    attempts: 0,
    error: null,
  };
}

// Lines with a queued visit drop out of the "to do" list on this phone.
export function hideQueued(lines, queue) {
  const queued = new Set(queue.map((q) => q.lineId));
  return lines.filter((l) => !queued.has(l.id));
}

export function queueSummary(queue) {
  const failed = queue.filter((q) => q.error);
  return { pending: queue.length - failed.length, failed: failed.length, total: queue.length };
}
