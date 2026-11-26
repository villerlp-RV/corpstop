import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INDUSTRIES, JURISDICTIONS, RISKS, STATUSES } from "@/lib/regulations";
import { cn } from "@/lib/utils";

const EMPTY = {
  title: "",
  agency: "",
  reference_code: "",
  jurisdiction: "federal",
  status: "monitor",
  risk: "medium",
  owner: "",
  effective_date: "",
  deadline: "",
  source_url: "",
  summary: "",
  requirements: "",
  industries: [],
};

export default function RegulationFormDialog({ open, onOpenChange, regulation }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setForm(
      regulation
        ? {
            ...EMPTY,
            ...regulation,
            effective_date: regulation.effective_date || "",
            deadline: regulation.deadline || "",
            summary: regulation.summary || "",
            requirements: regulation.requirements || "",
            industries: regulation.industries || [],
          }
        : EMPTY
    );
  }, [open, regulation]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast.error("Give the regulation a name.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        agency: form.agency.trim(),
        reference_code: form.reference_code.trim(),
        jurisdiction: form.jurisdiction,
        status: form.status,
        risk: form.risk,
        owner: form.owner.trim(),
        effective_date: form.effective_date || null,
        deadline: form.deadline || null,
        source_url: form.source_url.trim(),
        summary: form.summary,
        requirements: form.requirements,
        industries: form.industries,
      };
      if (regulation) {
        await base44.entities.Regulation.update(regulation.id, payload);
      } else {
        await base44.entities.Regulation.create(payload);
      }
      queryClient.invalidateQueries({ queryKey: ["regulations"] });
      if (regulation) queryClient.invalidateQueries({ queryKey: ["regulation", regulation.id] });
      toast.success(regulation ? "Regulation updated" : "Regulation added");
      onOpenChange(false);
    } catch (error) {
      toast.error(error?.message || "Could not save this regulation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {regulation ? "Edit regulation" : "Track a regulation"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reg-title">Regulation</Label>
            <Input
              id="reg-title"
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="e.g. GHG Reporting Program — Subpart W revisions"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-agency">Agency</Label>
              <Input
                id="reg-agency"
                value={form.agency}
                onChange={(event) => set("agency", event.target.value)}
                placeholder="EPA"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-ref">Reference / citation</Label>
              <Input
                id="reg-ref"
                value={form.reference_code}
                onChange={(event) => set("reference_code", event.target.value)}
                placeholder="40 CFR Part 98"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Jurisdiction</Label>
              <Select
                value={form.jurisdiction}
                onValueChange={(value) => set("jurisdiction", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JURISDICTIONS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => set("status", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Risk level</Label>
              <Select value={form.risk} onValueChange={(value) => set("risk", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RISKS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-owner">Owner</Label>
              <Input
                id="reg-owner"
                value={form.owner}
                onChange={(event) => set("owner", event.target.value)}
                placeholder="Who is accountable"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-effective">Effective date</Label>
              <Input
                id="reg-effective"
                type="date"
                value={form.effective_date}
                onChange={(event) => set("effective_date", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-deadline">Compliance deadline</Label>
              <Input
                id="reg-deadline"
                type="date"
                value={form.deadline}
                onChange={(event) => set("deadline", event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Applies to industries</Label>
              <div className="flex flex-wrap gap-1.5">
                {INDUSTRIES.map((item) => {
                  const active = form.industries.includes(item.id);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() =>
                        set(
                          "industries",
                          active
                            ? form.industries.filter((id) => id !== item.id)
                            : [...form.industries, item.id]
                        )
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-source">Source link</Label>
            <Input
              id="reg-source"
              value={form.source_url}
              onChange={(event) => set("source_url", event.target.value)}
              placeholder="https://www.ecfr.gov/…"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-summary">Summary</Label>
            <Textarea
              id="reg-summary"
              rows={2}
              value={form.summary}
              onChange={(event) => set("summary", event.target.value)}
              placeholder="What this regulation requires, in plain language."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reg-requirements">Key requirements</Label>
            <Textarea
              id="reg-requirements"
              rows={3}
              value={form.requirements}
              onChange={(event) => set("requirements", event.target.value)}
              placeholder="Obligations, reporting duties, record-keeping, thresholds…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : regulation ? "Save changes" : "Add regulation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}