// Phone-side storage for the offline queue (visits plus photo Blobs) and a
// snapshot of the tech's assignments. IndexedDB, because it stores Blobs and
// survives the app being closed. Falls back to memory if IndexedDB is blocked
// (private browsing), so the app still works, just without surviving a reload.

const DB_NAME = "corpstop-offline";
const QUEUE = "queue";
const CACHE = "cache";

let dbPromise;
const memory = { [QUEUE]: new Map(), [CACHE]: new Map() };

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await openDb();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const queueStore = {
  async list() {
    const rows = await run(QUEUE, "readonly", (s) => (s ? s.getAll() : { result: [...memory[QUEUE].values()] }));
    return (rows || []).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  },
  put: (item) => run(QUEUE, "readwrite", (s) => (s ? s.put(item) : (memory[QUEUE].set(item.id, item), null))),
  remove: (id) => run(QUEUE, "readwrite", (s) => (s ? s.delete(id) : (memory[QUEUE].delete(id), null))),
};

export const cacheStore = {
  get: (key) => run(CACHE, "readonly", (s) => (s ? s.get(key) : { result: memory[CACHE].get(key) })),
  set: (key, value) => run(CACHE, "readwrite", (s) => (s ? s.put(value, key) : (memory[CACHE].set(key, value), null))),
};
