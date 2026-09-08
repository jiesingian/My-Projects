/** Which day a week starts on, which is a household's choice and not a fact.
 *
 * Half the world starts on Monday and half on Sunday, and the app already
 * asks -- Settings offers "Mon start" and "Sun start", families.week_start
 * stores the answer, and the default is monday. Nothing read it. Every
 * calendar in the app laid its columns out with getDay(), which counts from
 * Sunday, so the setting saved cleanly and changed nothing.
 *
 * These are the four questions the calendars actually ask, with the choice
 * passed in rather than assumed. */

export type WeekStart = 0 | 1;

/** The stored preference as an index. Anything unrecognised is Sunday, which
 * is what getDay() counts from and so what the app did before. */
export function weekStartOf(pref?: string | null): WeekStart {
  return pref === "monday" ? 1 : 0;
}

/** Which column a date sits in, 0 being the week's first day. */
export function dayColumn(date: Date, weekStart: WeekStart): number {
  return (date.getDay() - weekStart + 7) % 7;
}

/** The first day of the week a date falls in. */
export function startOfWeek(date: Date, weekStart: WeekStart): Date {
  const d = new Date(date);
  d.setDate(date.getDate() - dayColumn(date, weekStart));
  return d;
}

/** The single-letter column headings, in the order the columns run. */
export function weekdayInitials(weekStart: WeekStart): string[] {
  const sundayFirst = ["S", "M", "T", "W", "T", "F", "S"];
  return [...sundayFirst.slice(weekStart), ...sundayFirst.slice(0, weekStart)];
}
