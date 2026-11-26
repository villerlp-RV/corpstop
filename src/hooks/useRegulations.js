import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const unwrap = (res) => (Array.isArray(res) ? res : res?.items ?? []);

export function useRegulations({ search = "", status = "all", jurisdiction = "all" } = {}) {
  return useQuery({
    queryKey: ["regulations", search, status, jurisdiction],
    queryFn: async () => {
      const query = {};
      if (status && status !== "all") query.status = status;
      if (jurisdiction && jurisdiction !== "all") query.jurisdiction = jurisdiction;
      const term = search.trim();
      if (term) {
        query.$or = [
          { title: { $regex: term, $options: "i" } },
          { agency: { $regex: term, $options: "i" } },
          { reference_code: { $regex: term, $options: "i" } },
        ];
      }
      const res = await base44.entities.Regulation.filter(query, {
        sort: "-updated_date",
        limit: 300,
      });
      return unwrap(res);
    },
  });
}

export function useRegulation(id) {
  return useQuery({
    queryKey: ["regulation", id],
    enabled: Boolean(id),
    queryFn: () => base44.entities.Regulation.get(id),
  });
}

export function useRegulationActivity(regulationId) {
  return useQuery({
    queryKey: ["regulation-activity", regulationId],
    enabled: Boolean(regulationId),
    queryFn: async () => {
      const res = await base44.entities.Activity.filter(
        { regulation_id: regulationId },
        { sort: "-occurred_at", limit: 100 }
      );
      return unwrap(res);
    },
  });
}