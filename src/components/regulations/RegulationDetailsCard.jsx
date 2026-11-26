import { CalendarClock, ExternalLink, Landmark, User } from "lucide-react";
import {
  formatDate,
  industryLabel,
  jurisdictionLabel,
  riskLabel,
  riskTone,
  STATUS_BADGE,
  statusLabel,
} from "@/lib/regulations";
import { cn } from "@/lib/utils";

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      <span className="max-w-[64%] text-right text-xs font-medium">{children}</span>
    </div>
  );
}

export default function RegulationDetailsCard({ regulation }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-sm font-semibold">Details</h2>

      <div className="mt-2">
        <Row label="Agency">
          <span className="inline-flex items-center gap-1.5">
            <Landmark className="h-3 w-3 text-muted-foreground" />
            {regulation.agency || "—"}
          </span>
        </Row>
        <Row label="Citation">{regulation.reference_code || "—"}</Row>
        <Row label="Jurisdiction">{jurisdictionLabel(regulation.jurisdiction)}</Row>
        <Row label="Applies to">
          {regulation.industries?.length ? (
            <span className="inline-flex flex-wrap justify-end gap-1">
              {regulation.industries.map((id) => (
                <span
                  key={id}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium"
                >
                  {industryLabel(id)}
                </span>
              ))}
            </span>
          ) : (
            "—"
          )}
        </Row>
        <Row label="Status">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
              STATUS_BADGE[regulation.status] || STATUS_BADGE.monitor
            )}
          >
            {statusLabel(regulation.status)}
          </span>
        </Row>
        <Row label="Risk">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
              riskTone(regulation.risk)
            )}
          >
            {riskLabel(regulation.risk)}
          </span>
        </Row>
        <Row label="Owner">
          <span className="inline-flex items-center gap-1.5">
            <User className="h-3 w-3 text-muted-foreground" />
            {regulation.owner || "Unassigned"}
          </span>
        </Row>
        <Row label="Effective">{formatDate(regulation.effective_date) || "—"}</Row>
        <Row label="Deadline">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3 w-3 text-muted-foreground" />
            {formatDate(regulation.deadline) || "—"}
          </span>
        </Row>
        <Row label="Source">
          {regulation.source_url ? (
            <a
              href={regulation.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3" />
              View official text
            </a>
          ) : (
            "—"
          )}
        </Row>
      </div>

      {regulation.summary && (
        <div className="mt-3 rounded-lg bg-secondary/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Summary
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{regulation.summary}</p>
        </div>
      )}

      {regulation.requirements && (
        <div className="mt-2 rounded-lg bg-secondary/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Key requirements
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
            {regulation.requirements}
          </p>
        </div>
      )}
    </section>
  );
}