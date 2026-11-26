import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUSES, statusLabel } from "@/lib/regulations";

export default function RegulationStatusCard({ status, onChange, pending }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-sm font-semibold">Status</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        Every change is logged to the activity history.
      </p>

      <Select value={status} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className="mt-3">
          <SelectValue>{statusLabel(status)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {STATUSES.filter((item) => item.id !== status).map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            disabled={pending}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground disabled:opacity-50"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${item.tone}`} />
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}