import { test, expect } from "@playwright/test";
import { joinUrl, qrModules, qrPath } from "@/lib/qr";

test("the join link is the one the Share button sends", () => {
  expect(joinUrl("https://kin.example", "AB-12 cd")).toBe("https://kin.example/join/AB12cd");
});

test("a join link makes a square code with its three finder patterns", () => {
  const m = qrModules(joinUrl("https://kin-family.vercel.app", "ABC123"));
  const n = m.length;
  expect(n).toBeGreaterThanOrEqual(21);
  expect(m.every((row) => row.length === n)).toBe(true);
  // Each finder pattern's corner is dark, its inner ring light.
  for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    expect(m[r][c]).toBe(true);
    expect(m[r + 1][c + 1]).toBe(false);
    expect(m[r + 3][c + 3]).toBe(true);
  }
});

test("the same link always makes the same code", () => {
  const url = joinUrl("https://kin-family.vercel.app", "ABC123");
  expect(qrPath(qrModules(url))).toBe(qrPath(qrModules(url)));
  expect(qrPath([[true, false]], 4)).toBe("M4 4h1v1h-1z");
});
