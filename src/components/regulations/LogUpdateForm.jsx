import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UPDATE_TYPES } from "@/lib/regulations";

export default function LogUpdateForm({ regulationId }) {
  const [type, setType] = useState("note");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!summary.trim()) return;
    setSaving(true);
    try {
      await base44.entities.Activity.create({
        regulation_id: regulationId,
        type,
        summary: summary.trim(),
        occurred_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["regulation-activity", regulationId] });
      setSummary("");
      toast.success("Update logged");
    } catch (error) {
      toast.error(error?.message || "Could not log this update.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <Textarea
        rows={2}
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
        placeholder="What changed? e.g. Submitted annual report, confirmation #44821."
      />
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UPDATE_TYPES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={saving || !summary.trim()}>
          {saving ? "Logging…" : "Log update"}
        </Button>
      </div>
    </form>
  );
}