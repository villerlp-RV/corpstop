import test from "node:test";
import assert from "node:assert/strict";
import { exifDate, exifInfo, formatCoords, formatStampTime, parseExifTime, stampLayout, stampLines } from "../src/lib/photo-stamp.js";

const AT = new Date("2026-11-27T20:14:00Z");

test("stamp text: time with zone, place, and who", () => {
  assert.equal(formatStampTime(AT, "America/Chicago"), "Nov 27, 2026, 2:14 PM CST");
  assert.deepEqual(stampLines({ takenAt: AT, address: "588 River Rd", systemName: "Cedar Hollow", by: "Jo Okafor", timeZone: "America/Chicago" }), [
    "Nov 27, 2026, 2:14 PM CST", "588 River Rd · Cedar Hollow", "LineTally · Jo Okafor",
  ]);
  assert.deepEqual(stampLines({ takenAt: AT, source: "file", timeZone: "UTC" }), ["Nov 27, 2026, 8:14 PM UTC (file date)", "LineTally"]);
  assert.ok(stampLines({ takenAt: AT, address: "x".repeat(200), timeZone: "UTC" })[1].length <= 90);
});

test("stamp scales with the photo", () => {
  assert.deepEqual(stampLayout(1600, 1200, 3), { font: 40, pad: 24, lineH: 52, band: 204 });
  assert.equal(stampLayout(200, 150, 2).font, 14);
});

// Minimal JPEG: SOI, APP1 Exif with IFD0 -> ExifIFD -> DateTimeOriginal.
function jpegWithExif(date, le = true) {
  const tiff = [];
  const w16 = (n) => (le ? tiff.push(n & 255, n >> 8) : tiff.push(n >> 8, n & 255));
  const w32 = (n) => (le ? tiff.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24) : tiff.push(n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255));
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]));
  w16(42); w32(8);
  w16(1); w16(0x8769); w16(4); w32(1); w32(26); w32(0); // IFD0: pointer to Exif IFD at 26
  w16(1); w16(0x9003); w16(2); w32(20); w32(44); w32(0); // Exif IFD: DateTimeOriginal at 44
  for (const c of `${date}\0`) tiff.push(c.charCodeAt(0));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}

test("reads when a photo was taken from its EXIF", () => {
  assert.deepEqual(exifDate(jpegWithExif("2026:11:20 09:05:30")), new Date(2026, 10, 20, 9, 5, 30));
  assert.deepEqual(exifDate(jpegWithExif("2025:01:02 03:04:05", false)), new Date(2025, 0, 2, 3, 4, 5));
  assert.equal(exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), null);
  assert.equal(exifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer), null);
  assert.equal(parseExifTime("0000:00:00 00:00:00"), null);
});

test("coordinates are printed with hemisphere and accuracy", () => {
  assert.equal(formatCoords({ lat: 29.760427, lng: -95.369803, accuracy: 7.6 }), "29.76043° N, 95.36980° W ±8 m");
  assert.equal(formatCoords({ lat: -33.8688, lng: 151.2093 }), "33.86880° S, 151.20930° E");
  assert.equal(formatCoords(null), "");
  const lines = stampLines({ takenAt: AT, address: "1 A St", by: "Jo", timeZone: "UTC", gps: { lat: 29.760427, lng: -95.369803, accuracy: 0.4 } });
  assert.deepEqual(lines, ["Nov 27, 2026, 8:14 PM UTC", "1 A St", "29.76043° N, 95.36980° W ±1 m", "LineTally · Jo"]);
});

// JPEG whose IFD0 points at a GPS IFD: 29° 45' 37.5372" N, 95° 22' 11.2908" W.
function jpegWithGps() {
  const tiff = [];
  const w16 = (n) => tiff.push(n & 255, n >> 8);
  const w32 = (n) => tiff.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24);
  tiff.push(0x49, 0x49); w16(42); w32(8);
  w16(1); w16(0x8825); w16(4); w32(1); w32(26); w32(0); // IFD0 -> GPS IFD at 26
  w16(4); // GPS IFD with 4 entries, rationals after it at 26 + 2 + 48 + 4 = 80
  w16(1); w16(2); w32(2); tiff.push(78, 0, 0, 0); // LatitudeRef "N"
  w16(2); w16(5); w32(3); w32(80);
  w16(3); w16(2); w32(2); tiff.push(87, 0, 0, 0); // LongitudeRef "W"
  w16(4); w16(5); w32(3); w32(104);
  w32(0);
  for (const [n, d] of [[29, 1], [45, 1], [375372, 10000], [95, 1], [22, 1], [112908, 10000]]) { w32(n); w32(d); }
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xd9]).buffer;
}

test("reads GPS from a photo's EXIF", () => {
  const { gps, date } = exifInfo(jpegWithGps());
  assert.equal(date, null);
  assert.equal(formatCoords(gps), "29.76043° N, 95.36980° W");
  assert.deepEqual(exifInfo(jpegWithExif("2026:11:20 09:05:30")).gps, null);
});
