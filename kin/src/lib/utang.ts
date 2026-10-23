/** Utang and paluwagan (20261019110000): money lent to or borrowed from
 * relatives, paid back a little at a time, and the rotating savings group
 * where each round one member takes the pot.
 *
 * Kin keeps the record and never contacts anybody. A reminder is a message
 * written here for a grown-up to send themselves -- polite, in the Taglish a
 * tita would actually receive, and only for an entry they switched it on
 * for. */

import { formatCurrency } from "@/lib/format";

export type UtangDirection = "lent" | "borrowed";
export type PaluwaganFrequency = "weekly" | "semi_monthly" | "monthly";

export const FREQUENCY_LABEL: Record<PaluwaganFrequency, string> = {
  weekly: "Every week",
  semi_monthly: "Twice a month (kinsenas)",
  monthly: "Every month",
};

export const VISIBILITY_CHOICES = [
  { value: "household", label: "Household grown-ups" },
  { value: "private", label: "Just me" },
] as const;

const centavos = (n: number) => Math.round(n * 100) / 100;

/** What is still owed, and whether it is done. Never below zero. */
export function utangLeft(amount: number, payments: { amount: number | string }[]): { paid: number; left: number; settled: boolean } {
  const paid = centavos(payments.reduce((n, p) => n + Number(p.amount), 0));
  const left = Math.max(0, centavos(amount - paid));
  return { paid, left, settled: left === 0 };
}

/** Why a payment cannot be recorded, or null. */
export function paymentProblem(amount: number, left: number): string | null {
  if (!(amount > 0)) return "Enter how much was paid.";
  if (amount > left) return `Only ${left.toFixed(2)} is left on this utang.`;
  return null;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The date of round `round` (1 is the start date).
 *
 *  - weekly: every 7 days;
 *  - monthly: the same day each month, or the month's last day when it is
 *    shorter (a group started on the 31st pays on 30 April);
 *  - semi_monthly: twice a month, the kinsenas rhythm of a 15th/30th pay.
 *    From the 15th or before: the start day and fifteen days later (or the
 *    month's last day). After the 15th: the start day, then fifteen days
 *    before it in the next month -- so a group started on the 30th pays the
 *    30th and the 15th, not the 30th and the 31st (or 28 Feb twice). */
export function roundDate(startsOn: string, frequency: PaluwaganFrequency, round: number): string {
  const start = new Date(`${startsOn}T00:00:00Z`);
  if (frequency === "weekly") {
    start.setUTCDate(start.getUTCDate() + 7 * (round - 1));
    return iso(start);
  }
  const second = frequency === "semi_monthly" && (round - 1) % 2 === 1;
  const late = start.getUTCDate() > 15;
  const monthsOn = (frequency === "monthly" ? round - 1 : Math.floor((round - 1) / 2)) + (second && late ? 1 : 0);
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + monthsOn;
  const year = y + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const day = Math.min(start.getUTCDate() + (second ? (late ? -15 : 15) : 0), lastDay(year, month));
  return iso(new Date(Date.UTC(year, month, day)));
}

/** The round that is on now: the latest whose date has come, up to the last
 * round. 0 before the first. */
export function currentRound(startsOn: string, frequency: PaluwaganFrequency, rounds: number, todayISO: string): number {
  let n = 0;
  for (let r = 1; r <= rounds; r++) {
    if (roundDate(startsOn, frequency, r) <= todayISO) n = r;
    else break;
  }
  return n;
}

/** One instalment of an utang agreed as so many payments
 * (20261022180000). */
export type Instalment = {
  n: number;
  due: string;
  amount: number;
  /** paid: covered in full; part: some of it in; overdue: its date has
   * passed and it is not covered; upcoming: not due yet. */
  status: "paid" | "part" | "overdue" | "upcoming";
};

/** The instalments of an utang: dates on the paluwagan's rhythms
 * (roundDate), equal amounts with any leftover centavos on the last one,
 * and what has been paid so far applied to them in order -- so paying two
 * at once covers two, and a short payment leaves one part-paid. */
export function instalmentPlan(amount: number, count: number, frequency: PaluwaganFrequency, firstDue: string, paid: number, todayISO: string): Instalment[] {
  const each = Math.floor((amount / count) * 100) / 100;
  let dueSoFar = 0;
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const share = n === count ? centavos(amount - each * (count - 1)) : each;
    const before = dueSoFar;
    dueSoFar = centavos(dueSoFar + share);
    const due = roundDate(firstDue, frequency, n);
    const status: Instalment["status"] = paid >= dueSoFar ? "paid" : due < todayISO ? "overdue" : paid > before ? "part" : "upcoming";
    return { n, due, amount: share, status };
  });
}

