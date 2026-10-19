import { addDays, weekdayOf } from "@/lib/time";
import type { WeekStart } from "@/lib/week";

/** The Planner's calendar, laid out in household days (19 October; see
 * docs/KNOWN_RISKS.md, "The Planner groups its calendar in the household's
 * zone").
 *
 * A household day is a plain "YYYY-MM-DD", the one familyDay() gives for an
 * instant in the household's zone. Everything that lays the calendar out --
 * the week rail, the month grid, the year's counts, which day an item is
 * filed under, which day is today -- works on those strings and nothing
 * else, so the process's own clock (TZ, getDate(), toDateString()) has no
 * say in it. Before this the module built and read Dates with local
 * getters, which was right only because instrumentation.ts puts the server
 * in Asia/Manila; a household in another zone, or a server in UTC, filed a
 * 7:00 Monday task under Sunday.
 *
 * Pure, and tested under a zone that is not Manila
 * (e2e/planner-days.logic.spec.ts). */

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Which column a day sits in, 0 being the week's first day. */
export function dayColumnOf(day: string, weekStart: WeekStart): number {
  return ((weekdayOf(day) ?? 0) - weekStart + 7) % 7;
}

/** The first day of the week a day falls in. */
export function weekStartDay(day: string, weekStart: WeekStart): string {
  return addDays(day, -dayColumnOf(day, weekStart)) ?? day;
}

/** `count` days from `first`, in order. */
export function daysFrom(first: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = addDays(first, i);
    if (d) out.push(d);
  }
  return out;
}

/** A day is gone once it is before today; today itself never is, however late. */
export function isPastDay(day: string, today: string): boolean {
  return day < today;
}

export type PlannerMonth = {
  /** "2026-10" */
  key: string;
  year: number;
  /** 1 to 12. */
  month: number;
  /** "2026-10-01" */
  first: string;
  daysInMonth: number;
};

function monthOf(year: number, month: number): PlannerMonth {
  // Normalised so month 13 is January next year and month 0 is December.
  const y = year + Math.floor((month - 1) / 12);
  const m = ((((month - 1) % 12) + 12) % 12) + 1;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { key: `${y}-${pad(m)}`, year: y, month: m, first: `${y}-${pad(m)}-01`, daysInMonth };
}

/** The months from `before` before the anchor's to `after` after it. */
export function monthsAround(anchorDay: string, before: number, after: number): PlannerMonth[] {
  const year = Number(anchorDay.slice(0, 4));
  const month = Number(anchorDay.slice(5, 7));
  return Array.from({ length: before + after + 1 }, (_, i) => monthOf(year, month - before + i));
}

/** The first day after the last of these months: the end of the range, exclusive. */
export function dayAfterMonths(months: PlannerMonth[]): string {
  const last = months[months.length - 1];
  return monthOf(last.year, last.month + 1).first;
}

/** A day of `month` -- the same date as the anchor where the month has it,
 * else its last day (the 31st in a 30-day month). */
export function sameDayIn(month: PlannerMonth, dayOfMonth: number): string {
  return `${month.key}-${pad(Math.min(Math.max(1, dayOfMonth), month.daysInMonth))}`;
}

/** Items filed under the household day each falls on. */
export function bucketByDay<T extends { day: string }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const bucket = out.get(it.day);
    if (bucket) bucket.push(it);
    else out.set(it.day, [it]);
  }
  return out;
}

/** How many items fall in each month of `year`, January first. */
export function countsByMonth(items: { day: string }[], year: number): number[] {
  const counts = new Array(12).fill(0);
  const prefix = `${year}-`;
  for (const it of items) if (it.day.startsWith(prefix)) counts[Number(it.day.slice(5, 7)) - 1]++;
  return counts;
}

/** "Monday 19 Oct" for a day heading. */
export function dayHeading(day: string): string {
  const w = weekdayOf(day);
  if (w === null) return day;
  return `${WEEKDAYS_LONG[w]} ${Number(day.slice(8))} ${monthShort(day)}`;
}

/** "Oct" ("Sept" for September, as Kin writes it elsewhere). */
export function monthShort(day: string): string {
  const m = Number(day.slice(5, 7));
  return m === 9 ? "Sept" : MONTHS_LONG[m - 1]?.slice(0, 3) ?? "";
}

/** "October 2026" */
export function monthLong(day: string): string {
  return `${MONTHS_LONG[Number(day.slice(5, 7)) - 1] ?? ""} ${day.slice(0, 4)}`;
}

/** "M" for Monday, the rail's one-letter weekday. */
export function weekdayInitial(day: string): string {
  const w = weekdayOf(day);
  return w === null ? "" : WEEKDAYS_LONG[w][0];
}

/** The Planner's header for a week: "October 2026", or "Sept – Oct 2026"
 * when the week runs across two months. */
export function weekLabel(firstDay: string): string {
  const last = addDays(firstDay, 6) ?? firstDay;
  if (firstDay.slice(0, 7) === last.slice(0, 7)) return monthLong(firstDay);
  return `${monthShort(firstDay)} – ${monthShort(last)} ${last.slice(0, 4)}`;
}
