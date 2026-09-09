/** A plain YYYY-MM-DD, split into its parts without consulting a clock.
 *
 * `new Date("2018-09-06")` is UTC midnight, and every getter below it
 * (`getDate`, `getMonth`, `getFullYear`) is LOCAL. So the same stored date
 * renders as two different days depending on where it is read: the server
 * sits in Asia/Manila and a browser in the Americas is hours behind, which
 * puts it on the day before.
 *
 * Measured 9 September on a member's date of birth, server against browser:
 *
 *   server   06/09/2018
 *   browser  07/09/2018
 *
 * React reports that as a hydration mismatch -- which is how it was found,
 * by a new test on the member profile page -- and a person reads it as the
 * wrong birthday. A date of birth is a day, not an instant; there is nothing
 * to convert and no zone to convert it into. */
function plainDateParts(value: string): { yyyy: string; mm: string; dd: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? { yyyy: m[1], mm: m[2], dd: m[3] } : null;
}

export function formatAge(dob: string | null): string {
  if (!dob) return "age unknown";
  const parts = plainDateParts(dob);
  // Built in UTC on both sides so the arithmetic below cannot land a day out.
  const birth = parts
    ? new Date(Date.UTC(Number(parts.yyyy), Number(parts.mm) - 1, Number(parts.dd)))
    : new Date(dob);
  const now = new Date();
  let months = (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + (now.getUTCMonth() - birth.getUTCMonth());
  if (now.getUTCDate() < birth.getUTCDate()) months -= 1;
  if (months < 24) return `${Math.max(months, 0)} month${months === 1 ? "" : "s"}`;
  return `${Math.floor(months / 12)}`;
}

export function formatCurrency(amount: number, currency = "PHP"): string {
  const symbol = currency === "PHP" ? "₱" : currency + " ";
  return symbol + amount.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatDate(date: string | Date, pattern = "DD/MM/YYYY"): string {
  // A plain date is read straight from its digits -- see plainDateParts. Only
  // a real instant (a timestamp, or a Date) goes through the local getters
  // below, where showing it in the reader's own zone is the point.
  const parts = typeof date === "string" ? plainDateParts(date) : null;
  if (parts) {
    return pattern === "MM/DD/YYYY"
      ? `${parts.mm}/${parts.dd}/${parts.yyyy}`
      : `${parts.dd}/${parts.mm}/${parts.yyyy}`;
  }
  const d = typeof date === "string" ? new Date(date) : date;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  if (pattern === "MM/DD/YYYY") return `${mm}/${dd}/${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A date spelled out, so that it cannot be misread.
 *
 * A native date input renders in the *browser's* locale, never the
 * household's. Chrome set to US shows 2026-09-07 as 09/07/2026, which reads
 * as the 9th of July to everyone here. A page cannot restyle a native picker
 * -- that is the whole point of it being native -- so this goes underneath and
 * says which day it actually is.
 *
 * Deliberately NOT the household's date_format. Echoing 07/09/2026 beneath
 * 09/07/2026 would offer two ambiguous readings where there was one. A month
 * name has no digit order to get wrong, which also means this needs no
 * household preference and so is safe in a client component.
 *
 * Parsed out of the string rather than through `new Date(iso)`, because that
 * is UTC midnight and west of Greenwich it is the day before -- the same trap
 * that walked the planner's times back eight hours. */
export function spellDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  const [, y, mo, d] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  const at = new Date(Date.UTC(year, month - 1, day));
  // Rejects 31 September and friends, which roll over silently.
  if (at.getUTCFullYear() !== year || at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return "";
  return `${WEEKDAYS[at.getUTCDay()]} ${day} ${MONTHS[month - 1]} ${year}`;
}

export function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/** Short names for a set of people, in the same order. First names alone,
 * except where two of them share one — families reuse names, and a filter
 * offering "Jonathan" twice cannot be used. Those get a surname initial, or
 * the whole surname where the initial collides too. */
export function shortNames(fullNames: string[]): string[] {
  const firstOf = (n: string) => n.trim().split(/\s+/)[0] ?? n.trim();
  const restOf = (n: string) => n.trim().split(/\s+/).slice(1).join(" ");

  const shared = new Set(fullNames.map(firstOf).filter((f, i, all) => all.indexOf(f) !== i));

  return fullNames.map((full) => {
    const first = firstOf(full);
    if (!shared.has(first)) return first;

    const rest = restOf(full);
    if (!rest) return full.trim();

    const sameFirst = fullNames.filter((n) => firstOf(n) === first);
    const initialsSuffice = new Set(sameFirst.map((n) => restOf(n).charAt(0).toUpperCase())).size === sameFirst.length;
    return initialsSuffice ? `${first} ${rest.charAt(0).toUpperCase()}.` : `${first} ${rest.split(/\s+/)[0]}`;
  });
}

/** How a person is named to themselves. A filter that says "Janine" reads
 * like someone else's view of the house; the same filter saying "Me" reads
 * like your own. Everyone else keeps their name. */
export function selfLabel(label: string, isMe: boolean): string {
  return isMe ? "Me" : label;
}

/** The possessive of that: "My accounts", "Janine's accounts". */
export function selfPossessive(label: string, isMe: boolean): string {
  return isMe ? "My" : `${label}\u2019s`;
}
