/** Subscriptions: what repeats (Janine, 7 October roadmap).
 *
 * Built from rows the household already keeps -- a bill that repeats is a
 * charge, an income schedule that repeats is money that keeps coming in --
 * so nothing new is stored. Neither table regenerates itself (a paid
 * monthly bill stays paid; someone adds next month's), so the same thing
 * often appears several times. Rows of one kind with the same name and the
 * same repeat are one subscription here, priced at its open row (the one
 * still to pay) or else its latest.
 *
 * Privacy is the caller's: rows tied to an account the viewer cannot see
 * are dropped before they reach this (queries/subscriptions.ts). */

export const PER_YEAR = { monthly: 12, quarterly: 4, yearly: 1 } as const;
export type Repeat = keyof typeof PER_YEAR;
const MONTHS: Record<Repeat, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export const REPEAT_LABELS: Record<Repeat, string> = { monthly: "Every month", quarterly: "Every quarter", yearly: "Every year" };

export function isRepeat(recurrence: string | null | undefined): recurrence is Repeat {
  return !!recurrence && Object.prototype.hasOwnProperty.call(PER_YEAR, recurrence);
}

/** A bill or an income schedule, reduced to what this page needs. `date` is
 * the bill's due date or the schedule's next date; `settled` is paid or
 * received. */
export type RepeatingRow = {
  id: string;
  name: string;
  amount: number | string;
  recurrence: string | null;
  date: string | null;
  settled: boolean;
  category: string | null;
};

export type Subscription = {
  id: string;
  name: string;
  category: string | null;
  repeat: Repeat;
  amount: number;
  monthly: number;
  yearly: number;
  /** The next date it falls on, or null when no date was ever set. */
  next: string | null;
  /** True when the next date is already past and still open. */
  overdue: boolean;
};

/** `day` (YYYY-MM-DD) plus whole months, kept to the month's last day when
 * the day does not exist there (31 January + 1 month = 28 or 29 February). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** When it next falls. An open row is next on its own date, overdue or not
 * -- it is still owed. A settled one is next one period on, and on again
 * until that is today or later. Counted from the original day each time,
 * so a 31st stays the 31st wherever the month has one. */
export function nextDate(row: Pick<RepeatingRow, "date" | "settled">, repeat: Repeat, today: string): string | null {
  if (!row.date) return null;
  const day = row.date.slice(0, 10);
  if (!row.settled) return day;
  let n = 1;
  let next = addMonths(day, MONTHS[repeat]);
  while (next < today) next = addMonths(day, MONTHS[repeat] * ++n);
  return next;
}

/** One subscription per name and repeat, soonest first; undated ones last. */
export function subscriptionsFrom(rows: RepeatingRow[], today: string): Subscription[] {
  const groups = new Map<string, { repeat: Repeat; rows: RepeatingRow[] }>();
  for (const r of rows) {
    if (!isRepeat(r.recurrence) || !(Number(r.amount) > 0)) continue;
    const key = `${r.name.trim().toLowerCase()}\u0000${r.recurrence}`;
    const g = groups.get(key) ?? { repeat: r.recurrence, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const out: Subscription[] = [];
  for (const { repeat, rows: group } of groups.values()) {
    const byDate = [...group].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const pick = byDate.find((r) => !r.settled) ?? byDate[byDate.length - 1];
    const amount = Number(pick.amount);
    const next = nextDate(pick, repeat, today);
    out.push({
      id: pick.id,
      name: pick.name.trim(),
      category: pick.category,
      repeat,
      amount,
      monthly: (amount * PER_YEAR[repeat]) / 12,
      yearly: amount * PER_YEAR[repeat],
      next,
      overdue: !pick.settled && !!next && next < today,
    });
  }
  return out.sort((a, b) => (a.next ?? "9999").localeCompare(b.next ?? "9999") || a.name.localeCompare(b.name));
}

export function yearlyTotal(subs: Subscription[]): number {
  return subs.reduce((sum, s) => sum + s.yearly, 0);
}
