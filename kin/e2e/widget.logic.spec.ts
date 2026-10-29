import { test, expect } from "@playwright/test";
import { widgetSnapshot, WIDGET_MAX, TO_BUY_URL, type WidgetPlan } from "@/lib/widget";
import type { TodayDose } from "@/lib/today-doses";

/** The iPhone widgets' data (lib/widget.ts): the rest of today's doses and
 * plans, in order, and the To-Buy count -- nothing that harms when a little
 * stale. */

const tz = "Asia/Manila";
// 10:00 in Manila on 29 October.
const now = new Date("2026-10-29T02:00:00Z");
const day = "2026-10-29";
const dose = (over: Partial<TodayDose>): TodayDose => ({
  id: "dose-m1",
  medicineId: "m1",
  memberId: "me",
  who: null,
  name: "Losartan",
  dose: "50mg",
  times: ["08:00", "20:00"],
  taken: [],
  next: "08:00",
  late: false,
  href: "/family/members/me?view=health&seg=medicines",
  ...over,
});
const plan = (over: Partial<WidgetPlan>): WidgetPlan => ({ id: "activity-a1", title: "Sunday lunch", meta: "12:00 pm · Lola's", at: Date.parse("2026-10-29T04:00:00Z"), href: "/planner", ...over });

test("every dose still to take today, in time order, a taken one left out", () => {
  const s = widgetSnapshot({
    now,
    tz,
    day,
    doses: [dose({ taken: ["08:00"] }), dose({ id: "dose-m2", medicineId: "m2", who: "Erynne", name: "Clindamycin", dose: null, times: ["06:00", "14:00"] })],
    plans: [],
    toBuy: 0,
  });
  expect(s.doses.map((d) => [d.title, d.at])).toEqual([
    // Not taken at 06:00: still here, and the widget shows it as late.
    ["Erynne · Clindamycin", "2026-10-28T22:00:00.000Z"],
    ["Erynne · Clindamycin", "2026-10-29T06:00:00.000Z"],
    ["Losartan", "2026-10-29T12:00:00.000Z"],
  ]);
  expect(s.doses[2].detail).toBe("50mg");
  expect(s.doses[0].url).toBe("/family/members/me?view=health&seg=medicines");
});

test("plans: only those at a time, still ahead, and not ticked or skipped", () => {
  const s = widgetSnapshot({
    now,
    tz,
    day,
    doses: [],
    plans: [
      plan({}),
      plan({ id: "activity-a2", title: "Swimming", at: Date.parse("2026-10-29T01:00:00Z") }),
      plan({ id: "activity-a3", title: "All day fair", at: undefined }),
      plan({ id: "activity-a4", title: "Dentist run", mark: "done", at: Date.parse("2026-10-29T08:00:00Z") }),
      plan({ id: "activity-a5", title: "Mass", at: Date.parse("2026-10-29T03:00:00Z"), href: "https://evil.example" }),
    ],
    toBuy: 3,
  });
  expect(s.plans.map((p) => p.title)).toEqual(["Mass", "Sunday lunch"]);
  // Only ever a Kin page.
  expect(s.plans[0].url).toBe("/planner");
});

test("the To-Buy count and where it opens, and the day it is for", () => {
  const s = widgetSnapshot({ now, tz, day, doses: [], plans: [], toBuy: 4.7 });
  expect(s.toBuy).toBe(4);
  expect(s.toBuyUrl).toBe(TO_BUY_URL);
  expect(s.day).toBe(day);
  expect(s.updatedAt).toBe(now.toISOString());
  expect(widgetSnapshot({ now, tz, day, doses: [], plans: [], toBuy: -2 }).toBuy).toBe(0);
});

test("never more than a day's worth of each", () => {
  const times = Array.from({ length: 30 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
  const s = widgetSnapshot({ now, tz, day, doses: [dose({ times })], plans: [], toBuy: 0 });
  expect(s.doses).toHaveLength(WIDGET_MAX);
});
