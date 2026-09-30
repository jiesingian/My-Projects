import { test, expect } from "@playwright/test";
import { holidayLine, mergeHolidays } from "@/lib/holidays";

const bonifacio = { date: "2026-11-30", name: "Bonifacio Day" };

test("a holiday later this week names its weekday", () => {
  expect(holidayLine([bonifacio], "2026-11-26")).toBe("Monday is a holiday — Bonifacio Day");
});

test("today and tomorrow say so", () => {
  expect(holidayLine([bonifacio], "2026-11-30")).toBe("Today is a holiday — Bonifacio Day");
  expect(holidayLine([bonifacio], "2026-11-29")).toBe("Tomorrow is a holiday — Bonifacio Day");
});

test("nothing this week, nothing to say", () => {
  expect(holidayLine([bonifacio], "2026-11-23")).toBeNull();
  expect(holidayLine([bonifacio], "2026-12-01")).toBeNull();
});

test("two holidays on one day read as one line", () => {
  const both = [bonifacio, { date: "2026-11-30", name: "Special Non-working Day" }];
  expect(holidayLine(both, "2026-11-30")).toBe("Today is a holiday — Bonifacio Day and Special Non-working Day");
});

test("Kin's own day is not shown twice when Nager catches up", () => {
  const merged = mergeHolidays([bonifacio], [{ date: "2026-11-30", name: "bonifacio day" }, { date: "2026-11-02", name: "All Souls' Day" }]);
  expect(merged).toEqual([{ date: "2026-11-02", name: "All Souls' Day" }, bonifacio]);
});
