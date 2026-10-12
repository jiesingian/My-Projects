/** The three household preferences Settings offers, and what they may be.
 *
 * They live here rather than inline in the form because the form and the
 * server action both need them and the two must not drift: the reason the
 * server has to check at all is that a Server Action is a public endpoint
 * whatever the `<select>` above it offers, and a list that has quietly gained
 * an option on one side and not the other is the same hole with extra steps.
 * `profile-fields.ts` does the same thing for the same reason.
 *
 * What went wrong without this, measured on 9 September against the throwaway
 * household: the action validated `country` -- with a comment explaining that
 * a form field is a request rather than a fact -- and then wrote currency,
 * date format and week start straight through unchecked. None of the three
 * has a CHECK constraint behind it, so all three were accepted.
 *
 *   currency    a 2,000-character string was stored, and formatCurrency
 *               prefixes it to every amount: one money value went from 8
 *               characters to 2,008. It is stored on the household, so it
 *               hits everyone in it, on every screen with a number on it,
 *               until somebody changes it back.
 *   date_format anything unrecognised silently falls through to DD/MM/YYYY
 *   week_start  anything unrecognised silently falls through to Sunday
 *
 * The last two are the quieter failure and worth saying out loud: the save
 * reports success, and the household goes on being shown a preference it did
 * not choose.
 */

export const CURRENCIES = [
  { code: "PHP", label: "PHP ₱" },
  { code: "USD", label: "USD $" },
  { code: "EUR", label: "EUR €" },
  { code: "GBP", label: "GBP £" },
  { code: "CAD", label: "CAD C$" },
  { code: "AUD", label: "AUD A$" },
  { code: "NZD", label: "NZD NZ$" },
  { code: "SGD", label: "SGD S$" },
  { code: "HKD", label: "HKD HK$" },
  { code: "JPY", label: "JPY ¥" },
  { code: "AED", label: "AED" },
  { code: "SAR", label: "SAR" },
  { code: "QAR", label: "QAR" },
] as const;

export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY"] as const;

export const WEEK_STARTS = [
  { value: "monday", label: "Mon start" },
  { value: "sunday", label: "Sun start" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export type DateFormat = (typeof DATE_FORMATS)[number];
export type WeekStartPref = (typeof WEEK_STARTS)[number]["value"];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCIES.some((c) => c.code === value);
}

export function isDateFormat(value: string): value is DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(value);
}

export function isWeekStart(value: string): value is WeekStartPref {
  return WEEK_STARTS.some((w) => w.value === value);
}

/** Where the household's day starts and ends (families.time_zone, roadmap
 * item 9). A short list of real IANA names rather than all ~400: one per
 * place Kin's families actually are, in the same spirit as COUNTRIES. The
 * database default is Asia/Manila, so a household that never opens this is
 * exactly where it was. */
export const TIME_ZONES = [
  { value: "Asia/Manila", label: "Manila (GMT+8)" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (GMT+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (GMT+9)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Asia/Qatar", label: "Doha (GMT+3)" },
  { value: "Asia/Riyadh", label: "Riyadh (GMT+3)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris, Berlin, Rome" },
  { value: "America/New_York", label: "New York, Toronto (Eastern)" },
  { value: "America/Chicago", label: "Chicago (Central)" },
  { value: "America/Denver", label: "Denver (Mountain)" },
  { value: "America/Los_Angeles", label: "Los Angeles, Vancouver (Pacific)" },
  { value: "Pacific/Honolulu", label: "Honolulu" },
  { value: "Australia/Perth", label: "Perth" },
  { value: "Australia/Sydney", label: "Sydney, Melbourne" },
  { value: "Pacific/Auckland", label: "Auckland" },
] as const;

export const DEFAULT_TIME_ZONE = "Asia/Manila";

export function isTimeZone(value: string): boolean {
  return TIME_ZONES.some((z) => z.value === value);
}

/** The usual zone for a country, so picking a country can suggest one. */
export const COUNTRY_TIME_ZONE: Record<string, string> = {
  ph: "Asia/Manila", us: "America/New_York", ca: "America/New_York", gb: "Europe/London", au: "Australia/Sydney",
  sg: "Asia/Singapore", ae: "Asia/Dubai", sa: "Asia/Riyadh", qa: "Asia/Qatar", hk: "Asia/Hong_Kong", jp: "Asia/Tokyo",
};
