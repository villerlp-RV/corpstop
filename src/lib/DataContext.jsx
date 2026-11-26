import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";

const DataContext = createContext(null);

// The SDK returns either a page ({ items }) or a plain array, depending on the call shape.
export const unwrap = (res) => (Array.isArray(res) ? res : res?.items ?? []);

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}

// Loads the signed-in user's water systems once and shares them across pages.
export function DataProvider({ children }) {
  const [systems, setSystems] = useState(null);
  const [loadError, setLoadError] = useState(false);

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

  useEffect(() => {
    reload();
  }, [reload]);

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
    () => ({ systems, loading: systems === null, loadError, reload, updateSystem }),
    [systems, loadError, reload, updateSystem]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export async function linesFor(systemId, limit = 500) {
  return unwrap(await base44.entities.ServiceLine.filter({ system_id: systemId }, { sort: "address", limit }));
}
