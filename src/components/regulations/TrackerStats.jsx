import { daysUntil, isClosed, isOverdue } from "@/lib/regulations";
import { cn } from "@/lib/utils";

export default function TrackerStats({ regulations }) {
  const open = regulations.filter((regulation) => !isClosed(regulation.status));
  const actionRequired = regulations.filter(
    (regulation) => regulation.status === "action_required"
  ).length;
  const overdue = open.filter((regulation) => isOverdue(regulation.deadline)).length;
  const dueSoon = open.filter((regulation) => {
    const days = daysUntil(regulation.deadline);
    return days !== null && days >= 0 && days <= 30;
  }).length;
  const compliant = regulations.filter((regulation) => regulation.status === "compliant").length;

  const stats = [
    {
      label: "Action required",
      value: String(actionRequired),
      sub: actionRequired ? "Needs a decision" : "Nothing blocked",
      dark: true,
    },
    {
      label: "Due within 30 days",
      value: String(dueSoon),
      sub: "Compliance deadlines",
    },
    {
      label: "Overdue",
      value: String(overdue),
      sub: overdue ? "Past deadline" : "All on schedule",
      alert: overdue > 0,
    },
    {
      label: "Compliant",
      value: String(compliant),
      sub: `of ${regulations.length} tracked`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            "rounded-xl border p-4",
            stat.dark ? "border-foreground/10 bg-foreground text-background" : "border-border bg-card"
          )}
        >
          <p
            className={cn(
              "text-[10px] font-semibold uppercase tracking-[0.12em]",
              stat.dark ? "text-background/60" : "text-muted-foreground"
            )}
          >
            {stat.label}
          </p>
          <p
            className={cn(
              "mt-2 font-heading text-2xl font-bold tracking-tight",
              stat.alert && !stat.dark && "text-destructive"
            )}
          >
            {stat.value}
          </p>
          <p
            className={cn(
              "mt-0.5 truncate text-[11px]",
              stat.dark ? "text-background/50" : "text-muted-foreground"
            )}
          >
            {stat.sub}
          </p>
        </div>
      ))}
    </div>
  );
}