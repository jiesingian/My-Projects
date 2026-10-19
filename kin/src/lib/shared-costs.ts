/** Shared costs between linked households: siblings, each in their own
 * household, sharing a parent's costs -- Lola's medicines, her check-ups.
 *
 * Pure functions, so who owes whom can be tested without a database. The
 * rules about who may see and write a pot are the policies of
 * 20261019153000_shared_costs.sql. Money is worked in centavos so a three-way
 * split of ₱1,000 never leaves a stray fraction. */

export type PotHousehold = { familyId: string; name: string; share: number };
export type PotEntry = { kind: "cost" | "payment"; familyId: string; toFamilyId: string | null; amount: number };

export type HouseholdBalance = {
  familyId: string;
  name: string;
  /** Costs this household paid. */
  paid: number;
  /** Its share of every cost in the pot. */
  fairShare: number;
  /** Positive: the others owe it this much. Negative: it owes this much. */
  net: number;
};

export type Settlement = { fromFamilyId: string; fromName: string; toFamilyId: string; toName: string; amount: number };

const cents = (n: number) => Math.round(n * 100);

/** Split `total` centavos by weight, largest remainders first, so the parts
 * always add back up to the total exactly. */
export function splitByShare(total: number, shares: number[]): number[] {
  const sum = shares.reduce((a, s) => a + Math.max(0, s), 0);
  if (sum <= 0 || shares.length === 0) return shares.map(() => 0);
  const exact = shares.map((s) => (total * Math.max(0, s)) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((x, y) => y.r - x.r || x.i - y.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k].i] += 1;
  return out;
}

/** Each household's standing in the pot: what it paid, its share of all
 * costs, and the net after payments between households. Nets add to zero. */
export function potBalances(households: PotHousehold[], entries: PotEntry[]): HouseholdBalance[] {
  const index = new Map(households.map((h, i) => [h.familyId, i]));
  const paid = households.map(() => 0);
  const net = households.map(() => 0);
  let totalCost = 0;
  for (const e of entries) {
    const from = index.get(e.familyId);
    const amount = cents(e.amount);
    if (from === undefined || !(amount > 0)) continue;
    if (e.kind === "cost") {
      paid[from] += amount;
      totalCost += amount;
      net[from] += amount;
    } else {
      const to = e.toFamilyId ? index.get(e.toFamilyId) : undefined;
      if (to === undefined || to === from) continue;
      // Paying someone you owe reduces what you owe; receiving it reduces
      // what you are owed.
      net[from] += amount;
      net[to] -= amount;
    }
  }
  const fair = splitByShare(totalCost, households.map((h) => h.share));
  return households.map((h, i) => ({
    familyId: h.familyId,
    name: h.name,
    paid: paid[i] / 100,
    fairShare: fair[i] / 100,
    net: (net[i] - fair[i]) / 100,
  }));
}

/** The fewest payments that settle the pot: the household owing most pays
 * the one owed most, and so on until everyone is square. */
export function settleUp(balances: HouseholdBalance[]): Settlement[] {
  const owes = balances.filter((b) => b.net < 0).map((b) => ({ ...b, left: -cents(b.net) })).sort((a, b) => b.left - a.left);
  const owed = balances.filter((b) => b.net > 0).map((b) => ({ ...b, left: cents(b.net) })).sort((a, b) => b.left - a.left);
  const out: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < owes.length && j < owed.length) {
    const amount = Math.min(owes[i].left, owed[j].left);
    if (amount > 0) out.push({ fromFamilyId: owes[i].familyId, fromName: owes[i].name, toFamilyId: owed[j].familyId, toName: owed[j].name, amount: amount / 100 });
    owes[i].left -= amount;
    owed[j].left -= amount;
    if (owes[i].left === 0) i++;
    if (owed[j].left === 0) j++;
  }
  return out;
}

/** "Half", "a third", or "2 of 5 parts" -- a household's share in words. */
export function shareLabel(share: number, all: number[]): string {
  const sum = all.reduce((a, s) => a + s, 0);
  if (sum <= 0) return "";
  if (all.every((s) => s === all[0])) {
    const n = all.length;
    return n === 1 ? "all of it" : n === 2 ? "half" : n === 3 ? "a third" : n === 4 ? "a quarter" : `1 of ${n} equal parts`;
  }
  return `${Math.round((share / sum) * 100)}%`;
}
