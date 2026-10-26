import type { TodayEntry } from "@/components/today-list";

/** Today's list, collapsible (Janine, 21 October): what its heading says
 * when folded or open, and the cookie that keeps each person's choice on
 * this device (read on the server, so the page arrives already folded). */

export function todayCookieName(memberId: string): string {
  return `kin_today_open_${memberId}`;
}

export const TODAY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Answered for today: done, or skipped on purpose; a medicine once every
 * dose of the day is taken. */
export function answered(e: TodayEntry): boolean {
  return e.kind === "task" ? !!e.task.today?.status : e.kind === "dose" ? e.dose.next === null : !!e.item.mark;
}

/** "3 of 8 done", and how many urgent ones are still open -- said even when
 * the list is folded, so nothing urgent hides behind it. */
export function todayCounts(entries: TodayEntry[]): { done: number; total: number; urgent: number } {
  return {
    done: entries.filter(answered).length,
    total: entries.length,
    urgent: entries.filter((e) => ((e.kind === "item" && e.item.urgent) || (e.kind === "dose" && e.dose.late)) && !answered(e)).length,
  };
}

export function todaySummary(c: { done: number; total: number; urgent: number }): string {
  return `${c.done} of ${c.total} done${c.urgent > 0 ? ` · ${c.urgent} urgent` : ""}`;
}

/** How many open rows show before "Show N more" (Jonathan, 26 October). */
export const TODAY_SHOWN = 5;

/** The list in three parts: the open rows to show (the first `limit`, in
 * the server's order), how many more open ones wait behind "Show N more",
 * and the answered ones, folded into one "N done today" line. */
export function splitToday(entries: TodayEntry[], limit = TODAY_SHOWN): { open: TodayEntry[]; more: number; done: TodayEntry[] } {
  const pending = entries.filter((e) => !answered(e));
  return { open: pending.slice(0, limit), more: Math.max(0, pending.length - limit), done: entries.filter(answered) };
}
