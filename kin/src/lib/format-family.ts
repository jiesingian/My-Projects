import { cache } from "react";
import { getCurrentMember } from "@/lib/session";
import { formatDate } from "@/lib/format";

/** Dates written the way this household writes them.
 *
 * families.date_format has existed all along, Settings offers both readings,
 * and nothing read the answer: formatDate takes a pattern and defaults it to
 * DD/MM/YYYY, and all twenty-two call sites took the default. So the setting
 * saved, said it had saved, and every date in the app stayed day-first.
 *
 * The fix is not a prop threaded through twenty-two places. getCurrentMember
 * is wrapped in React's cache(), so within one request the household is
 * already in hand and asking again costs nothing -- which lets a server
 * component ask for a formatter bound to its own household and then use it
 * synchronously, exactly where it used to call formatDate.
 *
 * Server components only. Anything that ends up in a client bundle -- the hub
 * header, which client forms import for its sibling DetailHeader -- takes the
 * pattern as a prop instead. */
export const householdDateFormat = cache(async (): Promise<string> => {
  const me = await getCurrentMember();
  return me?.families.date_format ?? "DD/MM/YYYY";
});

/** A date formatter already carrying the household's pattern:
 *
 *     const fmtDate = await familyDate();
 *     ...
 *     {fmtDate(entry.occurred_at)}
 */
export async function familyDate(): Promise<(date: string | Date) => string> {
  const pattern = await householdDateFormat();
  return (date) => formatDate(date, pattern);
}
