// Camera focus: what to ask the camera for, based on what it says it supports
// (MediaStreamTrack.getCapabilities()). Chrome on Android exposes focusMode and
// pointsOfInterest; iPhones don't, but focus continuously on their own.

const has = (caps, key, value) => Array.isArray(caps?.[key]) && caps[key].includes(value);

// Keep the picture sharp while the tech moves the phone.
export function continuousFocus(caps) {
  if (has(caps, "focusMode", "continuous")) return { advanced: [{ focusMode: "continuous" }] };
  return null;
}

// Focus on the spot the tech tapped. x and y are 0..1 across the picture.
export function tapFocus(caps, x, y) {
  const point = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  const canPoint = caps && "pointsOfInterest" in caps;
  if (canPoint && has(caps, "focusMode", "single-shot")) return { advanced: [{ pointsOfInterest: [point], focusMode: "single-shot" }] };
  if (canPoint && has(caps, "focusMode", "continuous")) return { advanced: [{ pointsOfInterest: [point], focusMode: "continuous" }] };
  if (has(caps, "focusMode", "single-shot")) return { advanced: [{ focusMode: "single-shot" }] };
  return null;
}

// Where a tap lands in the picture, allowing for object-fit: contain letterboxing.
// Returns null when the tap falls outside the picture.
export function tapToPicturePoint(tapX, tapY, box, videoW, videoH) {
  if (!videoW || !videoH || !box.width || !box.height) return null;
  const scale = Math.min(box.width / videoW, box.height / videoH);
  const w = videoW * scale;
  const h = videoH * scale;
  const left = (box.width - w) / 2;
  const top = (box.height - h) / 2;
  const x = (tapX - left) / w;
  const y = (tapY - top) / h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}
