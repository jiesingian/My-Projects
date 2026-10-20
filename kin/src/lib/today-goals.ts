import { asksOn } from "@/lib/game";

/** Today's Goals as a collapsible section (Janine, 20 October): the rules,
 * as pure functions, so they can be tested without a browser. */

/** The cookie that remembers, on this device, whether this member keeps the
 * section open. Named with the member, so two people sharing a tablet each
 * keep their own choice. Read on the server, so the page arrives already
 * open or closed instead of flickering. */
export function goalsCookieName(memberId: string): string {
  return `kin_today_goals_${memberId}`;
}

export const GOALS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The goals still to do, then the done ones (folded under "Done"), each
 * in the order they came. Done is a full ring for today (or this week). */
export function splitDone<T extends { reached: boolean }>(goals: T[]): { open: T[]; done: T[] } {
  return { open: goals.filter((g) => !g.reached), done: goals.filter((g) => g.reached) };
}

/** What the header says after "Today's Goals". */
export function goalsSummary(done: number, total: number): string {
  return total > 0 && done >= total ? "All done! 🎉" : `${done} of ${total} done`;
}

/** Open or closed when the page loads: closed once everything is done,
 * whatever was saved; otherwise the member's last choice on this device,
 * open if they never made one. */
export function startsOpen(saved: string | undefined, done: number, total: number): boolean {
  if (total > 0 && done >= total) return false;
  return saved !== "0";
}

/** "5/8", "9,000/10,000" -- whole numbers grouped, one decimal at most. */
export function progressText(current: number, target: number): string {
  const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-PH", { maximumFractionDigits: 1 });
  return `${n(current)}/${n(target)}`;
}

/** Is a goal asked of today? On, and -- for a goal on some weekdays only --
 * one of its days (20261020210000). */
export function asksToday(g: { active: boolean; period: string; days: readonly number[] | null }, today: string): boolean {
  return g.active && (g.period !== "day" || asksOn(g.days, today));
}

/** The game goals of the children with no login, a group per child in the
 * household's order, for a grown-up's Today: today's dailies and this
 * week's weeklies. A child with none asked today has no group. */
export function childGoals<G extends { ownerId: string | null; category: string | null; active: boolean; period: string; days: readonly number[] | null; backup: boolean }>(
  goals: G[],
  children: { id: string; full_name: string }[],
  today: string,
): { child: { id: string; full_name: string }; goals: G[] }[] {
  return children
    .map((child) => ({
      child,
      goals: goals.filter((g) => g.ownerId === child.id && g.category !== null && !g.backup && (g.period === "day" || g.period === "week") && asksToday(g, today)),
    }))
    .filter((c) => c.goals.length > 0);
}
