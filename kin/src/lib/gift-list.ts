/** Christmas gifts and aguinaldo (20261019170300_gift_list.sql): what the
 * list adds up to. Pure, so the screen and the logic tests agree. */

export type GiftKind = "family" | "inaanak" | "other";
export const GIFT_KINDS: { key: GiftKind; label: string }[] = [
  { key: "family", label: "Family" },
  { key: "inaanak", label: "Inaanak" },
  { key: "other", label: "Others" },
];

export type GiftItem = { id: string; label: string; cost: number | null; isCash: boolean; bought: boolean };
export type GiftPerson = { id: string; name: string; kind: GiftKind; budget: number | null; items: GiftItem[] };

export type PersonTotals = {
  /** Every idea's cost. */
  planned: number;
  /** What is bought (or, for cash, set aside). */
  bought: number;
  /** Budget minus planned; negative when over. Null with no budget. */
  left: number | null;
  over: boolean;
  done: boolean;
};

export function personTotals(p: Pick<GiftPerson, "budget" | "items">): PersonTotals {
  const planned = p.items.reduce((n, i) => n + (i.cost ?? 0), 0);
  const bought = p.items.filter((i) => i.bought).reduce((n, i) => n + (i.cost ?? 0), 0);
  const left = p.budget == null ? null : round(p.budget - planned);
  return { planned: round(planned), bought: round(bought), left, over: left !== null && left < 0, done: p.items.length > 0 && p.items.every((i) => i.bought) };
}

export type ListTotals = { budget: number; planned: number; bought: number; people: number; done: number; aguinaldo: number };

/** The whole year's list: budgets (those that have one), planned, bought,
 * how many people are done, and the cash set aside for aguinaldo. */
export function listTotals(people: GiftPerson[]): ListTotals {
  let budget = 0, planned = 0, bought = 0, done = 0, aguinaldo = 0;
  for (const p of people) {
    const t = personTotals(p);
    budget += p.budget ?? 0;
    planned += t.planned;
    bought += t.bought;
    if (t.done) done++;
    aguinaldo += p.items.filter((i) => i.isCash).reduce((n, i) => n + (i.cost ?? 0), 0);
  }
  return { budget: round(budget), planned: round(planned), bought: round(bought), people: people.length, done, aguinaldo: round(aguinaldo) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** "Lego set 1,200", "₱500 cash", "aguinaldo 200" typed into one box: the
 * label, the cost if it ends with one, and whether it is cash. */
export function parseGiftIdea(text: string): { label: string; cost: number | null; isCash: boolean } | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return null;
  const isCash = /\b(cash|aguinaldo|pera|envelope|ampao|ang ?pao)\b/i.test(t);
  // A number at the end is the cost when it says so (₱, PHP) or is 50 or
  // more; "iPhone 15" is a name, not ₱15.
  const m = /^(.*?)[\s,:-]*(₱|php)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:pesos?)?$/i.exec(t);
  const lead = /^(?:₱|php)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s+(.+)$/i.exec(t);
  let label = t;
  let cost: number | null = null;
  const trailing = m ? Number(m[3].replace(/,/g, "") + (m[4] ? `.${m[4]}` : "")) : NaN;
  if (m && m[1].trim() && (m[2] || trailing >= 50)) {
    label = m[1].trim();
    cost = trailing;
  } else if (lead) {
    label = lead[3].trim();
    cost = Number(lead[1].replace(/,/g, "") + (lead[2] ? `.${lead[2]}` : ""));
  }
  label = label.slice(0, 120);
  if (cost !== null && (!Number.isFinite(cost) || cost > 10_000_000)) cost = null;
  return { label, cost, isCash };
}

/** What the Wealth entry says: never a name, so a shared account's ledger
 * doesn't give the gift away. */
export function spendParticulars(item: Pick<GiftItem, "isCash">): string {
  return item.isCash ? "Aguinaldo" : "Christmas gift";
}
