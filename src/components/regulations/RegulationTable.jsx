import {
  deadlineLabel,
  isClosed,
  isOverdue,
  jurisdictionLabel,
  riskLabel,
  riskTone,
  STATUS_BADGE,
  statusLabel,
} from "@/lib/regulations";
import { cn } from "@/lib/utils";

export default function RegulationTable({ regulations, onOpen }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="hidden grid-cols-[2fr_1fr_0.8fr_0.9fr_1fr] gap-3 border-b border-border bg-secondary/50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:grid">
        <span>Regulation</span>
        <span>Status</span>
        <span>Risk</span>
        <span>Jurisdiction</span>
        <span>Deadline</span>
      </div>

      <ul className="divide-y divide-border">
        {regulations.map((regulation) => {
          const overdue = !isClosed(regulation.status) && isOverdue(regulation.deadline);
          return (
            <li key={regulation.id}>
              <button
                onClick={() => onOpen(regulation)}
                className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors hover:bg-secondary/50 md:grid-cols-[2fr_1fr_0.8fr_0.9fr_1fr] md:items-center md:gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{regulation.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[regulation.agency, regulation.reference_code].filter(Boolean).join(" · ") ||
                      "No agency"}
                  </p>
                </div>
                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                      STATUS_BADGE[regulation.status] || STATUS_BADGE.monitor
                    )}
                  >
                    {statusLabel(regulation.status)}
                  </span>
                </div>
                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                      riskTone(regulation.risk)
                    )}
                  >
                    {riskLabel(regulation.risk)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {jurisdictionLabel(regulation.jurisdiction)}
                </p>
                <p
                  className={cn(
                    "font-mono text-xs",
                    overdue ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {regulation.deadline ? deadlineLabel(regulation.deadline) : "—"}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}