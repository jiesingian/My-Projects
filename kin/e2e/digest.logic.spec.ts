import { test, expect } from "@playwright/test";
import { nextWeekFor } from "@/lib/digest";
import type { PlannerCalendarItem } from "@/lib/queries/planner";

const item = (id: string, over: Partial<PlannerCalendarItem>): PlannerCalendarItem => ({
  id, table: "activities", date: new Date("2026-10-05T09:00:00"), allDay: false, title: id, location: null, who: "", memberIds: [], appliesToAll: false, href: "/planner", ...over,
});
const roles: Record<string, string> = { mum: "parent", dad: "adult", lia: "child_self" };
const roleOf = (id: string) => roles[id];

const week = [
  item("family dinner", { appliesToAll: true }),
  item("dad's dentist", { memberIds: ["dad"] }),
  item("lia's recital", { memberIds: ["lia"] }),
  item("electricity due", { table: "bills", appliesToAll: true }),
  item("make bed", { table: "routines", chore: true, appliesToAll: true }),
];

test("a grown-up sees the family's, their own and the children's plans", () => {
  expect(nextWeekFor(week, { id: "mum", role: "parent" }, roleOf, false).map((i) => i.id)).toEqual(["family dinner", "lia's recital", "electricity due"]);
});

test("another grown-up's own plans stay theirs", () => {
  expect(nextWeekFor(week, { id: "mum", role: "parent" }, roleOf, false).map((i) => i.id)).not.toContain("dad's dentist");
});

test("a child in kid view sees no bills, and chores are never news", () => {
  expect(nextWeekFor(week, { id: "lia", role: "child_self" }, roleOf, true).map((i) => i.id)).toEqual(["family dinner", "lia's recital"]);
});
