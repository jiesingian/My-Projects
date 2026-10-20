/** A young child's sticker board (Janine, 20 October): the rules, as pure
 * functions. */

/** The goals still to do, at most `max` at a time in their order (the next
 * comes as each is done); the done ones become the day's stickers. */
export function boardGoals<G extends { reached: boolean }>(goals: G[], max = 4): { showing: G[]; stickers: G[]; waiting: number } {
  const todo = goals.filter((g) => !g.reached);
  return { showing: todo.slice(0, max), stickers: goals.filter((g) => g.reached), waiting: Math.max(0, todo.length - max) };
}

/** Little pictures to fill instead of a number: one per tap, rounded up
 * (7.5 cups is eight), at most ten -- past that, a share of ten. */
export function progressPips(current: number, target: number): boolean[] {
  const slots = Math.min(10, Math.max(1, Math.ceil(target)));
  const filled = target <= 10 ? Math.floor(current) : Math.floor((current / target) * slots);
  return Array.from({ length: slots }, (_, i) => i < Math.min(slots, filled));
}

/** Whose goals are a sticker board: a child's goals that are their own
 * (the credit stays with them), each with a picture. A baby's goals, which
 * credit the grown-up who ticks them, stay compact rows. */
export function isBoard(goals: { creditTo: "owner" | "logger"; emoji: string | null }[]): boolean {
  return goals.length > 0 && goals.every((g) => g.creditTo === "owner" && !!g.emoji);
}
