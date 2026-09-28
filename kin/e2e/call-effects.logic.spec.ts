import { test, expect } from "@playwright/test";
import { applyMatrix, filterMatrix, FILTERS, BACKGROUNDS } from "@/lib/call-effects";

/** Video-call filters are colour matrices applied to every frame on the phone. */

test("None is no matrix; every other filter has one", () => {
  expect(filterMatrix("none")).toBeNull();
  for (const f of FILTERS.filter((f) => f.id !== "none")) expect(filterMatrix(f.id)?.length).toBe(20);
});

test("B&W turns a colour into an equal grey", () => {
  const px = new Uint8ClampedArray([200, 40, 90, 255]);
  applyMatrix(px, filterMatrix("mono")!);
  expect(px[0]).toBe(px[1]);
  expect(px[1]).toBe(px[2]);
  expect(px[3]).toBe(255);
});

test("Warm pushes red up and blue down", () => {
  const px = new Uint8ClampedArray([120, 120, 120, 255]);
  applyMatrix(px, filterMatrix("warm")!);
  expect(px[0]).toBeGreaterThan(120);
  expect(px[2]).toBeLessThan(120);
});

test("the backgrounds offered include blur and your own photo", () => {
  expect(BACKGROUNDS.map((b) => b.id)).toEqual(expect.arrayContaining(["none", "blur", "photo"]));
});

test("face effects are placed from the eye corners: level eyes give no tilt", async () => {
  const { faceFrame } = await import("@/lib/call-effects");
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  lm[33] = { x: 0.3, y: 0.4 }; lm[133] = { x: 0.4, y: 0.4 }; lm[362] = { x: 0.6, y: 0.4 }; lm[263] = { x: 0.7, y: 0.4 };
  lm[10] = { x: 0.5, y: 0.2 }; lm[1] = { x: 0.5, y: 0.55 };
  const f = faceFrame(lm, 1000, 1000);
  expect(f.angle).toBeCloseTo(0);
  expect(f.span).toBeCloseTo(400);
  expect(f.leftEye).toEqual({ x: 350, y: 400 });
  expect(f.forehead).toEqual({ x: 500, y: 200 });
  lm[263] = { x: 0.7, y: 0.8 };
  expect(faceFrame(lm, 1000, 1000).angle).toBeGreaterThan(0.5);
});
