import { CalendarClock } from "lucide-react";
import { deadlineLabel, isClosed, isOverdue, riskLabel, riskTone } from "@/lib/regulations";
import { cn } from "@/lib/utils";

export default function RegulationCard({ regulation, onOpen }) {
  const overdue = !isClosed(regulation.status) && isOverdue(regulation.deadline);

  return (
    <div
      onClick={() => onOpen(regulation)}
      className="cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition hover:border-foreground/25 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{regulation.title}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            riskTone(regulation.risk)
          )}
        >
          {riskLabel(regulation.risk)}
        </span>
      </div>

      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {regulation.agency || "No agency"}
        {regulation.reference_code ? ` · ${regulation.reference_code}` : ""}
      </p>

      {regulation.deadline && (
        <div
          className={cn(
            "mt-2.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px]",
            overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
          )}
        >
          <CalendarClock className="h-3 w-3 shrink-0" />
          <span className="truncate">{overdue ? "Compliance deadline" : "Deadline"}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px]">
            {deadlineLabel(regulation.deadline)}
          </span>
        </div>
      )}
    </div>
  );
}