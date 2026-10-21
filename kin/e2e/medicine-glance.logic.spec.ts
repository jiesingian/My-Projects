import { test, expect } from "@playwright/test";
import { medicineGlance } from "@/lib/medicine-glance";
import { dosesFor, type Medicine } from "@/lib/health-plan";

/** Today's medicine tile (Janine, 21 October): what it says, from the same
 * dose rules Health uses. */

const meds: Medicine[] = [
  { id: "a", member_id: "me", name: "Losartan", dose: "50mg", times: ["08:00", "20:00"], start_date: "2026-10-01", end_date: null },
  { id: "b", member_id: "me", name: "Vitamin D", dose: null, times: ["12:00"], start_date: "2026-10-01", end_date: null },
];
const today = "2026-10-21";

test("the next dose to take, and how many are taken", () => {
  const due = dosesFor(meds, [{ medicine_id: "a", dose_date: today, dose_time: "08:00" }], today, "10:30");
  expect(medicineGlance(due)).toEqual({ value: "Vitamin D 12:00 pm", label: "next · 1 of 3 taken", warn: false });
});

test("a dose over an hour past its time and not ticked is late, and shows first", () => {
  const due = dosesFor(meds, [], today, "09:30");
  expect(medicineGlance(due)).toEqual({ value: "1 dose late", label: "Losartan · 0 of 3 taken", warn: true });
});

test("all taken", () => {
  const all = ["08:00", "20:00"].map((t) => ({ medicine_id: "a", dose_date: today, dose_time: t })).concat({ medicine_id: "b", dose_date: today, dose_time: "12:00" });
  expect(medicineGlance(dosesFor(meds, all, today, "21:00"))).toEqual({ value: "All taken ✓", label: "3 doses today", warn: false });
});

test("no medicine today -- none set up, or one that has ended", () => {
  expect(medicineGlance([])).toEqual({ value: "No medicines", label: "none to take today", warn: false });
  const ended: Medicine[] = [{ ...meds[1], end_date: "2026-10-20" }];
  expect(medicineGlance(dosesFor(ended, [], today, "13:00")).value).toBe("No medicines");
});
