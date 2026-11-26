import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { teamIdOf, teamRoleOf } from "@/lib/team";

const DataContext = createContext(null);

// The SDK returns either a page ({ items }) or a plain array, depending on the call shape.
export const unwrap = (res) => (Array.isArray(res) ? res : res?.items ?? []);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}

// Loads the water systems the signed-in user can see (their team's, or their
// own on a personal account) and shares them across pages. `teamId` is stamped
// on every record the app creates so the whole team sees it.
export function DataProvider({ children }) {
  const { user } = useAuth();
  const teamId = teamIdOf(user);
  const teamRole = teamRoleOf(user);
  const [systems, setSystems] = useState(null);
  const [loadError, setLoadError] = useState(false);
  // Bumped whenever service lines change anywhere (this device or another), so
  // pages that show lines refetch them.
  const [lineVersion, setLineVersion] = useState(0);
  const [live, setLive] = useState(false);
  const bumpLines = useCallback(() => setLineVersion((v) => v + 1), []);

  const reload = useCallback(async () => {
    try {
      const res = await base44.entities.WaterSystem.list({ sort: "name", limit: 500 });
      setSystems(unwrap(res));
      setLoadError(false);
    } catch {
      setLoadError(true);
      setSystems((prev) => prev ?? []);
    }
  }, []);

  // Reload when the user joins, leaves or switches team.
  useEffect(() => {
    reload();
  }, [reload, teamId]);

  // Live sync between devices: the office desktop and a field tech's phone see
  // each other's changes within a second. Realtime events are batched; when the
  // app returns to the foreground or the phone reconnects, everything refetches
  // in case events were missed while it slept.
  useEffect(() => {
    let systemsTimer;
    let linesTimer;
    const unsubs = [];
    try {
      unsubs.push(base44.entities.WaterSystem.subscribe(() => {
        clearTimeout(systemsTimer);
        systemsTimer = setTimeout(reload, 300);
      }));
      unsubs.push(base44.entities.ServiceLine.subscribe(() => {
        clearTimeout(linesTimer);
        linesTimer = setTimeout(bumpLines, 300);
      }));
      setLive(true);
    } catch {
      setLive(false);
    }
    const resync = () => {
      if (document.visibilityState !== "visible") return;
      reload();
      bumpLines();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    return () => {
      unsubs.forEach((off) => {
        try {
          off();
        } catch {
          /* already closed */
        }
      });
      clearTimeout(systemsTimer);
      clearTimeout(linesTimer);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
    };
  }, [reload, teamId]);

  // Save a change and reflect it locally right away.
  const updateSystem = useCallback(
    async (id, patch) => {
      setSystems((prev) => (prev || []).map((s) => (s.id === id ? { ...s, ...patch } : s)));
      try {
        await base44.entities.WaterSystem.update(id, patch);
      } catch (err) {
        await reload();
        throw err;
      }
    },
    [reload]
  );

  const value = useMemo(
    () => ({ systems, loading: systems === null, loadError, reload, updateSystem, teamId, teamRole, lineVersion, live, bumpLines }),
    [systems, loadError, reload, updateSystem, teamId, teamRole, lineVersion, live, bumpLines]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export async function linesFor(systemId, limit = 500) {
  return unwrap(await base44.entities.ServiceLine.filter({ system_id: systemId }, { sort: "address", limit }));
}
