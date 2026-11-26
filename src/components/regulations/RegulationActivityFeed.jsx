import { ArrowRight, ClipboardCheck, FileText, StickyNote } from "lucide-react";
import LogUpdateForm from "./LogUpdateForm";
import { useRegulationActivity } from "@/hooks/useRegulations";

const ICONS = {
  note: StickyNote,
  update: FileText,
  inspection: ClipboardCheck,
  filing: FileText,
  status_change: ArrowRight,
};

function formatWhen(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function RegulationActivityFeed({ regulationId }) {
  const { data: activities = [], isLoading } = useRegulationActivity(regulationId);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-sm font-semibold">Activity history</h2>
      <div className="mt-3">
        <LogUpdateForm regulationId={regulationId} />
      </div>

      <div className="mt-5 border-t border-border pt-4">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading history…</p>
        ) : activities.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing logged yet. Record the first step above.
          </p>
        ) : (
          <ul className="space-y-3.5">
            {activities.map((activity) => {
              const Icon = ICONS[activity.type] || StickyNote;
              return (
                <li key={activity.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs leading-relaxed text-foreground">{activity.summary}</p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {activity.type?.replace("_", " ")} · {formatWhen(activity.occurred_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}