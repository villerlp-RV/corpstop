// Timestamps burned into field photos: when it was taken, where, and by whom.
// Pure helpers (text, layout, EXIF date) so they can be tested in Node; the
// canvas drawing lives in components/lcri/Camera.jsx.

// "Nov 27, 2026, 2:14 PM CST"
export function formatStampTime(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

// source: "camera" (taken now), "exif" (time the photo says it was taken),
// "file" (only the file's date is known).
// "29.76043° N, 95.36980° W ±8 m". Five decimals is about a metre.
export function formatCoords(gps) {
  if (!gps || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return "";
  const lat = `${Math.abs(gps.lat).toFixed(5)}° ${gps.lat < 0 ? "S" : "N"}`;
  const lng = `${Math.abs(gps.lng).toFixed(5)}° ${gps.lng < 0 ? "W" : "E"}`;
  const acc = Number.isFinite(gps.accuracy) && gps.accuracy > 0 ? ` ±${Math.max(1, Math.round(gps.accuracy))} m` : "";
  return `${lat}, ${lng}${acc}`;
}

export function stampLines({ takenAt, source = "camera", address, systemName, by, timeZone, gps }) {
  const when = formatStampTime(takenAt, timeZone);
  const lines = [source === "file" ? `${when} (file date)` : when];
  const place = [address, systemName].filter(Boolean).join(" · ");
  if (place) lines.push(place);
  const coords = formatCoords(gps);
  if (coords) lines.push(coords);
  lines.push(by ? `LineTally · ${by}` : "LineTally");
  return lines.map((l) => (l.length > 90 ? `${l.slice(0, 89)}…` : l));
}

// Text size and band height for an image, so the stamp reads the same on any photo.
export function stampLayout(width, height, lineCount) {
  const font = Math.max(14, Math.round(Math.min(width, height) / 30));
  const pad = Math.round(font * 0.6);
  const lineH = Math.round(font * 1.3);
  return { font, pad, lineH, band: pad * 2 + lineH * lineCount };
}

// DateTimeOriginal (or DateTime) from a JPEG's EXIF, read as local time.
export const exifDate = (buffer) => exifInfo(buffer).date;

// { date, gps } from a JPEG's EXIF; each is null when missing.
export function exifInfo(buffer) {
  const none = { date: null, gps: null };
  try {
    const v = new DataView(buffer);
    if (v.getUint16(0) !== 0xffd8) return none;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const size = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return none;
      off += 2 + size;
    }
  } catch {
    // malformed EXIF: nothing usable
  }
  return none;
}

function readTiff(v, tiff) {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o) => v.getUint16(o, le);
  const u32 = (o) => v.getUint32(o, le);
  const entries = (ifd) => {
    const n = u16(tiff + ifd);
    return Array.from({ length: n }, (_, i) => tiff + ifd + 2 + i * 12);
  };
  const ascii = (e) => {
    const count = u32(e + 4);
    const at = count > 4 ? tiff + u32(e + 8) : e + 8;
    let s = "";
    for (let i = 0; i < count - 1; i++) s += String.fromCharCode(v.getUint8(at + i));
    return s;
  };
  const rationals = (e) => {
    const at = tiff + u32(e + 8);
    return Array.from({ length: u32(e + 4) }, (_, i) => u32(at + i * 8) / (u32(at + i * 8 + 4) || 1));
  };
  const ifd0 = entries(u32(tiff + 4));
  let original = null;
  let fallback = null;
  let gps = null;
  for (const e of ifd0) {
    const tag = u16(e);
    if (tag === 0x8769) {
      for (const x of entries(u32(e + 8))) if (u16(x) === 0x9003) original = parseExifTime(ascii(x));
    }
    if (tag === 0x0132) fallback = parseExifTime(ascii(e));
    if (tag === 0x8825) {
      const g = {};
      for (const x of entries(u32(e + 8))) {
        const t = u16(x);
        if (t === 1 || t === 3) g[t] = String.fromCharCode(v.getUint8(x + 8));
        if (t === 2 || t === 4) g[t] = rationals(x);
      }
      gps = gpsFrom(g[1], g[2], g[3], g[4]);
    }
  }
  return { date: original || fallback, gps };
}

const dms = (parts) => (parts?.length === 3 ? parts[0] + parts[1] / 60 + parts[2] / 3600 : NaN);

function gpsFrom(latRef, lat, lngRef, lng) {
  const la = dms(lat) * (latRef === "S" ? -1 : 1);
  const lo = dms(lng) * (lngRef === "W" ? -1 : 1);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lng: lo };
}

export function parseExifTime(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || "");
  if (!m || m[1] === "0000") return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) ? null : d;
}
