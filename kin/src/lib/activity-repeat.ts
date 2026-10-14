import { addDays, familyClock, familyDay, familyInstant, familyMidnight, weekdayOf, FAMILY_TZ } from "@/lib/time";

/** How a Planner task (the `activities` table) repeats, in one place.
 *
 * A task has a first day (start_at, read in the household's zone) and a
 * rule: once, weekly, monthly or yearly. Since 14 October a weekly one may
 * also name its days (repeat_days, 0 = Sunday) and any repeating one an end
 * day (repeat_until, inclusive). A row saved before then has neither, and
 * means what it always did: weekly on its first day's weekday, monthly on its
 * date, yearly on its month and day, never ending.
 *
 * Everything that expands a task -- the Planner calendar, the spoken brief,
 * the calendar link, Google Calendar -- asks this module, so they cannot
 * disagree. Pure, and tested alone (e2e/activity-repeat.logic.spec.ts). */

export const ACTIVITY_REPEATS = ["once", "weekly", "monthly", "yearly"] as const;
export type ActivityRepeat = (typeof ACTIVITY_REPEATS)[number];

export type ActivityRule = {
  repeat: string | null;
  repeat_days?: number[] | null;
  repeat_until?: string | null;
};

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const repeats = (rule: ActivityRule) => !!rule.repeat && rule.repeat !== "once" && (ACTIVITY_REPEATS as readonly string[]).includes(rule.repeat);

/** The weekdays a weekly task falls on: the ones chosen, or -- for a row
 * saved before there was a choice -- its first day's own. */
