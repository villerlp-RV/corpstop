import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RegulationFormDialog from "@/components/regulations/RegulationFormDialog";
import RegulationTable from "@/components/regulations/RegulationTable";
import { useRegulations } from "@/hooks/useRegulations";
import { JURISDICTIONS, STATUSES } from "@/lib/regulations";

export const Route = createFileRoute("/_authed/regulations/")({
  head: () => ({ meta: [{ title: "Regulations — Lead Pipe" }] }),
  component: RegulationsPage,
});

function RegulationsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [jurisdiction, setJurisdiction] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const navigate = useNavigate();

  const { data: regulations = [], isLoading } = useRegulations({ search, status, jurisdiction });

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Register
          </p>
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight">Regulations</h1>
        </div>
        <Button className="gap-2 self-start sm:self-auto" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Track a regulation
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by regulation, agency or citation"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={jurisdiction} onValueChange={setJurisdiction}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Jurisdiction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All jurisdictions</SelectItem>
            {JURISDICTIONS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {isLoading
          ? "Loading regulations…"
          : `${regulations.length} ${regulations.length === 1 ? "regulation" : "regulations"}`}
      </p>

      <div className="mt-2">
        {!isLoading && regulations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <p className="font-heading text-sm font-semibold">Nothing matches yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust the filters, or track a new regulation.
            </p>
            <Button variant="outline" className="mt-4 gap-2" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Track a regulation
            </Button>
          </div>
        ) : (
          <RegulationTable
            regulations={regulations}
            onOpen={(regulation) =>
              navigate({
                to: "/regulations/$regulationId",
                params: { regulationId: regulation.id },
              })
            }
          />
        )}
      </div>

      <RegulationFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}