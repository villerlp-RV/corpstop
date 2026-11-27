import { useEffect, useRef, useState } from "react";
import { Download, FileText, Paperclip, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Modal } from "@/components/lcri/bits";
import { notify } from "@/components/lcri/notify";
import {
  ACCEPT, MAX_PER_ENTRY, addAttachmentsPatch, attachmentRecord, attachmentsOf, checkFile, formatBytes, removeAttachmentPatch, roomFor,
} from "@/lib/attachments";
import { formatDate } from "@/lib/lcri";

// Pick files for an entry (no upload yet): validates and lists them.
export function FilePicker({ files, onChange, max = MAX_PER_ENTRY, idPrefix }) {
  const input = useRef(null);
  const pick = (e) => {
    const chosen = [...(e.target.files || [])];
    e.target.value = "";
    const ok = [];
    for (const f of chosen) {
      const problem = checkFile(f);
      if (problem) notify(problem, "error");
      else ok.push(f);
    }
    const room = Math.max(0, max - files.length);
    if (ok.length > room) notify(`Up to ${max} files at a time.`, "error");
    if (ok.length && room) onChange([...files, ...ok.slice(0, room)]);
  };
  return (
    <div className="files">
      {files.length > 0 && (
        <ul className="file-list" aria-label="Files to attach">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <FileText size={16} aria-hidden="true" />
              <span className="file-name">{f.name}</span>
              <span className="muted">{formatBytes(f.size)}</span>
              <button type="button" className="icon-btn" onClick={() => onChange(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input ref={input} id={`${idPrefix}-files`} type="file" multiple accept={ACCEPT} onChange={pick} hidden />
      <button type="button" className="btn btn--ghost" disabled={files.length >= max} onClick={() => input.current?.click()}>
        <Paperclip size={16} /> Attach files
      </button>
      <small className="muted block">PDF, images, Word, Excel, CSV or text · up to 20 MB each</small>
    </div>
  );
}

// Upload files and attach them to a line. Returns the new attachment records.
export async function uploadAttachments(line, files, user) {
  const records = [];
  for (const f of files) {
    const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: f });
    records.push(attachmentRecord({ uri: file_uri, name: f.name, type: f.type, size: f.size }, user));
  }
  const fresh = await base44.entities.ServiceLine.get(line.id).catch(() => line);
  await base44.entities.ServiceLine.update(line.id, addAttachmentsPatch(fresh, records));
  return records;
}

// A line's attachments: a link that opens the list, with open/download for
// everyone, add for people who can edit the line, remove for Edit access.
export function LineAttachments({ line, canAdd = false, canRemove = false, onChanged }) {
  const { user } = useAuth();
  const items = attachmentsOf(line);
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState({});
  const [adding, setAdding] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    Promise.all(items.map((a) => base44.integrations.Core.CreateFileSignedUrl({ file_uri: a.uri, expires_in: 600 }).then((r) => [a.uri, r.signed_url]).catch(() => [a.uri, null])))
      .then((pairs) => active && setLinks(Object.fromEntries(pairs)));
    return () => {
      active = false;
    };
  }, [open, line.attachments]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length && !canAdd) return null;

  const upload = async () => {
    setBusy(true);
    try {
      await uploadAttachments(line, adding, user);
      notify(`${adding.length} ${adding.length === 1 ? "file" : "files"} attached to ${line.address}`);
      setAdding([]);
      onChanged?.();
    } catch {
      notify("Couldn't attach the files. Check your connection and try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a) => {
    setBusy(true);
    try {
      const fresh = await base44.entities.ServiceLine.get(line.id).catch(() => line);
      await base44.entities.ServiceLine.update(line.id, removeAttachmentPatch(fresh, a.uri));
      notify(`${a.name} removed`);
      setConfirm(null);
      onChanged?.();
    } catch {
      notify("Couldn't remove the file. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="linkbtn photo-link" onClick={() => setOpen(true)} aria-label={`Files for ${line.address}`}>
        <Paperclip size={13} /> {items.length ? `${items.length} ${items.length === 1 ? "file" : "files"}` : "Attach"}
      </button>
      <Modal open={open} title={`Files · ${line.address}`} onClose={() => !busy && setOpen(false)}>
        <div className="form">
          {items.length ? (
            <ul className="file-list file-list--saved">
              {items.map((a) => (
                <li key={a.uri}>
                  <FileText size={16} aria-hidden="true" />
                  <span className="file-name">
                    {links[a.uri] ? <a href={links[a.uri]} target="_blank" rel="noreferrer">{a.name}</a> : a.name}
                    <small className="muted block">
                      {[formatBytes(a.size), a.added_by, a.added_at ? formatDate(a.added_at.slice(0, 10)) : ""].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  {links[a.uri] && (
                    <a className="icon-btn" href={links[a.uri]} download={a.name} target="_blank" rel="noreferrer" aria-label={`Download ${a.name}`}>
                      <Download size={15} />
                    </a>
                  )}
                  {canRemove && (confirm === a.uri ? (
                    <span className="row-actions">
                      <button type="button" className="btn btn--sm btn--danger" disabled={busy} onClick={() => remove(a)}>Remove</button>
                      <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setConfirm(null)}>Keep</button>
                    </span>
                  ) : (
                    <button type="button" className="icon-btn" onClick={() => setConfirm(a.uri)} aria-label={`Remove ${a.name}`}><Trash2 size={15} /></button>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No files attached yet.</p>
          )}
          {canAdd && roomFor(line) > 0 && (
            <>
              <FilePicker files={adding} onChange={setAdding} max={Math.min(MAX_PER_ENTRY, roomFor(line))} idPrefix={`att-${line.id}`} />
              {adding.length > 0 && (
                <button type="button" className="btn btn--primary" disabled={busy} onClick={upload}>
                  {busy ? "Uploading…" : `Attach ${adding.length} ${adding.length === 1 ? "file" : "files"}`}
                </button>
              )}
            </>
          )}
          {canAdd && roomFor(line) === 0 && <p className="note">This line has the maximum of 20 files. Remove one to add another.</p>}
        </div>
      </Modal>
    </>
  );
}
