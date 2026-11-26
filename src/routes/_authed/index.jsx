import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import RegulationBoard from "@/components/regulations/RegulationBoard";
import RegulationFormDialog from "@/components/regulations/RegulationFormDialog";
import TrackerStats from "@/components/regulations/TrackerStats";
import { useRegulations } from "@/hooks/useRegulations";
import { statusLabel } from "@/lib/regulations";

export const Route = createFileRoute("/_authed/")({
  head: () => ({ meta: [{ title: "Tracker — Lead Pipe" }] }),
  component: TrackerPage,
});

function TrackerPage() {
  const { data: regulations = [], isLoading } = useRegulations();
  const [formOpen, setFormOpen] = useState(false);
  const queryClient = useQueryClient();

  const move = useMutation({
    mutationFn: async ({ id, status }) => {
      await base44.entities.Regulation.update(id, { status });
      await base44.entities.Activity.create({
        regulation_id: id,
        type: "status_change",
        summary: `Status changed to ${statusLabel(status)}`,
        occurred_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regulations"] });
      queryClient.invalidateQueries({ queryKey: ["regulation-activity"] });
    },
    onError: (error) => toast.error(error?.message || "Could not move this regulation."),
  });

  const handleMove = (id, status) => move.mutate({ id, status });

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            United States · environmental compliance
          </p>
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">Regulation tracker</h1>
        </div>
        <Button className="gap-2 self-start sm:self-auto" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Track a regulation
        </Button>
      </div>

      <div className="mt-6">
        <TrackerStats regulations={regulations} />
      </div>

      <div className="mt-7">
        {isLoading ? (
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((column) => (
              <div
                key={column}
                className="h-64 w-[272px] shrink-0 animate-pulse rounded-xl bg-secondary/70"
              />
            ))}
          </div>
        ) : regulations.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/25">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-heading text-lg font-semibold">No regulations tracked yet</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Add the environmental rules that apply to you — federal, state or local — then move
              them through assessment to compliance.
            </p>
            <Button className="mt-5 gap-2" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Track your first regulation
            </Button>
          </div>
        ) : (
          <RegulationBoard regulations={regulations} onMove={handleMove} />
        )}
      </div>

      <RegulationFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}