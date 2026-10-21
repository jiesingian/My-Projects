/** The next one of a repeating bill (Jonathan, 21 October: "the app raises
 * it, the user approves").
 *
 * A paid bill stays paid and nothing makes next month's on its own
 * (lib/subscriptions.ts). So when a repeating bill is paid, and on Today and
 * Cash Flow for one paid earlier, Kin offers to add the next one; nothing is
 * created without the tap (addNextBillAction). Pure, so the date rules have
 * logic tests (e2e/bill-roll.logic.spec.ts). */

import { addMonths, isRepeat, type Repeat } from "@/lib/subscriptions";

/** Bills repeat monthly, quarterly or yearly (the Add bill form); there is
 * no weekly bill. */
const MONTHS: Record<Repeat, number> = { monthly: 1, quarterly: 3, yearly: 12 };

export type RollableBill = {
  id: string;
  name: string;
  amount: number | string;
  due_date: string | null;
  recurrence: string | null;
  status: string;
};

export type NextBillOffer = { billId: string; name: string; amount: number; dueDate: string; repeat: Repeat };

/** When the next one falls: one period after the paid one's due date,
 * counted from that day each time (a 31st is the 30th or the 28th where the
 * month is shorter, and the 31st again where it has one). Periods already
 * wholly gone are skipped -- a bill last paid in July offers this month's,
 * not August's -- but the current one is kept even if its day has passed,
 * since it is still owed. Null for a one-off or an undated bill. */
export function nextBillDate(dueDate: string | null, recurrence: string | null, today: string): string | null {
  if (!dueDate || !isRepeat(recurrence)) return null;
  const day = dueDate.slice(0, 10);
  const step = MONTHS[recurrence];
  let n = 1;
  while (addMonths(day, step * (n + 1)) <= today) n++;
  return addMonths(day, step * n);
}

const sameBill = (a: RollableBill, b: RollableBill) =>
  a.id !== b.id && a.recurrence === b.recurrence && a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

/** The household already has the next one: a bill of the same name and
 * repeat that is still open, or due later than this one. */
export function hasNextBill(bill: RollableBill, all: RollableBill[]): boolean {
  return all.some((o) => sameBill(bill, o) && (o.status !== "paid" || (!!o.due_date && !!bill.due_date && o.due_date.slice(0, 10) > bill.due_date.slice(0, 10))));
}

/** The offer for this paid bill, or null when there is nothing to offer. */
export function nextBillOffer(bill: RollableBill, all: RollableBill[], today: string): NextBillOffer | null {
  if (bill.status !== "paid") return null;
  const dueDate = nextBillDate(bill.due_date, bill.recurrence, today);
  if (!dueDate || hasNextBill(bill, all)) return null;
  return { billId: bill.id, name: bill.name, amount: Number(bill.amount), dueDate, repeat: bill.recurrence as Repeat };
}

/** "next month's", "next quarter's", "next year's". */
export function nextLabel(repeat: Repeat): string {
  return { monthly: "next month's", quarterly: "next quarter's", yearly: "next year's" }[repeat];
}

/** Every paid repeating bill with no next one, latest of each only. */
export function catchUpOffers(all: RollableBill[], today: string): NextBillOffer[] {
  const offers: NextBillOffer[] = [];
  for (const b of all) {
    const offer = nextBillOffer(b, all, today);
    if (offer) offers.push(offer);
  }
  return offers.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
