import { test, expect } from "@playwright/test";
import { dosesFor, type Medicine } from "@/lib/health-plan";
import { doseAt, doseMeta, doseRows, doseTitle } from "@/lib/today-doses";

/** Medicines on Today's list (23 October): one row per person and medicine,
 * carrying the next dose, from the same dose rules Health uses. */

const meds: Medicine[] = [
  { id: "a", member_id: "me", name: "Losartan", dose: "50mg", times: ["08:00", "20:00"], start_date: "2026-10-01", end_date: null },
  { id: "b", member_id: "kid", name: "Clindamycin", dose: null, times: ["07:00", "13:00", "19:00", "01:00"], start_date: "2026-10-20", end_date: "2026-10-27" },
  { id: "c", member_id: "kid", name: "Vitamin C", dose: "1 tab", times: ["09:00"], start_date: "2026-10-01", end_date: null },
];
const today = "2026-10-23";
const who = (id: string) => (id === "me" ? null : "Erynne");

test("one row per medicine, the reader's own unnamed, with the next dose and the count", () => {
  const rows = doseRows(dosesFor(meds, [{ medicine_id: "a", dose_date: today, dose_time: "08:00" }], today, "10:00"), who);
  // One row each; Today orders them itself (page.tsx).
  expect(rows.map((r) => r.id).sort()).toEqual(["dose-a", "dose-b", "dose-c"]);
  const mine = rows.find((r) => r.id === "dose-a")!;
  expect(doseTitle(mine)).toBe("Losartan");
  expect(doseMeta(mine)).toBe("8:00 pm · next · 1 of 2 taken · 50mg");
  expect(mine.late).toBe(false);
  expect(doseAt(mine)).toBe(20 * 60);
  const kid = rows.find((r) => r.id === "dose-b")!;
  expect(doseTitle(kid)).toBe("Erynne · Clindamycin");
  // 01:00 sorts first in Health's list; at 10:00 it and the 07:00 are late.
  expect(doseMeta(kid)).toBe("1:00 am · late · 0 of 4 taken");
  expect(kid.late).toBe(true);
});

test("a late next dose is late; once every dose is ticked the row says so and has no next", () => {
  const ticks = ["07:00", "13:00", "19:00", "01:00"].map((t) => ({ medicine_id: "b", dose_date: today, dose_time: t }));
  const rows = doseRows(dosesFor(meds, ticks, today, "21:30"), who);
  const kid = rows.find((r) => r.id === "dose-b")!;
  expect(kid.next).toBeNull();
  expect(kid.late).toBe(false);
  expect(doseMeta(kid)).toBe("4 of 4 taken");
  expect(doseAt(kid)).toBe(-1);
  // Undo unticks the last of the day's ticks, in time order.
  expect(kid.taken[kid.taken.length - 1]).toBe("19:00");
  const vitamin = rows.find((r) => r.id === "dose-c")!;
  expect(doseMeta(vitamin)).toBe("9:00 am · late · 0 of 1 taken · 1 tab");
});

test("a medicine not active today has no row", () => {
  const rows = doseRows(dosesFor(meds, [], "2026-10-28", "10:00"), who);
  expect(rows.map((r) => r.id).sort()).toEqual(["dose-a", "dose-c"]);
});
