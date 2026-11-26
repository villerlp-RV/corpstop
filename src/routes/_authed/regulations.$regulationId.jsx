import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import RegulationActivityFeed from "@/components/regulations/RegulationActivityFeed";
import RegulationDetailsCard from "@/components/regulations/RegulationDetailsCard";
import RegulationFormDialog from "@/components/regulations/RegulationFormDialog";
import RegulationStatusCard from "@/components/regulations/RegulationStatusCard";
import { useRegulation } from "@/hooks/useRegulations";
import {
  deadlineLabel,
  formatDate,
  jurisdictionLabel,
  riskLabel,
  riskTone,
  STATUS_BADGE,
  statusLabel,
} from "@/lib/regulations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authed/regulations/$regulationId")({
  head: () => ({ meta: [{ title: "Regulation — Lead Pipe" }] }),
  component: RegulationDetailPage,
});

function RegulationDetailPage() {
  const { regulationId } = Route.useParams();
  const { data: regulation, isLoading } = useRegulation(regulationId);
  const [editOpen, setEditOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const changeStatus = useMutation({
    mutationFn: async (status) => {
      await base44.entities.Regulation.update(regulationId, { status });
      await base44.entities.Activity.create({
        regulation_id: regulationId,
        type: "status_change",
        summary: `Status changed to ${statusLabel(status)}`,
        occurred_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regulation", regulationId] });
      queryClient.invalidateQueries({ queryKey: ["regulations"] });
      queryClient.invalidateQueries({ queryKey: ["regulation-activity", regulationId] });
    },
    onError: (error) => toast.error(error?.message || "Could not update the status."),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await base44.entities.Activity.deleteMany({ regulation_id: regulationId });
      await base44.entities.Regulation.delete(regulationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regulations"] });
      toast.success("Regulation removed");
      navigate({ to: "/regulations" });
    },
    onError: (error) => toast.error(error?.message || "Could not remove this regulation."),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8">
        <div className="h-6 w-28 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-9 w-2/3 animate-pulse rounded bg-secondary" />
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="h-80 animate-pulse rounded-xl bg-secondary/70" />
          <div className="h-40 animate-pulse rounded-xl bg-secondary/70" />
        </div>
      </div>
    );
  }

  if (!regulation) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-16 text-center md:px-8">
        <h1 className="font-heading text-xl font-semibold">Regulation not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          It may have been removed, or it belongs to someone else.
        </p>
        <Button asChild className="mt-5">
          <Link to="/regulations">Back to regulations</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <Link
        to="/regulations"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All regulations
      </Link>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold leading-tight tracking-tight md:text-3xl">
            {regulation.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{regulation.agency || "No agency"}</span>
            {regulation.reference_code && (
              <span className="font-mono">· {regulation.reference_code}</span>
            )}
            <span>· {jurisdictionLabel(regulation.jurisdiction)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                STATUS_BADGE[regulation.status] || STATUS_BADGE.monitor
              )}
            >
              {statusLabel(regulation.status)}
            </span>
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                riskTone(regulation.risk)
              )}
            >
              {riskLabel(regulation.risk)} risk
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this regulation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This deletes “{regulation.title}” and its activity history. It can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => remove.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <RegulationDetailsCard regulation={regulation} />
          <RegulationActivityFeed regulationId={regulationId} />
        </div>

        <div className="space-y-4">
          <RegulationStatusCard
            status={regulation.status}
            onChange={(status) => changeStatus.mutate(status)}
            pending={changeStatus.isPending}
          />

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-heading text-sm font-semibold">Deadline</h2>
            <p className="mt-2 font-heading text-2xl font-bold tracking-tight">
              {regulation.deadline ? deadlineLabel(regulation.deadline) : "None set"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {regulation.deadline
                ? formatDate(regulation.deadline)
                : "Add a compliance deadline when you edit."}
            </p>
          </section>
        </div>
      </div>

      <RegulationFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        regulation={regulation}
      />
    </div>
  );
}