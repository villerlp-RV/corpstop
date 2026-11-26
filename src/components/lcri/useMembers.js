import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/AuthContext";
import { getTeamOverview } from "@/lib/server-fns";

// People work can be assigned to: the team's members, or just me on a personal account.
export function useMembers() {
  const { user } = useAuth();
  const fetchOverview = useServerFn(getTeamOverview);
  const [members, setMembers] = useState(null);
  const self = user ? [{ id: user.id, name: user.full_name || user.email || "Me", email: user.email || "", role: "owner" }] : [];

  useEffect(() => {
    let active = true;
    fetchOverview()
      .then((o) => active && setMembers(o?.team && o.members?.length ? o.members : null))
      .catch(() => active && setMembers(null));
    return () => {
      active = false;
    };
  }, [fetchOverview, user?.id]);

  return members || self;
}
