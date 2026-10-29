/** Home upkeep (20261029160000_home_upkeep.sql): when a thing in the home is
 * next due a service, and whether its warranty is about to end. Pure, so
 * Today, the breakdown sheet and the logic spec agree. */

export type UpkeepItem = { id: string; name: string; asset_id: string; acquired_on: string | null; service_every_months: number | null; last_serviced_on: string | null; warranty_until: string | null };

/** YYYY-MM-DD `months` after `iso`, the last day of a shorter month when
 * the day doesn't exist (31 August + 6 months is 28 or 29 February). */
export function addMonthsISO(iso: string, months: number): string {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1 + months, d = Number(iso.slice(8, 10));
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, m, Math.min(d, last)));
  return t.toISOString().slice(0, 10);
}

/** When the next service is due: from the last one, else from when it was
 * bought; null when it isn't serviced on a schedule or has no date to count from. */
export function nextServiceDue(i: Pick<UpkeepItem, "acquired_on" | "service_every_months" | "last_serviced_on">): string | null {
  if (!i.service_every_months) return null;
  const from = i.last_serviced_on ?? i.acquired_on;
  return from ? addMonthsISO(from.slice(0, 10), i.service_every_months) : null;
}

const days = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000);

/** What Today says: services due (today or overdue), and warranties ending
 * within the coming week (0 = today). */
export function upkeepDue(items: UpkeepItem[], today: string): { service: (UpkeepItem & { due: string })[]; warranty: (UpkeepItem & { inDays: number })[] } {
  const service = items.flatMap((i) => {
    const due = nextServiceDue(i);
    return due && due <= today ? [{ ...i, due }] : [];
  });
  const warranty = items.flatMap((i) => {
    if (!i.warranty_until) return [];
    const n = days(today, i.warranty_until.slice(0, 10));
    return n >= 0 && n <= 7 ? [{ ...i, inDays: n }] : [];
  });
  return { service, warranty };
}