/** Where the household stands in a paluwagan: what "us" has put in, less
 * the pot if our turn has come and gone. Positive is savings the group
 * still owes us (an asset); negative, after taking the pot early, is what
 * we still owe it (a liability). 0 for a group we are not in. */
export function paluwaganPosition(
  g: { contribution: number; frequency: PaluwaganFrequency; startsOn: string; members: { id: string; turn: number; isUs: boolean }[]; paidRounds: { memberId: string; round: number }[] },
  todayISO: string,
): number {
  const us = g.members.find((m) => m.isUs);
  if (!us) return 0;
  const putIn = g.paidRounds.filter((p) => p.memberId === us.id).length * g.contribution;
  const taken = currentRound(g.startsOn, g.frequency, g.members.length, todayISO) >= us.turn ? pot(g.contribution, g.members.length) : 0;
  return centavos(putIn - taken);
}

/** The pot one member takes in their round. */
export function pot(contribution: number, members: number): number {
  return centavos(contribution * members);
}

function day(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric" });
}

const HONORIFICS = new Set(["tita", "tito", "ate", "kuya", "lola", "lolo", "ninang", "ninong", "manang", "manong", "tiya", "tiyo", "insan", "mama", "papa", "nanay", "tatay"]);

/** How the message greets them: "Tita Baby" from "Tita Baby Cruz", "Joy"
 * from "Joy Santos" -- the honorific stays with the name it goes with. */
export function greetingName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return name;
  return HONORIFICS.has(words[0].toLowerCase()) && words.length > 1 ? `${words[0]} ${words[1]}` : words[0];
}

/** A gentle reminder for money lent: the amount, what has come back, what is
 * left, no pressure. Null for money borrowed -- nobody is reminded of what
 * we owe them, and the grown-up does not need a message to themselves. */
export function utangReminder(u: { direction: UtangDirection; personName: string; amount: number; paid: number; left: number; dueOn: string | null; currency: string }): string | null {
  if (u.direction !== "lent" || u.left <= 0) return null;
  const money = (n: number) => formatCurrency(n, u.currency);
  const paidLine = u.paid > 0 ? ` Salamat po sa ${money(u.paid)} na naibalik na — ${money(u.left)} na lang po ang natitira.` : "";
  const due = u.dueOn ? ` Kung kaya po bago mag-${day(u.dueOn)}, malaking tulong na po.` : " Kahit paunti-unti lang po, okay lang.";
  return `Hi ${greetingName(u.personName)}! Kumusta po? Gentle reminder lang po sa ${money(u.amount)} na hiniram.${paidLine}${due} Walang pressure po, salamat! 🙏`;
}

/** A gentle reminder for a member whose hulog for this round is not in yet. */
export function paluwaganReminder(p: { memberName: string; groupName: string; round: number; contribution: number; dueOn: string; currency: string }): string {
  return `Hi ${greetingName(p.memberName)}! Paalala lang po sa hulog para sa paluwagan "${p.groupName}" — round ${p.round}, ${formatCurrency(p.contribution, p.currency)}, para sa ${day(p.dueOn)}. Salamat po! 🙏`;
}
