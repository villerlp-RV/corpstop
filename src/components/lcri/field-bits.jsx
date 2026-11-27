import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { removeLinePhoto } from "@/lib/server-fns";
import { base44 } from "@/api/base44Client";
import { notify } from "@/components/lcri/notify";
import { Modal } from "@/components/lcri/bits";
import { PhotoPicker } from "@/components/lcri/Camera";
import { useAuth } from "@/lib/AuthContext";
import { useData } from "@/lib/DataContext";
import { MAX_PHOTOS_PER_ENTRY, addPhotosPatch, photosOf } from "@/lib/fieldwork";

// Photos are private files: each view gets short-lived signed links.
export function GalleryBody({ uris, lineId, canRemove, onRemoved }) {
  const remove = useServerFn(removeLinePhoto);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const doRemove = async (uri) => {
    setBusy(true);
    try {
      await remove({ data: { lineId, uri } });
      notify("Photo removed");
      setConfirm(null);
      onRemoved?.(uri);
    } catch (e) {
      notify(e?.message || "Couldn't remove the photo. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };
  const [links, setLinks] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.all(uris.map((u) => base44.integrations.Core.CreateFileSignedUrl({ file_uri: u, expires_in: 600 }).then((r) => r.signed_url).catch(() => null)))
      .then((l) => active && setLinks(l));
    return () => {
      active = false;
    };
  }, [uris]);
  if (!links) return <div className="spinner spinner--inline" aria-label="Loading photos" />;
  return (
    <div className="gallery">
      {links.map((src, i) => (
        <div key={uris[i]} className="gallery-item">
          {src ? (
            <a href={src} target="_blank" rel="noreferrer">
              <img src={src} alt={`Photo ${i + 1}`} loading="lazy" />
            </a>
          ) : (
            <div className="gallery-missing">Photo {i + 1} couldn&apos;t load</div>
          )}
          {canRemove && lineId && (
            confirm === uris[i] ? (
              <span className="gallery-remove">
                <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => doRemove(uris[i])}>{busy ? "Removing…" : "Remove"}</button>
                <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setConfirm(null)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="btn btn--sm btn--ghost gallery-remove" onClick={() => setConfirm(uris[i])} aria-label={`Remove photo ${i + 1}`}>
                <Trash2 size={13} /> Remove
              </button>
            )
          )}
        </div>
      ))}
    </div>
  );
}

export function PhotoGallery({ uris, title = "Photos", lineId, canRemove = false, onChanged }) {
  const [open, setOpen] = useState(false);
  const removed = (uri) => {
    if (uris.length <= 1) setOpen(false);
    onChanged?.(uri);
  };
  if (!uris?.length) return null;
  return (
    <>
      <button type="button" className="linkbtn photo-link" onClick={() => setOpen(true)}>
        <Camera size={13} /> {uris.length === 1 ? "1 photo" : `${uris.length} photos`}
      </button>
      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <div className="form"><GalleryBody uris={uris} lineId={lineId} canRemove={canRemove} onRemoved={removed} /></div>
      </Modal>
    </>
  );
}

// What gets stamped on a line's photos: its address and system, and who took it.
export function photoStamp(line, systems, user) {
  return {
    address: line?.address || "",
    systemName: (systems || []).find((s) => s.id === line?.system_id)?.name || "",
    by: user?.full_name || user?.email || "",
  };
}

// Add photos to any service line from the system page (desktop or phone).
export function AddLinePhotos({ line, onSaved }) {
  const { user } = useAuth();
  const { systems } = useData();
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const close = () => {
    setOpen(false);
    setPhotos([]);
  };
  const save = async () => {
    setSaving(true);
    try {
      const uris = [];
      for (const [i, blob] of photos.entries()) {
        const file = new File([blob], `line-${i + 1}.jpg`, { type: blob.type || "image/jpeg" });
        uris.push((await base44.integrations.Core.UploadPrivateFile({ file })).file_uri);
      }
      await base44.entities.ServiceLine.update(line.id, addPhotosPatch(line, uris));
      notify(`${uris.length} ${uris.length === 1 ? "photo" : "photos"} added to ${line.address}`);
      close();
      onSaved?.();
    } catch {
      notify("Couldn't upload the photos. Check your connection and try again.", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <button type="button" className="linkbtn photo-link" onClick={() => setOpen(true)} aria-label={`Add photos to ${line.address}`}>
        <ImagePlus size={13} /> Add
      </button>
      <Modal open={open} title={`Photos for ${line.address}`} onClose={close}>
        <div className="form">
          <PhotoPicker photos={photos} onChange={setPhotos} max={MAX_PHOTOS_PER_ENTRY} idPrefix={`line-${line.id}`} stamp={photoStamp(line, systems, user)} />
          <div className="form-actions">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="button" className="btn btn--primary" disabled={!photos.length || saving} onClick={save}>
              {saving ? "Uploading…" : `Save ${photos.length || ""} ${photos.length === 1 ? "photo" : "photos"}`.replace("  ", " ")}
            </button>
          </div>
        </div>
      </Modal>
    </>
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
    </span>
  );
}
