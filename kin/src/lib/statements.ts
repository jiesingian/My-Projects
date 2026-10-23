/** A family's financial statements (Janine, 23 October), the way an annual
 * report or the SALN reads -- made plain enough for a household.
 *
 * Every confirmed ledger entry is one of:
 *
 *   income         money earned or received, by type of income;
 *   living         what the household spends to live -- a cost;
 *   interest       the interest part of a loan payment -- a cost
 *                  (20261023220000);
 *   debtPaid       the principal part of a loan payment: cash into less
 *                  debt, not a cost;
 *   bought         buying or adding to an asset (wealth_transactions.capital,
 *                  20261023232000): cash into the asset, not a cost;
 *   sold           money from selling something ("Sold items");
 *   saved          money set aside into a savings goal: still the
 *                  household's, not a cost;
 *   utangBack      a loan to a relative paid back ("Utang paid back"): what
 *                  was owed to us coming home, not income.
 *
 * Transfers between the household's own accounts are none of these.
 *
 * From those, three statements: income and expenses (what was earned less
 * what it cost to live and borrow -- the surplus); where the cash went, in
 * the three groups a cash flow statement uses (day to day, buying and
 * selling things, borrowing and lending); and, for a year, income grouped
 * the way the BIR's income tax return groups it. */

import { GOAL_CATEGORY, TRANSFER_CATEGORY } from "@/lib/wealth";

export type StatementEntry = {
  direction: string;
  amount: number | string;
  category: string | null;
  source_table: string | null;
  principal_amount: number | string | null;
  capital: boolean | null;
  transfer_group_id: string | null;
};

const cents = (n: number) => Math.round(n * 100) / 100;
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, cents((m.get(k) ?? 0) + v));
const sorted = (m: Map<string, number>) => [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);

export function buildStatements(entries: StatementEntry[]) {
  const income = new Map<string, number>();
  const living = new Map<string, number>();
  let interest = 0, debtPaid = 0, bought = 0, sold = 0, saved = 0, utangBack = 0;

  for (const e of entries) {
    if (e.transfer_group_id || e.category === TRANSFER_CATEGORY) continue;
    const amount = Number(e.amount);
    const category = e.category ?? "Other";
    if (e.direction === "in") {
      if (category === "Sold items") sold += amount;
      else if (category === "Utang paid back") utangBack += amount;
      else if (category === GOAL_CATEGORY) saved -= amount;
      else add(income, category, amount);
      continue;
    }
    if (e.source_table === "liabilities") {
      const principal = Math.min(amount, Number(e.principal_amount ?? 0));
      debtPaid += principal;
      interest += amount - principal;
    } else if (e.capital) bought += amount;
    else if (category === GOAL_CATEGORY || e.source_table === "goals") saved += amount;
    else add(living, category, amount);
  }

  const incomeTotal = cents([...income.values()].reduce((s, v) => s + v, 0));
  const livingTotal = cents([...living.values()].reduce((s, v) => s + v, 0));
  interest = cents(interest);
  const surplus = cents(incomeTotal - livingTotal - interest);
  return {
    income: sorted(income),
    incomeTotal,
    living: sorted(living),
    livingTotal,
    interest,
    surplus,
    cash: {
      dayToDay: surplus,
      things: cents(sold - bought),
      bought: cents(bought),
      sold: cents(sold),
      borrowing: cents(utangBack - debtPaid),
      debtPaid: cents(debtPaid),
      utangBack: cents(utangBack),
      saved: cents(saved),
    },
  };
}

/** Income grouped the way the BIR's annual income tax return groups it
 * (BIR Form 1700 for employees, 1701/1701A for the self-employed and mixed
 * income), from Kin's types of income. For the household's reference: it
 * is not a return, and an accountant has the last word. */
export const BIR_GROUPS = [
  {
    key: "compensation",
    label: "Compensation income",
    note: "Salary and wages, as on each employer's BIR Form 2316. The 13th month pay and other benefits are tax-exempt up to ₱90,000 a year.",
    categories: ["Salary", "Bonus & 13th month"],
  },
  {
    key: "business",
    label: "Business and professional income",
    note: "Gross sales or receipts: a business, freelance work, side jobs. Filed on BIR Form 1701 or 1701A.",
    categories: ["Business", "Freelance & side jobs"],
  },
  {
    key: "rent",
    label: "Rental income",
    note: "Rent received for a house, room or space let out. Reported with business income.",
    categories: ["House (rent)"],
  },
  {
    key: "passive",
    label: "Passive income, already taxed",
    note: "Bank interest and dividends: the bank withholds a final tax (20% on interest), so it is not filed again.",
    categories: ["Investment"],
  },
  {
    key: "untaxed",
    label: "Usually not taxed",
    note: "Remittances, gifts, allowances, refunds, government aid, and SSS or GSIS pensions are usually not taxable income. Large gifts may owe donor's tax by the giver.",
    categories: ["Remittance", "Gift", "Allowance", "Refund", "Government aid", "Pension"],
  },
] as const;

export function birSummary(income: { category: string; amount: number }[]) {
  const known = new Set<string>(BIR_GROUPS.flatMap((g) => g.categories));
  const groups = BIR_GROUPS.map((g) => {
    const lines = income.filter((i) => (g.categories as readonly string[]).includes(i.category));
    return { ...g, lines, total: cents(lines.reduce((s, l) => s + l.amount, 0)) };
  });
  const other = income.filter((i) => !known.has(i.category));
  return { groups, other, otherTotal: cents(other.reduce((s, l) => s + l.amount, 0)) };
}
