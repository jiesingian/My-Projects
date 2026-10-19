/** Allowance and alkansya (20261019100000): a child's weekly baon, chore
 * points changed into pesos, and the three jars -- gastos, ipon, bigay.
 *
 * A ledger of cash kept at home. Nothing here moves real money or touches
 * Wealth; the screens say so (ALKANSYA_DISCLAIMER). The arithmetic lives here
 * so the screen and the database split a peso the same way: the database's
 * alkansya_pay_allowances() rounds ipon and bigay to the centavo and gives
 * gastos what is left, and so does splitPesos. */

export const JARS = ["gastos", "ipon", "bigay"] as const;
export type Jar = (typeof JARS)[number];

export const JAR_LABEL: Record<Jar, { name: string; line: string }> = {
  gastos: { name: "Gastos", line: "to spend" },
  ipon: { name: "Ipon", line: "to save" },
  bigay: { name: "Bigay", line: "to give" },
};

export type AlkansyaKind = "allowance" | "points" | "interest" | "deposit" | "spend" | "give";

export const KIND_LABEL: Record<AlkansyaKind, string> = {
  allowance: "Weekly baon",
  points: "Points changed into pesos",
  interest: "Interest on ipon",
  deposit: "Added",
  spend: "Spent",
  give: "Given",
};

export const ALKANSYA_DISCLAIMER =
  "A record of the cash kept at home. Kin moves no real money and touches no bank or Wealth account.";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type Split = { gastos: number; ipon: number; bigay: number };

export const DEFAULT_SPLIT: Split = { gastos: 70, ipon: 20, bigay: 10 };

const centavos = (n: number) => Math.round(n * 100) / 100;

/** A peso amount across the jars, by percent. Ipon and bigay are rounded to
 * the centavo and gastos takes the rest, so the parts always add up to the
 * whole -- the same way the database splits the baon. */
export function splitPesos(amount: number, split: Split): Split {
  const ipon = centavos((amount * split.ipon) / 100);
  const bigay = centavos((amount * split.bigay) / 100);
  return { gastos: centavos(amount - ipon - bigay), ipon, bigay };
}

/** Whole percents from 0 to 100 that add up to 100, or why not. */
export function splitProblem(split: Split): string | null {
  const parts = [split.gastos, split.ipon, split.bigay];
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 100)) return "Each jar's share is a whole percent from 0 to 100.";
  if (parts.reduce((a, b) => a + b, 0) !== 100) return "The three shares have to add up to 100%.";
  return null;
}

/** Pesos for a number of points at the household's rate. */
export function pointsToPesos(points: number, pesoPerPoint: number): number {
  return centavos(points * pesoPerPoint);
}

/** "Interest" on what ipon holds, to the centavo. Nothing when either is
 * nothing or below. */
export function interestOn(ipon: number, pct: number): number {
  if (!(ipon > 0) || !(pct > 0)) return 0;
  return centavos((ipon * pct) / 100);
}

export type AlkansyaEntryRow = {
  jar: string;
  amount: number | string;
};

/** What each jar holds, summed from the ledger. */
export function jarBalances(rows: AlkansyaEntryRow[]): Split & { total: number } {
  const out = { gastos: 0, ipon: 0, bigay: 0 };
  for (const r of rows) {
    if ((JARS as readonly string[]).includes(r.jar)) out[r.jar as Jar] = centavos(out[r.jar as Jar] + Number(r.amount));
  }
  return { ...out, total: centavos(out.gastos + out.ipon + out.bigay) };
}

/** The next payday on or after `fromISO` (a household date, YYYY-MM-DD). */
export function nextPayday(fromISO: string, weekday: number): string {
  const d = new Date(`${fromISO}T00:00:00Z`);
  const ahead = (weekday - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + ahead);
  return d.toISOString().slice(0, 10);
}

/** The paydays after `paidThroughISO` up to and including `todayISO`, at
 * most twelve weeks back -- what alkansya_pay_allowances() will write. */
export function paydaysDue(paidThroughISO: string, todayISO: string, weekday: number): string[] {
  const floor = new Date(`${todayISO}T00:00:00Z`);
  floor.setUTCDate(floor.getUTCDate() - 84);
  const after = new Date(`${paidThroughISO}T00:00:00Z`);
  after.setUTCDate(after.getUTCDate() + 1);
  const start = after > floor ? after : floor;
  const out: string[] = [];
  for (let d = new Date(nextPayday(start.toISOString().slice(0, 10), weekday) + "T00:00:00Z"); d.toISOString().slice(0, 10) <= todayISO; d.setUTCDate(d.getUTCDate() + 7)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Why money cannot come out of a jar, or null when it can. */
export function withdrawalProblem(kind: "spend" | "give", jar: Jar, amount: number, balance: number): string | null {
  if (kind === "give" && jar !== "bigay") return "Giving comes out of bigay.";
  if (kind === "spend" && jar === "bigay") return "Bigay is for giving; spending comes out of gastos or ipon.";
  if (!(amount > 0)) return "Enter how much.";
  if (amount > balance) return `${JAR_LABEL[jar].name} only has ${balance.toFixed(2)}.`;
  return null;
}