export function weeklyDays(rule: ActivityRule, first: string): number[] {
  const chosen = [...new Set((rule.repeat_days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (chosen.length) return chosen;
  const own = weekdayOf(first);
  return own === null ? [] : [own];
}

/** Does the task fall on this household day? */
export function occursOn(rule: ActivityRule, first: string, day: string): boolean {
  if (day < first) return false;
  if (!repeats(rule)) return day === first;
  if (rule.repeat_until && day > rule.repeat_until) return false;
  if (rule.repeat === "weekly") {
    const wd = weekdayOf(day);
    return wd !== null && weeklyDays(rule, first).includes(wd);
  }
  // Monthly on the same date: a month without it (the 31st in September)
  // has no occurrence, as it always had. Yearly on the same month and day.
  if (rule.repeat === "monthly") return day.slice(8) === first.slice(8);
  return day.slice(5) === first.slice(5);
}

/** The household days from `from` to `to`, both inclusive, the task falls on. */
export function occurrenceDays(rule: ActivityRule, first: string, from: string, to: string): string[] {
  let day: string | null = from > first ? from : first;
  const last = repeats(rule) && rule.repeat_until && rule.repeat_until < to ? rule.repeat_until : to;
  const out: string[] = [];
  while (day && day <= last) {
    if (occursOn(rule, first, day)) out.push(day);
    if (!repeats(rule)) break;
    day = addDays(day, 1);
  }
  return out;
}

/** Each occurrence from `from` to `to` (household days, inclusive) as an
 * instant: the first one's wall-clock time, on that day, in the household's
 * zone -- so 7:00 stays 7:00 across a daylight-saving change. */
export function occurrenceStarts(rule: ActivityRule, startAt: Date, from: string, to: string, tz: string = FAMILY_TZ): Date[] {
  const first = familyDay(startAt, tz);
  const clock = familyClock(startAt, tz);
  return occurrenceDays(rule, first, from, to)
    .map((d) => (d === first ? startAt : familyInstant(d, clock, tz)))
    .filter((d): d is Date => d !== null);
}

function utcStamp(at: Date): string {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The rule as an RRULE line, or null for a task that happens once.
 *
 * `utcStart`: the feed (lib/ics) writes DTSTART in UTC, and a client expands
 * BYDAY on the days of *that* clock. A 7:00 Monday in Manila is 23:00 Sunday
 * in UTC, so the chosen days are moved by the same day the start moved.
 * Google is given the household's zone with the start (lib/calendar-shape),
 * and takes the days as they are.
 *
 * UNTIL is the last second of the end day in the household's zone, in UTC,
 * as the RFC asks when the start carries a zone. */
export function activityRRule(rule: ActivityRule, startAt: Date, tz: string = FAMILY_TZ, opts: { utcStart?: boolean } = {}): string | null {
  if (!repeats(rule)) return null;
  const parts = [`FREQ=${rule.repeat!.toUpperCase()}`];
  if (rule.repeat === "weekly" && rule.repeat_days?.length) {
    const first = familyDay(startAt, tz);
    let shift = 0;
    if (opts.utcStart) {
      const local = weekdayOf(first) ?? 0;
      shift = (((startAt.getUTCDay() - local) % 7) + 7) % 7;
      if (shift > 3) shift -= 7;
    }
    const days = [...new Set(weeklyDays(rule, first).map((d) => (((d + shift) % 7) + 7) % 7))].sort((a, b) => a - b);
    parts.push(`BYDAY=${days.map((d) => RRULE_DAYS[d]).join(",")}`);
  }
  if (rule.repeat_until) {
    const next = addDays(rule.repeat_until, 1);
    const end = next ? familyMidnight(next, tz) : null;
    if (end) parts.push(`UNTIL=${utcStamp(new Date(end.getTime() - 1000))}`);
  }
  return `RRULE:${parts.join(";")}`;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}

/** "30 Nov", with the year only when it is not the first day's. */
function shortDay(day: string, sameYearAs: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]}${day.slice(0, 4) === sameYearAs.slice(0, 4) ? "" : ` ${y}`}`;
}

/** The rule in words, for the task's row and its form: "Every Mon, Wed, Fri
 * · until 30 Nov". Null for a task that happens once. */
export function describeActivityRepeat(rule: ActivityRule, first: string): string | null {
  if (!repeats(rule)) return null;
  let when: string;
  if (rule.repeat === "weekly") {
    const days = weeklyDays(rule, first);
    when = days.length === 7 ? "Every day" : `Every ${days.map((d) => SHORT_DAYS[d]).join(", ")}`;
  } else if (rule.repeat === "monthly") {
    when = `Every month on the ${ordinal(Number(first.slice(8)))}`;
  } else {
    when = `Every year on ${shortDay(first, first)}`;
  }
  return rule.repeat_until ? `${when} · until ${shortDay(rule.repeat_until, first)}` : when;
}

export type RepeatFields = { repeat: ActivityRepeat; repeat_days: number[] | null; repeat_until: string | null; date: string };

/** What the form sent, made into the stored rule -- or a sentence saying
 * what is wrong with it.
 *
 * A weekly task whose start day is not one of its chosen days starts on the
 * first chosen day after it, so start_at is always a real occurrence: the
 * reminder, the week-ahead push and the calendar event's first instance all
 * read start_at and need no rule of their own. */
export function readRepeatFields(input: { repeat: string; days: string[]; until: string; date: string }): RepeatFields | { error: string } {
  const repeat: ActivityRepeat = (ACTIVITY_REPEATS as readonly string[]).includes(input.repeat) ? (input.repeat as ActivityRepeat) : "once";
  if (repeat === "once") return { repeat, repeat_days: null, repeat_until: null, date: input.date };

  let date = input.date;
  let repeat_days: number[] | null = null;
  if (repeat === "weekly") {
    repeat_days = [...new Set(input.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (repeat_days.length === 0) return { error: "Pick at least one day of the week." };
    for (let i = 0; i < 7; i++) {
      const d = addDays(input.date, i);
      if (d && repeat_days.includes(weekdayOf(d)!)) {
        date = d;
        break;
      }
    }
  }

  const until = input.until.trim();
  if (!until) return { repeat, repeat_days, repeat_until: null, date };
  if (addDays(until, 0) !== until) return { error: "That end date isn't a real date." };
  if (until < date) return { error: date === input.date ? "The end date is before the start." : "The end date comes before the first day it repeats." };
  return { repeat, repeat_days, repeat_until: until, date };
}
