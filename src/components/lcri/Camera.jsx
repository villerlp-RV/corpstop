import { useEffect, useRef, useState } from "react";
import { Camera as CameraIcon, ImagePlus, X } from "lucide-react";
import { notify } from "@/components/lcri/notify";

const MAX_EDGE = 1600; // px; keeps photos readable and uploads small on a weak signal
const QUALITY = 0.82;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

// Downscale any image (camera frame or picked file) to a JPEG Blob.
async function toJpeg(source, width, height) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process the photo"))), "image/jpeg", QUALITY));
}

async function fileToJpeg(file) {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("That photo is over 25 MB.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // unknown format: keep the original
  try {
    return await toJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close?.();
  }
}

// Full-screen live camera. Falls back to the phone's own camera app when the
// browser can't open the camera here (no permission, no getUserMedia).
function CameraSheet({ onShot, onClose, onFallback }) {
  const video = useRef(null);
  const [ready, setReady] = useState(false);
  const [taken, setTaken] = useState(0);
  // Keep the latest callback without restarting the camera on every render.
  const fallbackRef = useRef(onFallback);
  fallbackRef.current = onFallback;

  useEffect(() => {
    let stream;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera api");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
        if (cancelled) return;
        video.current.srcObject = stream;
        await video.current.play();
        setReady(true);
      } catch {
        if (!cancelled) fallbackRef.current();
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const shoot = async () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    try {
      onShot(await toJpeg(v, v.videoWidth, v.videoHeight));
      setTaken((n) => n + 1);
    } catch {
      notify("Couldn't take the photo. Try again.", "error");
    }
  };

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label="Camera">
      <video ref={video} playsInline muted className="camera-view" />
      {!ready && <p className="camera-wait">Opening camera…</p>}
      <div className="camera-bar">
        <button type="button" className="camera-btn" onClick={onClose} aria-label="Close camera"><X size={26} /></button>
        <button type="button" className="shutter" onClick={shoot} disabled={!ready} aria-label="Take photo" />
        <button type="button" className="camera-btn camera-done" onClick={onClose}>{taken ? `Done (${taken})` : "Done"}</button>
      </div>
    </div>
  );
}

// Photo picker for one entry: take photos with the camera or choose from the
// library; shows thumbnails that can be removed. `photos` is an array of Blobs.
export function PhotoPicker({ photos, onChange, max = 5, idPrefix }) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const fallbackInput = useRef(null);
  const libraryInput = useRef(null);
  const [urls, setUrls] = useState([]);

  useEffect(() => {
    const next = photos.map((p) => URL.createObjectURL(p));
    setUrls(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const room = max - photos.length;
  const add = (blobs) => {
    const accepted = blobs.slice(0, Math.max(0, max - photos.length));
    if (blobs.length > accepted.length) notify(`Up to ${max} photos per entry.`, "error");
    if (accepted.length) onChange([...photos, ...accepted]);
  };

  const addFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    const out = [];
    for (const f of files) {
      try {
        out.push(await fileToJpeg(f));
      } catch (err) {
        notify(err.message || "Couldn't use that photo.", "error");
      }
    }
    add(out);
  };

  return (
    <div className="photos">
      {photos.length > 0 && (
        <ul className="thumbs" aria-label="Photos for this entry">
          {urls.map((u, i) => (
            <li key={u}>
              <img src={u} alt={`Photo ${i + 1}`} />
              <button type="button" className="thumb-x" onClick={() => onChange(photos.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="photo-row">
        <button type="button" className="btn btn--big" disabled={room <= 0} onClick={() => setCameraOpen(true)}>
          <CameraIcon size={18} /> {photos.length ? "Take another" : "Take photo"}
        </button>
        <button type="button" className="btn btn--big btn--ghost" disabled={room <= 0} onClick={() => libraryInput.current?.click()}>
          <ImagePlus size={18} /> From library
        </button>
        <span className="muted photo-count">{photos.length}/{max}</span>
      </div>
      <input ref={fallbackInput} id={`${idPrefix}-capture`} type="file" accept="image/*" capture="environment" onChange={addFiles} hidden />
      <input ref={libraryInput} id={`${idPrefix}-library`} type="file" accept="image/*" multiple onChange={addFiles} hidden />
      {cameraOpen && (
        <CameraSheet
          onShot={(b) => add([b])}
          onClose={() => setCameraOpen(false)}
          onFallback={() => {
            setCameraOpen(false);
            fallbackInput.current?.click();
          }}
        />
      )}
    </div>
  );
}

