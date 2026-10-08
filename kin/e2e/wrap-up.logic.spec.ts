import { test, expect } from "@playwright/test";
import { wrapUp, isWrapUpTime } from "@/lib/wrap-up";
import type { TodayEntry } from "@/components/today-list";

/** The evening wrap-up (lib/wrap-up.ts), read from Today's own list. */

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const item = (id: string, title: string, extra: object = {}): TodayEntry =>
  ({ kind: "item", item: { id, icon: "check", tint: "schedule", title, meta: "", href: "/", action: "done", ...extra } }) as TodayEntry;
const chore = (title: string, status: "done" | "skipped" | null): TodayEntry =>
  ({ kind: "task", task: { title, today: { status } } }) as unknown as TodayEntry;

test("it shows from 6pm in the household's zone, not before", () => {
  expect(isWrapUpTime("17:59")).toBe(false);
  expect(isWrapUpTime("18:00")).toBe(true);
  expect(isWrapUpTime("23:30")).toBe(true);
  expect(isWrapUpTime("")).toBe(false);
});

test("done, open and movable are read from the marks", () => {
  const w = wrapUp([
    item(`activity-${A}`, "Dentist", { mark: "done" }),
    item(`activity-${B}`, "Call plumber"),
    item("bill-33333333-3333-3333-3333-333333333333", "Electricity", { action: "pay" }),
    item("buy", "Shopping", { action: "shop", mark: "skipped" }),
    chore("Feed the dog", "done"),
    chore("Dishes", null),
    chore("Laundry", "skipped"),
  ]);
  expect(w.done).toEqual(["Dentist", "Feed the dog"]);
  expect(w.open.map((o) => o.title)).toEqual(["Call plumber", "Electricity", "Dishes"]);
  // Only the one-off plan moves: a bill keeps its due date, a chore comes back.
  expect(w.movable).toEqual([B]);
});

test("things with nothing to mark (a birthday, a meal) are neither done nor open", () => {
  const w = wrapUp([item("event-x", "Ben's birthday", { action: undefined })]);
  expect(w).toEqual({ done: [], open: [], movable: [] });
});
