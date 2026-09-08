import { familyDay, familyMidnight } from "@/lib/time";

/** The shape of what goes to Google and what comes back, with no network and
 * no database anywhere near it.
 *
 * These two functions are where every calendar date bug has lived, and they
 * were both private to modules that cannot be imported outside a request --
 * `calendar-sync.ts` is a "use server" module and `google-calendar.ts` reaches
 * for the service key. So nothing could test the part most worth testing.
 * Pulling them out here costs one file and makes both directions checkable
 * without a Google account. */

export type CalendarEventInput = {
  title: string;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  location?: string | null;
  /** RRULE lines, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]. Google expands
   * a recurring event itself, so a routine is one event rather than one per
   * occurrence. */
  recurrence?: string[] | null;
  /** Minutes before the start to alert. This is what actually reaches a
   * phone: the member's own calendar app raises it, lock screen and all. */
  reminderMinutes?: number | null;
  description?: string | null;
};

export type GoogleCalendarEvent = {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export function toGoogleEventBody(input: CalendarEventInput) {
  const end = input.endAt ?? new Date(input.startAt.getTime() + 60 * 60 * 1000);
  const extras = {
    description: input.description ?? undefined,
    recurrence: input.recurrence?.length ? input.recurrence : undefined,
    // An explicit override replaces the calendar's defaults; leaving it off
    // lets the member's own default reminder apply.
    reminders:
      input.reminderMinutes == null
        ? undefined
        : { useDefault: false, overrides: [{ method: "popup", minutes: input.reminderMinutes }] },
  };
  if (input.allDay) {
    // The household's day, not UTC's. An all-day item is built as
    // `new Date(`${date}T00:00:00`)`, which in Manila is 16:00 the previous
    // day in UTC -- so slicing the ISO string put every birthday, trip, bill
    // and meal on the family's phones one day early.
    const startDate = familyDay(input.startAt);
    const endExclusive = familyDay(new Date((input.endAt ?? input.startAt).getTime() + 86_400_000));
    return { summary: input.title, location: input.location ?? undefined, start: { date: startDate }, end: { date: endExclusive }, ...extras };
  }
  return {
    summary: input.title,
    location: input.location ?? undefined,
    start: { dateTime: input.startAt.toISOString() },
    end: { dateTime: end.toISOString() },
    ...extras,
  };
}

/** An all-day item, built from the plain household dates it actually has.
 *
 * The point is that the caller never constructs the instant. Every all-day
 * sync used to write
 *
 *     startAt: new Date(`${date}T00:00:00`)
 *
 * which is midnight in whatever zone the *process* is in, and is then read
 * back through familyDay, which is pinned to FAMILY_TZ. Correct only while
 * those two agree -- which they do today because instrumentation.ts sets TZ,
 * and would stop doing the moment KIN_TZ moved the deployment east.
 *
 * Returns null when a date is not a plain YYYY-MM-DD. From a form or a `date`
 * column that cannot happen; from the assistant, whose arguments a model
 * writes, it certainly can. Not syncing is the right answer there: a birthday
 * missing from a phone is a thing someone notices and fixes, and a birthday
 * on the wrong day is not. */
export function allDayEvent(
  title: string,
  day: string,
  opts: {
    endDay?: string | null;
    location?: string | null;
    description?: string | null;
    reminderMinutes?: number | null;
  } = {},
): CalendarEventInput | null {
  const startAt = familyMidnight(day);
  if (!startAt) return null;

  let endAt: Date | null = null;
  if (opts.endDay) {
    endAt = familyMidnight(opts.endDay);
    // A trip whose end we cannot read is worse than one that does not sync:
    // it would silently become a one-day event.
    if (!endAt) return null;
  }

  return {
    title,
    startAt,
    endAt,
    allDay: true,
    location: opts.location ?? null,
    description: opts.description ?? null,
    reminderMinutes: opts.reminderMinutes ?? null,
  };
}

/** What a Google event means to us: an instant, an optional end, and -- the
 * field that matters -- the household date it belongs on.
 *
 * `day` exists because deriving it later is where this went wrong. An all-day
 * event arrives from Google as a plain "2026-09-09" with no zone in it at all.
 * The old code turned that into an instant with `new Date(`${date}T00:00:00`)`,
 * which reads the *process* clock, and then formatted it back through
 * familyDay, which is pinned to Asia/Manila. Two different answers to "where
 * does this household live", agreeing only because instrumentation.ts happens
 * to set TZ to the same zone.
 *
 * Measured, 8 September, on the same 9 September all-day event:
 *
 *   TZ=Asia/Manila      -> 2026-09-09   correct
 *   TZ=UTC              -> 2026-09-09   correct
 *   TZ=America/New_York -> 2026-09-09   correct
 *   TZ=Asia/Tokyo       -> 2026-09-08   a day early
 *   TZ=Pacific/Auckland -> 2026-09-08   a day early
 *
 * Anywhere east of Manila and every birthday, bill, trip and meal is back to
 * landing a day early -- and KIN_TZ is the documented way to move the
 * deployment, so that is a config change away rather than a rewrite away.
 *
 * The fix is not to parse it more carefully. It is not to parse it at all:
 * Google already said which day, so `day` carries that string straight
 * through. For a timed event there is a real instant and familyDay is the
 * right question to ask of it. */
export function eventStartEnd(
  event: GoogleCalendarEvent,
): { start: Date; end: Date | null; allDay: boolean; day: string } | null {
  if (event.start?.dateTime) {
    const start = new Date(event.start.dateTime);
    if (Number.isNaN(start.getTime())) return null;
    return {
      start,
      end: event.end?.dateTime ? new Date(event.end.dateTime) : null,
      allDay: false,
      day: familyDay(start),
    };
  }
  if (event.start?.date) {
    const day = event.start.date;
    // Still produce an instant, because activities and appointments store one.
    // Midnight in the household's zone, stated rather than inherited.
    const start = familyMidnight(day);
    if (!start) return null;
    return { start, end: null, allDay: true, day };
  }
  return null;
}
