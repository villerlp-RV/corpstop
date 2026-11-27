import { useState } from "react";
import { FileDown } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useCompanyProfile } from "@/lib/useCompanyProfile";
import { notify } from "@/components/lcri/notify";

// Builds a report with the company letterhead and downloads it as a PDF.
// `build(profile, { preparedBy })` returns the report object from src/lib/report.js.
export default function ReportButton({ build, label = "Generate report", disabled }) {
  const { user } = useAuth();
  const { profile, loading } = useCompanyProfile();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const report = build(profile, { preparedBy: user?.full_name || user?.email || "" });
      const { downloadReport } = await import("@/lib/report-pdf");
      await downloadReport(report);
      if (!profile?.business_name) notify("Report downloaded. Add your logo and address on the Company page to brand your reports.");
      else notify("Report downloaded");
    } catch {
      notify("Couldn't create the report. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="btn" onClick={run} disabled={disabled || busy || loading}>
      <FileDown size={15} /> {busy ? "Creating PDF…" : label}
    </button>
  );
}
