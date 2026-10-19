/** Monito-monita (20261019170200_gift_draw.sql): the rules of the draw as
 * the screens read them. The draw itself runs in the database
 * (draw_gift_draw), so nobody's phone ever holds anyone else's pick; this
 * mirrors it -- the same loop and the same "keep households apart" layout --
 * so the logic tests can hold the rule, and so the screen can say before
 * anyone taps Draw whether it can be done. */

export const DRAW_MIN = 3;
export const WISH_MAX = 200;
export const WISHES_MAX = 10;

export type DrawPerson = { id: string; familyId: string };

/** Can a draw of these people keep every pick out of the picker's own
 * household? Only when no household is more than half of it. */
export function canKeepApart(people: DrawPerson[]): boolean {
  const sizes = new Map<string, number>();
  for (const p of people) sizes.set(p.familyId, (sizes.get(p.familyId) ?? 0) + 1);
  return Math.max(0, ...sizes.values()) * 2 <= people.length;
}

/** Why the draw can't be done yet, in words; null when it can. */
export function drawProblem(people: DrawPerson[], notOwnHousehold: boolean): string | null {
  if (people.length < DRAW_MIN) return `Put at least ${DRAW_MIN} people in to draw.`;
  if (notOwnHousehold && !canKeepApart(people)) return "One household is more than half the draw, so someone would pick their own. Ask more people in, or allow picking from your own household.";
  return null;
}

/** The draw, as the database does it: one loop through everyone, each
 * picking the next. With `notOwnHousehold`, biggest households first and
 * every other place first, so no two neighbours share a household. `random`
 * is injectable for the tests. Returns giver -> receiver. */
export function drawLoop(people: DrawPerson[], notOwnHousehold: boolean, random: () => number = Math.random): Map<string, string> {
  if (drawProblem(people, notOwnHousehold)) throw new Error(drawProblem(people, notOwnHousehold)!);
  const shuffled = people.map((p) => ({ p, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.p);
  let order = shuffled;
  if (notOwnHousehold) {
    const size = new Map<string, number>();
    const tie = new Map<string, number>();
    for (const p of shuffled) {
      size.set(p.familyId, (size.get(p.familyId) ?? 0) + 1);
      if (!tie.has(p.familyId)) tie.set(p.familyId, random());
    }
    const ordered = [...shuffled].sort((a, b) => size.get(b.familyId)! - size.get(a.familyId)! || tie.get(a.familyId)! - tie.get(b.familyId)!);
    const n = ordered.length;
    const half = Math.ceil(n / 2);
    order = new Array(n);
    ordered.forEach((p, i) => {
      order[i < half ? 2 * i : 2 * (i - half) + 1] = p;
    });
  }
  const picks = new Map<string, string>();
  order.forEach((p, i) => picks.set(p.id, order[(i + 1) % order.length].id));
  return picks;
}

/** "₱500 max" -- the cap as the draw's card says it. */
export function capLine(cap: number | null, currency: string): string {
  if (cap == null) return "No price cap";
  const amount = new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: cap % 1 === 0 ? 0 : 2 }).format(cap);
  return `${amount} max`;
}

/** One wish per line, trimmed, blanks dropped, at most WISHES_MAX of
 * WISH_MAX characters each. */
export function parseWishes(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, " ").slice(0, WISH_MAX))
    .filter(Boolean)
    .slice(0, WISHES_MAX);
}
