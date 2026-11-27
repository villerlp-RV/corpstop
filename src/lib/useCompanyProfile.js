import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { unwrap, useData } from "@/lib/DataContext";

// The business shown on reports: the team's profile, or the user's own on a personal account.
export function useCompanyProfile() {
  const { teamId, teamRole } = useData();
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = none yet
  const canEdit = !teamId || teamRole === "owner";

  const load = useCallback(async () => {
    try {
      const rows = unwrap(await base44.entities.CompanyProfile.filter({ team_id: teamId ?? null }, { limit: 5 }));
      setProfile(rows[0] || null);
    } catch {
      setProfile(null);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (data) => {
      const saved = profile?.id
        ? await base44.entities.CompanyProfile.update(profile.id, data)
        : await base44.entities.CompanyProfile.create({ ...data, team_id: teamId ?? null });
      setProfile({ ...(profile || {}), ...data, ...(saved || {}) });
      return saved;
    },
    [profile, teamId]
  );

  return { profile, loading: profile === undefined, canEdit, save, reload: load };
}
