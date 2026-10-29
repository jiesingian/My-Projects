import { test, expect } from "@playwright/test";
import { READY_DEFAULTS, cleanReadyLabel, readyProgress } from "@/lib/typhoon";

/** Typhoon mode's checklist (lib/typhoon, 20261029150000_typhoon_ready.sql). */

test("the starting list is short enough to finish and every label fits the database", () => {
  expect(READY_DEFAULTS.length).toBeGreaterThanOrEqual(8);
  expect(READY_DEFAULTS.length).toBeLessThanOrEqual(15);
  for (const l of READY_DEFAULTS) expect(cleanReadyLabel(l)).toBe(l);
  expect(new Set(READY_DEFAULTS).size).toBe(READY_DEFAULTS.length);
});

test("progress reads as a count, and says so when everything is ready", () => {
  const item = (id: string, done: boolean) => ({ id, label: id, done_at: done ? "2026-10-29T00:00:00Z" : null });
  expect(readyProgress([])).toMatchObject({ total: 0, all: false, line: "Start the checklist" });
  expect(readyProgress([item("a", true), item("b", false)])).toMatchObject({ done: 1, total: 2, all: false, line: "1 of 2 ready" });
  expect(readyProgress([item("a", true)]).all).toBe(true);
});

test("a label is trimmed to the database's shape, and an empty or too-long one is refused", () => {
  expect(cleanReadyLabel("  Gas  for the   generator ")).toBe("Gas for the generator");
  expect(cleanReadyLabel("   ")).toBeNull();
  expect(cleanReadyLabel("x".repeat(81))).toBeNull();
});
