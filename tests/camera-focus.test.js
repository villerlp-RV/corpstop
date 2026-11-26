import test from "node:test";
import assert from "node:assert/strict";
import { continuousFocus, tapFocus, tapToPicturePoint } from "../src/lib/camera-focus.js";

const android = { focusMode: ["manual", "single-shot", "continuous"], pointsOfInterest: {} };

test("continuous focus only when the camera offers it", () => {
  assert.deepEqual(continuousFocus(android), { advanced: [{ focusMode: "continuous" }] });
  assert.equal(continuousFocus({}), null, "iPhone: no focus controls, camera handles it");
  assert.equal(continuousFocus(undefined), null);
});

test("tap focus prefers a single-shot focus on the tapped point", () => {
  assert.deepEqual(tapFocus(android, 0.25, 0.8), { advanced: [{ pointsOfInterest: [{ x: 0.25, y: 0.8 }], focusMode: "single-shot" }] });
  assert.deepEqual(tapFocus({ focusMode: ["continuous"], pointsOfInterest: {} }, 2, -1).advanced[0].pointsOfInterest, [{ x: 1, y: 0 }], "clamped");
  assert.deepEqual(tapFocus({ focusMode: ["single-shot"] }, 0.5, 0.5), { advanced: [{ focusMode: "single-shot" }] });
  assert.equal(tapFocus({}, 0.5, 0.5), null);
});

test("taps map onto a letterboxed picture", () => {
  // 1920x1080 video shown in a 400x800 portrait box: picture is 400x225, centred.
  const box = { width: 400, height: 800 };
  const p = tapToPicturePoint(200, 400, box, 1920, 1080);
  assert.ok(Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 0.5) < 1e-9);
  assert.equal(tapToPicturePoint(200, 100, box, 1920, 1080), null, "tap in the black bar above");
  const corner = tapToPicturePoint(0, 287.5, box, 1920, 1080);
  assert.ok(Math.abs(corner.x) < 1e-9 && Math.abs(corner.y) < 1e-9);
  assert.equal(tapToPicturePoint(10, 10, box, 0, 0), null);
});
