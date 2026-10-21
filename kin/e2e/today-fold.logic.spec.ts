import { test, expect } from "@playwright/test";
import { todayCounts, todaySummary, todayCookieName } from "@/lib/today-fold";
import type { TodayEntry } from "@/components/today-list";

/** Today's list, collapsible (Janine, 21 October): what the heading says,
 * folded or open. */

const item = (id: string, extra: Record<string, unknown> = {}) => ({ kind: "item", item: { id, title: id, ...extra } }) as unknown as TodayEntry;
const chore = (id: string, status: "done" | "skipped" | null) => ({ kind: "task", task: { id, title: id, today: { status } } }) as unknown as TodayEntry;

test("done counts what was answered for today: done or skipped", () => {
  const c = todayCounts([item("a", { mark: "done" }), item("b"), chore("c", "skipped"), chore("d", null)]);
  expect(c).toEqual({ done: 2, total: 4, urgent: 0 });
  expect(todaySummary(c)).toBe("2 of 4 done");
});

test("an urgent one still open is said, so folding never hides it", () => {
  const c = todayCounts([item("bill", { urgent: true }), item("paid", { urgent: true, mark: "done" }), item("plan")]);
  expect(c.urgent).toBe(1);
  expect(todaySummary(c)).toBe("1 of 3 done · 1 urgent");
});

test("each person keeps their own choice on a shared device", () => {
  expect(todayCookieName("a")).not.toBe(todayCookieName("b"));
});
