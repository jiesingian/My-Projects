import type { BriefItem } from "@/lib/queries/today";

/** Simple Kin (Jonathan, 19 October): a per-person switch for grown-ups over
 * 60. Larger text and bigger tap targets across the app, and a Today with
 * only what a lolo or lola reaches for -- their medicines to tick, today's
 * plans, calling or messaging the family, and SOS (components/simple-today).
 *
 * Kid view wins where both are on: it is a grown-up's decision about a child,
 * and simple mode is a grown-up's own. */
export const SIMPLE_TEXT_SCALE = 130;

export function inSimpleMode(member: { role: string; kid_view?: boolean | null; simple_mode?: boolean | null }): boolean {
  if (member.role === "child_self" && member.kid_view === true) return false;
  return member.simple_mode === true;
}

/** The text size to save when Simple Kin is turned on: at least 130%, and
 * never smaller than what the person already chose. Turning it off leaves
 * the size alone -- they may well want to keep it. */
export function simpleModeTextScale(current: number): number {
  return Math.max(SIMPLE_TEXT_SCALE, Math.round(Number(current) || 0));
}

/** Today's plans on the simple Today: things happening today that the person
 * can do something about. Not bills (money is somebody else's job on this
 * screen), not the shopping list, and not what is already done or skipped. */
export function simplePlans(brief: BriefItem[], max = 6): BriefItem[] {
  return brief.filter((b) => b.tint !== "money" && b.action !== "pay" && b.action !== "shop" && b.id !== "buy" && !b.mark).slice(0, max);
}
