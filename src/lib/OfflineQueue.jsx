import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useData } from "@/lib/DataContext";
import { queueStore } from "@/lib/offline-store";
import { queueSummary } from "@/lib/offline";
import { syncAll } from "@/lib/sync-visits";

const OfflineContext = createContext(null);
const RETRY_MS = 30000;

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error("useOffline must be used inside OfflineQueueProvider");
  return ctx;
}

// Holds field visits recorded on this device until they reach the server.
// Syncs on load, when the device comes back online or to the foreground, after
// each new visit, and every 30 seconds while anything is waiting.
export function OfflineQueueProvider({ children }) {
  const { reload, bumpLines } = useData();
  const [queue, setQueue] = useState([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => setQueue(await queueStore.list().catch(() => [])), []);

  const syncNow = useCallback(async () => {
    if (busy.current) return null;
    busy.current = true;
    setSyncing(true);
    try {
      const result = await syncAll(base44, queueStore, { online: navigator.onLine });
      if (result.synced) {
        await reload();
        bumpLines();
      }
      return result;
    } finally {
      busy.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [reload, bumpLines, refresh]);

  const enqueue = useCallback(
    async (item) => {
      await queueStore.put(item);
      await refresh();
      if (navigator.onLine) await syncNow();
      const still = (await queueStore.list()).find((q) => q.id === item.id);
      return still ? (still.error ? "failed" : "queued") : "saved";
    },
    [refresh, syncNow]
  );

  const discard = useCallback(async (id) => {
    await queueStore.remove(id);
    await refresh();
  }, [refresh]);

  const retry = useCallback(async (id) => {
    const item = (await queueStore.list()).find((q) => q.id === id);
    if (item) await queueStore.put({ ...item, error: null });
    await syncNow();
  }, [syncNow]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh().then(() => navigator.onLine && syncNow());
    const up = () => {
      setOnline(true);
      syncNow();
    };
    const down = () => setOnline(false);
    const visible = () => document.visibilityState === "visible" && navigator.onLine && syncNow();
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, syncNow]);

  const summary = queueSummary(queue);
  useEffect(() => {
    if (!summary.pending) return undefined;
    const t = setInterval(() => navigator.onLine && syncNow(), RETRY_MS);
    return () => clearInterval(t);
  }, [summary.pending, syncNow]);

  const value = useMemo(
    () => ({ queue, summary, online, syncing, enqueue, syncNow, discard, retry }),
    [queue, summary, online, syncing, enqueue, syncNow, discard, retry]
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
