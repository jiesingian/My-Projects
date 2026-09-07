/** Where the household lives, for the purpose of deciding what "today" means.
 *
 * This is a placeholder for a real families.timezone column, and it matters
 * more than it looks: the server runs in UTC, so a plain new Date() puts
 * Manila's entire evening — 4pm to midnight — on the previous day. A briefing
 * that shows yesterday from dinner onwards is worse than no briefing.
 *
 * Sold outside one country this has to come from the household's own record.
 * Until that column exists, every family is treated as being where the first
 * one is. */
export const FAMILY_TZ = "Asia/Manila";

/** The household's own calendar day, as YYYY-MM-DD. en-CA is the shortest way
 * to ask Intl for an ISO date; the point is the timeZone, not the locale. */
export function familyDay(at: Date = new Date(), tz: string = FAMILY_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** The wall clock in the household's own zone: "5:30 PM". */
export function familyTime(at: Date, tz: string = FAMILY_TZ): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(at);
}

/** The 24-hour wall clock in the household's zone: "17:30".
 *
 * Pinned to a zone rather than left to the viewer's browser because these are
 * rendered on the server and then hydrated in the browser. Left unpinned, a
 * phone in Manila and a server anywhere else format the same instant
 * differently, React notices the text moved between the two renders, and
 * throws the tree away to re-render it on the client. */
export function familyClock(at: Date, tz: string = FAMILY_TZ): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(at);
}

/** "Monday 7 September", in the household's zone. */
export function familyDateLong(at: Date, tz: string = FAMILY_TZ): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(at);
}

/** Date and time together, for the quiet "last synced" lines. */
export function familyDateTime(at: Date, tz: string = FAMILY_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}
