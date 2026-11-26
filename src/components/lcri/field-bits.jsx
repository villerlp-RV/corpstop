import { useState } from "react";
import { Camera } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { notify } from "@/components/lcri/notify";

// Photos are private files; open one through a short-lived signed link.
export function PhotoLink({ uri, label = "Photo" }) {
  const [busy, setBusy] = useState(false);
  if (!uri) return null;
  const open = async () => {
    setBusy(true);
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: uri, expires_in: 600 });
      window.open(signed_url, "_blank", "noopener");
    } catch {
      notify("Couldn't open the photo. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className="linkbtn photo-link" onClick={open} disabled={busy}>
      <Camera size={13} /> {busy ? "Opening…" : label}
    </button>
  );
}

export function AssignmentCell({ line }) {
  if (!line.assignment_status) return <span className="muted">—</span>;
  const done = line.assignment_status === "done";
  return (
    <span className="assign-cell">
      <span className={`pill ${done ? "pill--ready" : "pill--risk"}`}>{done ? "Recorded" : "Open"}</span>
      <span>{line.assigned_to_name}</span>
      {line.field_notes && <small className="muted block">“{line.field_notes}”</small>}
      <PhotoLink uri={line.photo_uri} />
    </span>
  );
}
