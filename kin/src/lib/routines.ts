import type { IconName } from "@/components/icons";

export const ROUTINE_KINDS = ["grocery", "fitness", "sport", "worship", "lesson", "chore", "health", "other"] as const;
export type RoutineKind = (typeof ROUTINE_KINDS)[number];

export const ROUTINE_KIND_META: Record<RoutineKind, { label: string; icon: IconName }> = {
  grocery: { label: "Grocery", icon: "basket" },
  fitness: { label: "Fitness", icon: "activity" },
  sport: { label: "Sport", icon: "activity" },
  worship: { label: "Worship", icon: "church" },
  lesson: { label: "Lesson", icon: "calendarDays" },
  chore: { label: "Chore", icon: "house" },
  health: { label: "Health", icon: "activity" },
  other: { label: "Routine", icon: "repeat" },
};

export type RoutineFreq = "daily" | "weekly" | "monthly";

/** Everything needed to work out when a routine falls. Deliberately the
 * subset of the row that describes the rule, so the expansion can be tested
 * without a database. */
export type RoutineRule = {
  freq: RoutineFreq;
  repeat_interval: number;
  byweekday: number[]; // 0 = Sunday … 6 = Saturday
  bymonthday: number | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null;
};

export type RoutineOccurrence = {
  date: Date;
  /** How many occurrences have come before this one, ever. Rotation uses it
   * to decide whose turn it is, so it has to be stable no matter which range
   * is being looked at. */
  index: number;
};

const DAY_MS = 86_400_000;

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Midnight local, so arithmetic is in whole days and immune to the clock. */
function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days between two local midnights. Rounded because a DST boundary
 * makes some "days" 23 or 25 hours long. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((atMidnight(to).getTime() - atMidnight(from).getTime()) / DAY_MS);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** The occurrences of a routine that fall in [rangeStart, rangeEnd), each
 * carrying its lifetime index. `rangeEnd` is exclusive. */
