/** Public holidays for the household's own country (families.country,
 * Philippines when unset), without an account, a key or a bill.
 *
 * Nager.Date covers about a hundred countries with the same free call. The
 * hand-kept parts below -- the fixed-date fallback and Kin's special days --
 * are Philippine, so they only ever apply to Philippine households; a
 * household elsewhere that Nager cannot reach for a moment simply sees no
 * holiday line until it can.
 *
 * Nager.Date publishes them as a plain GET, the same kind of free, keyless
 * service as the weather (lib/weather). The list for a year changes a few
 * times at most, so it is cached for a day by the fetch layer and shared by
 * every household, rather than asked for on each Planner or Today render.
 *
 * Nager can lag behind a last-minute Palace proclamation -- a special
 * non-working day announced a week out. Those go in KIN_SPECIAL_DAYS below,
 * which Kin keeps by hand for everyone, and a household can add its own in
 * Settings → Household (household_special_days, queries/special-days).
 *
 * Like a birthday, a holiday is something to know about, not something to
 * tick off: nothing here has a Done or a Skip.
 */

export type Holiday = { date: string; name: string };

/** Days Nager does not have yet, added by Kin as they are proclaimed. A date
 * already on Nager's list under the same name is not shown twice. */
export const KIN_SPECIAL_DAYS: Holiday[] = [];

/** The holidays that fall on the same date every year, for when Nager cannot
 * be reached: a Planner that silently loses Christmas because a free service
 * was down would be worse than one missing a movable feast. Holy Week,
 * National Heroes Day and the Eid holidays move, so they only come from
 * Nager. */
const FIXED: [string, string][] = [
  ["01-01", "New Year's Day"],
  ["04-09", "Day of Valor"],
  ["05-01", "Labour Day"],
  ["06-12", "Independence Day"],
  ["08-21", "Ninoy Aquino Day"],
  ["11-01", "All Saints' Day"],
  ["11-30", "Bonifacio Day"],
  ["12-08", "Feast of the Immaculate Conception"],
  ["12-25", "Christmas Day"],
  ["12-30", "Rizal Day"],
  ["12-31", "New Year's Eve"],
];

function fixedFor(year: number): Holiday[] {
  return FIXED.map(([md, name]) => ({ date: `${year}-${md}`, name }));
}

/** Nager's list and Kin's own, one entry per date and name, in date order. */
export function mergeHolidays(...lists: Holiday[][]): Holiday[] {
  const seen = new Set<string>();
  const out: Holiday[] = [];
  for (const h of lists.flat()) {
    const key = `${h.date}|${h.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** A household's country as Nager wants it: the two-letter code, upper case.
 * Unset or anything odd is the Philippines, which every household was until
 * country could be set. */
export function holidayCountry(country: string | null | undefined): string {
  return country && /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : "PH";
}

async function fromNager(year: number, country: string): Promise<Holiday[] | null> {
  try {
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, { next: { revalidate: 86400 } });
    if (!response.ok) return null;
    const json = (await response.json()) as { date?: string; name?: string }[];
    if (!Array.isArray(json)) return null;
    return json.filter((h) => typeof h.date === "string" && typeof h.name === "string").map((h) => ({ date: h.date!, name: h.name! }));
  } catch {
    // Down or unreachable: the fixed dates stand in, and nobody sees an error.
    return null;
  }
}

export async function getPhHolidays(year: number): Promise<Holiday[]> {
  return getHolidays(year, "PH");
}

/** One year's public holidays for a country (holidayCountry's form). */
export async function getHolidays(year: number, country: string): Promise<Holiday[]> {
  const nager = await fromNager(year, country);
  if (country !== "PH") return nager ?? [];
  const own = KIN_SPECIAL_DAYS.filter((h) => h.date.startsWith(`${year}-`));
  return mergeHolidays(nager ?? fixedFor(year), own);
}

/** Every holiday from `startISO` up to, not including, `endISO`
 * (YYYY-MM-DD). */
export async function getHolidaysBetween(startISO: string, endISO: string, country: string = "PH"): Promise<Holiday[]> {
  const first = Number(startISO.slice(0, 4));
  const last = Number(endISO.slice(0, 4));
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const all = (await Promise.all(years.map((y) => getHolidays(y, country)))).flat();
  return all.filter((h) => h.date >= startISO && h.date < endISO);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's one line about a holiday: today's, else the next within the week.
 * "Monday is a holiday — Bonifacio Day". Two on one day read as one line. */
export function holidayLine(holidays: Holiday[], todayISO: string): string | null {
  const weekOut = addDays(todayISO, 7);
  const next = holidays.filter((h) => h.date >= todayISO && h.date < weekOut).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  const names = holidays.filter((h) => h.date === next.date).map((h) => h.name).join(" and ");
  const when =
    next.date === todayISO
      ? "Today"
      : next.date === addDays(todayISO, 1)
        ? "Tomorrow"
        : new Date(`${next.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `${when} is a holiday — ${names}`;
}
