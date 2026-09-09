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

/** The instant at which a household date begins.
 *
 * The counterpart to familyDay, and the one that was missing. Everywhere an
 * all-day thing -- a birthday, a bill, a trip, a meal, a document expiry --
 * needed to become a Date, the code wrote:
 *
 *     new Date(`${date}T00:00:00`)
 *
 * which is midnight in whatever zone the *process* happens to be in, while
 * every reading of it goes back through familyDay, which is pinned to
 * FAMILY_TZ. Two answers to "where does this household live", agreeing only
 * because instrumentation.ts sets TZ to the same zone. Measured on a
 * 9 September all-day event:
 *
 *   TZ=Asia/Manila      -> 2026-09-09   correct
 *   TZ=UTC              -> 2026-09-09   correct
 *   TZ=America/New_York -> 2026-09-09   correct
 *   TZ=Asia/Tokyo       -> 2026-09-08   a day early
 *   TZ=Pacific/Auckland -> 2026-09-08   a day early
 *
 * Anywhere east of the household and every all-day item is back to landing a
 * day early. KIN_TZ is the documented way to move the deployment, so that is
 * one environment variable away, and it would look exactly like the bug fixed
 * this morning coming back on its own.
 *
 * This states the zone instead of inheriting it. Returns null on anything
 * that is not a plain YYYY-MM-DD, including 31 September, which Date would
 * roll into October without complaint. */
export function familyMidnight(day: string, tz: string = FAMILY_TZ): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y), month = Number(mo), date = Number(d);
  const asUtc = Date.UTC(year, month - 1, date);
  const check = new Date(asUtc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null;

  // How far the household's zone sits from UTC at that moment, to the minute,
  // asked of the zone by name rather than assumed.
  const offsetMs =
    new Date(check.toLocaleString("en-US", { timeZone: tz })).getTime() -
    new Date(check.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(asUtc - offsetMs);
}

/** A household date and a wall-clock time, as one real instant.
 *
 * The timed counterpart to familyMidnight, and it exists because the assistant
 * was building these by hand:
 *
 *     new Date(`${date}T${from}`).toISOString()
 *
 * which fails in two different ways on arguments a language model writes from
 * what somebody typed. Measured 9 September:
 *
 *   "2026-09-15" + "25:00"     -> RangeError, thrown out of the tool
 *   "next Tuesday" + "19:00"   -> RangeError
 *   "2026-09-15" + "evening"   -> RangeError
 *   "2026-09-31" + "19:00"     -> 1 October, silently, no error at all
 *
 * The last is the worse one. Somebody asks for the 31st of a thirty-day month
 * -- which people do -- and the appointment is quietly made on a different
 * day than the one they said.
 *
 * So: both halves are validated before anything is constructed, the time must
 * be a real HH:MM (with optional seconds), and the zone is stated rather than
 * inherited from whatever TZ the process happens to run under. Returns null
 * for anything that is not exactly what it claims to be, which the callers
 * turn into "I could not read that date" rather than a crash. */
export function familyInstant(day: string, time: string, tz: string = FAMILY_TZ): Date | null {
  const midnight = familyMidnight(day, tz);
  if (!midnight) return null;

  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!m) return null;
  const hours = Number(m[1]), minutes = Number(m[2]), seconds = Number(m[3] ?? "0");
  if (hours > 23 || minutes > 59 || seconds > 59) return null;

  // Midnight in the household's zone is already the right instant to count
  // from, so the time of day is simple arithmetic on top of it. Doing it this
  // way means a zone whose offset is not a whole hour needs no special case.
  return new Date(midnight.getTime() + ((hours * 60 + minutes) * 60 + seconds) * 1000);
}

/** Day arithmetic on a plain date, with no clock involved at all.
 *
 * The zone-free counterpart to familyMidnight: where a real instant is not
 * wanted -- a query bound, the Monday a week starts on -- going through Date
 * only introduces the process clock as a way to be wrong. "2026-09-09" plus
 * one is "2026-09-10" in every zone there is.
 *
 * Returns null on anything that is not a plain YYYY-MM-DD, including
 * 31 September, which Date would roll into October without complaint. */
export function addDays(day: string, delta: number): string | null {
  const at = utcNoonlessDay(day);
  if (!at) return null;
  at.setUTCDate(at.getUTCDate() + delta);
  return at.toISOString().slice(0, 10);
}

/** Day of the week for a plain date, 0 = Sunday, read in UTC so the answer is
 * the same wherever the process is running. */
export function weekdayOf(day: string): number | null {
  return utcNoonlessDay(day)?.getUTCDay() ?? null;
}

/** Whole days from one plain date to another, positive when `to` is later.
 *
 * Both sides are plain dates, so this never touches a clock -- which is the
 * point. Computing "how many days ago" from `new Date()` asks the browser,
 * and the browser is not necessarily where the household is. */
export function daysBetween(from: string, to: string): number | null {
  const a = utcNoonlessDay(from);
  const b = utcNoonlessDay(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** A plain YYYY-MM-DD as the UTC instant that names it, or null.
 *
 * The validation is the point, and it has to be a round trip rather than a
 * regex: "2026-09-31" matches the pattern, and both `Date.UTC(2026, 8, 31)`
 * and `new Date("2026-09-31T00:00:00Z")` roll it forward to 1 October without
 * complaint -- so an impossible date would quietly answer for a different
 * day, which for the grocery week meant picking the wrong Monday. Caught by
 * the test rather than in the app, which is the only reason it is not shipped.
 */
function utcNoonlessDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y), month = Number(mo), date = Number(d);
  const at = new Date(Date.UTC(year, month - 1, date));
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== date) return null;
  return at;
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
