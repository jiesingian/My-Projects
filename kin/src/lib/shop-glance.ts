/** Today's shopping, said once (Janine, 21 October): the At a glance tile
 * is the one place Today mentions the list -- what is on it, about what it
 * costs, and what is running low in the pantry and not on it yet. */
export function shopGlance(
  s: { open: string[]; estimate: number; unpriced: number; low: number },
  money: (n: number) => string,
): { value: string; label: string } {
  const low = s.low > 0 ? `${s.low} running low` : null;
  if (s.open.length === 0) return low ? { value: low, label: "not on the list yet" } : { value: "List clear", label: "shopping list is empty" };
  const about = s.estimate > 0 ? `about ${money(s.estimate)}${s.unpriced > 0 ? " + unpriced" : ""}` : s.open.slice(0, 3).join(", ");
  return { value: `${s.open.length} to buy`, label: low ? `${about} · ${low}` : about };
}
