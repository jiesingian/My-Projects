import { test, expect } from "@playwright/test";
import { readableDay } from "@/lib/time";

/** Routines was thrown away and rebuilt on every load because the server's
 * Node printed "Sun 27 Sept" and the browser's Chrome "Sun, 27 Sept" for the
 * same toLocaleDateString call. readableDay spells dates out by hand, so the
 * answer cannot depend on whose ICU data is asked. */
test("a plain date reads the same everywhere", () => {
  expect(readableDay("2026-09-27")).toBe("Sun 27 Sept");
  expect(readableDay("2026-06-01")).toBe("Mon 1 Jun");
  expect(readableDay("2026-09-27", { long: true })).toBe("Sunday 27 September");
  expect(readableDay("2026-01-05", { long: true, year: true })).toBe("Monday 5 January 2026");
});

test("no comma, whatever the runtime's locale data would have added", () => {
  for (const day of ["2026-02-28", "2026-12-31", "2027-03-01"]) {
    expect(readableDay(day)).not.toContain(",");
    expect(readableDay(day, { long: true, year: true })).not.toContain(",");
  }
});

test("something that is not a date comes back as it was", () => {
  expect(readableDay("not-a-day")).toBe("not-a-day");
});
