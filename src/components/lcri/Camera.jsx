import { useEffect, useRef, useState } from "react";
import { Camera as CameraIcon, ImagePlus, X } from "lucide-react";
import { notify } from "@/components/lcri/notify";
import { continuousFocus, tapFocus, tapToPicturePoint } from "@/lib/camera-focus";
import { exifDate, stampLayout, stampLines } from "@/lib/photo-stamp";

const MAX_EDGE = 1600; // px; keeps photos readable and uploads small on a weak signal
const QUALITY = 0.82;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

// Burn the timestamp band into the bottom of the photo.
function drawStamp(ctx, w, h, lines) {
  const { font, pad, lineH, band } = stampLayout(w, h, lines.length);
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, h - band, w, band);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 700 : 500} ${font}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(line, pad, h - band + pad + i * lineH + Math.round((lineH - font) / 2), w - pad * 2);
  });
}

// Downscale any image (camera frame or picked file) to a JPEG Blob, stamped
// with `stampText` lines when given.
async function toJpeg(source, width, height, stampText) {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (stampText?.length) drawStamp(ctx, canvas.width, canvas.height, stampText);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process the photo"))), "image/jpeg", QUALITY));
}

// A picked photo is stamped with when it was taken (EXIF), or else its file date.
async function fileToJpeg(file, stamp) {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("That photo is over 25 MB.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // unknown format: keep the original
  try {
    let text = null;
    if (stamp) {
      const taken = /jpe?g/i.test(file.type) ? exifDate(await file.slice(0, 256 * 1024).arrayBuffer()) : null;
      text = stampLines({ ...stamp, takenAt: taken || new Date(file.lastModified || Date.now()), source: taken ? "exif" : "file" });
    }
    return await toJpeg(bitmap, bitmap.width, bitmap.height, text);
  } finally {
    bitmap.close?.();
  }
}

// Full-screen live camera. Falls back to the phone's own camera app when the
// browser can't open the camera here (no permission, no getUserMedia).
function CameraSheet({ onShot, onClose, onFallback, stamp }) {
  const video = useRef(null);
  const track = useRef(null);
  const caps = useRef(null);
  const [ready, setReady] = useState(false);
  const [ring, setRing] = useState(null); // { left, top, key } where the tech tapped
  const refocusTimer = useRef(null);
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
        // Autofocus: keep refocusing as the phone moves, where the camera allows it.
        track.current = stream.getVideoTracks()[0] || null;
        caps.current = track.current?.getCapabilities?.() || null;
        const cont = continuousFocus(caps.current);
        if (cont) await track.current.applyConstraints(cont).catch(() => {});
        setReady(true);
      } catch {
        if (!cancelled) fallbackRef.current();
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(refocusTimer.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Tap to focus on a spot; then return to continuous autofocus.
  const focusAt = async (e) => {
    const v = video.current;
    if (!ready || !v) return;
    const box = v.getBoundingClientRect();
    const tapX = e.clientX - box.left;
    const tapY = e.clientY - box.top;
    const point = tapToPicturePoint(tapX, tapY, box, v.videoWidth, v.videoHeight);
    if (!point) return;
    setRing({ left: tapX, top: tapY, key: Date.now() });
    const plan = tapFocus(caps.current, point.x, point.y);
    if (plan) await track.current?.applyConstraints(plan).catch(() => {});
    clearTimeout(refocusTimer.current);
    refocusTimer.current = setTimeout(() => {
      setRing(null);
      const cont = continuousFocus(caps.current);
      if (cont) track.current?.applyConstraints(cont).catch(() => {});
    }, 2500);
  };

  const shoot = async () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    try {
      onShot(await toJpeg(v, v.videoWidth, v.videoHeight, stamp ? stampLines({ ...stamp, takenAt: new Date(), source: "camera" }) : null));
      setTaken((n) => n + 1);
    } catch {
      notify("Couldn't take the photo. Try again.", "error");
    }
  };

  return (
    <div className="camera" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="camera-stage" onPointerUp={focusAt}>
        <video ref={video} playsInline muted className="camera-view" />
        {ring && <span key={ring.key} className="focus-ring" style={{ left: ring.left, top: ring.top }} aria-hidden="true" />}
        {ready && <p className="camera-hint">Tap to focus</p>}
      </div>
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
// `stamp` ({ address, systemName, by }) burns a timestamp into every photo.
export function PhotoPicker({ photos, onChange, max = 5, idPrefix, stamp }) {
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
        out.push(await fileToJpeg(f, stamp));
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
          stamp={stamp}
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

