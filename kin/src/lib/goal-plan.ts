/** What a goal asks of each month (Janine, 26 October): its target spread
 * over the months from its start to its end date, both months counted --
 * saving from 1 November to 30 June is eight months. Rounded up to the
 * peso, so the months together never fall short. Null without an amount or
 * an end date, or an end before the start. */
export function monthlyNeeded(target: number, start: string, end: string): { months: number; perMonth: number } | null {
  if (!(target > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return null;
  const months = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + (Number(end.slice(5, 7)) - Number(start.slice(5, 7))) + 1;
  return { months, perMonth: Math.ceil(target / months) };
}