export function expandRoutine(rule: RoutineRule, rangeStart: Date, rangeEnd: Date): RoutineOccurrence[] {
  const start = parseISODate(rule.start_date);
  const end = rule.end_date ? parseISODate(rule.end_date) : null;
  const from = atMidnight(rangeStart);
  const until = atMidnight(rangeEnd);
  const interval = Math.max(1, rule.repeat_interval);

  if (until <= from) return [];
  const hardStop = end && end < until ? addDays(end, 1) : until;
  if (hardStop <= start && !(start >= from && start < until)) {
    // Nothing can fall in range if the rule ends before the range opens.
    if (end && addDays(end, 1) <= from) return [];
  }

  const out: RoutineOccurrence[] = [];
  const emit = (date: Date, index: number) => {
    if (date < start) return;
    if (end && date > end) return;
    if (date < from || date >= until) return;
    out.push({ date, index });
  };

  if (rule.freq === "daily") {
    // Skip straight to the first occurrence on or after the range opens.
    const behind = Math.max(0, daysBetween(start, from));
    let index = Math.ceil(behind / interval);
    let date = addDays(start, index * interval);
    while (date < until && (!end || date <= end)) {
      emit(date, index);
      index += 1;
      date = addDays(start, index * interval);
    }
    return out;
  }

  if (rule.freq === "weekly") {
    const days = [...new Set(rule.byweekday)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
    if (days.length === 0) return [];

    const week0 = startOfWeek(start);
    const startDow = start.getDay();
    // Days of the first week that fall before the routine began are not
    // occurrences, and must not be counted in anyone's turn.
    const skippedFirstWeek = days.filter((d) => d < startDow).length;

    const weeksBehind = Math.max(0, Math.floor(daysBetween(week0, from) / 7));
    // Begin at the repeating week at or before the range, so a week already
    // under way is not missed.
    let n = Math.floor(weeksBehind / interval);

    for (;;) {
      const weekStart = addDays(week0, n * interval * 7);
      if (weekStart >= until) break;
      if (end && weekStart > end) break;

      days.forEach((d, rank) => {
        const date = addDays(weekStart, d);
        const index = n * days.length + rank - skippedFirstWeek;
        if (index >= 0) emit(date, index);
      });
      n += 1;
    }
    return out;
  }

  // monthly
  const dom = rule.bymonthday;
  if (!dom) return [];

  // A day that does not exist in a short month lands on that month's last
  // day rather than being skipped: a 31st routine still happens in February.
  const dayIn = (year: number, month: number) => new Date(year, month, Math.min(dom, daysInMonth(year, month)));

  const firstCandidate = dayIn(start.getFullYear(), start.getMonth());
  const firstN = firstCandidate >= start ? 0 : 1;

  const monthsBehind = (from.getFullYear() - start.getFullYear()) * 12 + (from.getMonth() - start.getMonth());
  let n = Math.max(0, Math.floor(monthsBehind / interval) * interval);

  for (;;) {
    const date = dayIn(start.getFullYear(), start.getMonth() + n);
    if (date >= until) break;
    if (end && date > end) break;
    const index = n / interval - firstN;
    if (index >= 0) emit(date, index);
    n += interval;
  }
  return out;
}

/** The next occurrence on or after `from`, or null if the routine has run
 * its course. Looks ahead two years, which is further than any everyday
 * pattern needs to reach its next turn. */
export function nextOccurrence(rule: RoutineRule, from: Date = new Date()): Date | null {
  const start = atMidnight(from);
  const horizon = new Date(start.getFullYear() + 2, start.getMonth(), start.getDate());
  return expandRoutine(rule, start, horizon)[0]?.date ?? null;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function list(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} & ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

export function formatTimeOfDay(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
}

/** The rule in words — what a person reads on the routine's row. */
export function describeRule(rule: RoutineRule, timeOfDay: string | null = null): string {
  const every = rule.repeat_interval > 1;
  let when: string;

  if (rule.freq === "daily") {
    when = every ? `Every ${rule.repeat_interval} days` : "Every day";
  } else if (rule.freq === "weekly") {
    const days = [...new Set(rule.byweekday)].sort((a, b) => a - b).map((d) => WEEKDAY_NAMES[d]);
    const weekdays = days.length === 7 ? "every day" : list(days);
    when = every ? `Every ${rule.repeat_interval} weeks on ${weekdays}` : days.length === 7 ? "Every day" : weekdays;
  } else {
    const day = rule.bymonthday ? ordinal(rule.bymonthday) : "";
    when = every ? `Every ${rule.repeat_interval} months on the ${day}` : `Monthly on the ${day}`;
  }

  const at = formatTimeOfDay(timeOfDay);
  return at ? `${when} · ${at}` : when;
}

/** Whose turn it is for a given occurrence. Members are taken in their
 * stored order and cycled, so the rota is the same for everyone looking. */
export function assigneeFor<T>(members: T[], occurrenceIndex: number): T | null {
  if (members.length === 0) return null;
  return members[((occurrenceIndex % members.length) + members.length) % members.length];
}

/** Consecutive most-recent occurrences marked done, counting back from the
 * latest one that has already come round. A skip breaks it; an occurrence
 * nobody has answered for yet does not, until it is in the past. */
export function currentStreak(occurrences: Date[], statusByDate: Map<string, "done" | "skipped">, today: Date = new Date()): number {
  const past = occurrences.filter((d) => atMidnight(d) <= atMidnight(today)).sort((a, b) => b.getTime() - a.getTime());
  let streak = 0;
  for (const date of past) {
    const status = statusByDate.get(toISODate(date));
    if (status === "done") streak += 1;
    else break;
  }
  return streak;
}

const GOOGLE_WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** The rule as an RRULE line. Google expands the recurrence itself, so a
 * routine is one calendar event rather than one per occurrence — and the
 * reminder attached to it fires on each. */
export function toRRule(rule: RoutineRule): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.repeat_interval > 1) parts.push(`INTERVAL=${rule.repeat_interval}`);
  if (rule.freq === "weekly" && rule.byweekday.length) {
    parts.push(`BYDAY=${[...new Set(rule.byweekday)].sort((a, b) => a - b).map((d) => GOOGLE_WEEKDAYS[d]).join(",")}`);
  }
  if (rule.freq === "monthly" && rule.bymonthday) parts.push(`BYMONTHDAY=${rule.bymonthday}`);
  // UNTIL is inclusive of the instant given; end of the last day covers the
  // whole of it whatever time the routine falls at.
  if (rule.end_date) parts.push(`UNTIL=${rule.end_date.replace(/-/g, "")}T235959Z`);
  return `RRULE:${parts.join(";")}`;
}
