/** Typhoon mode (20261029150000_typhoon_ready.sql): what a household gets
 * ready when a storm or a long brownout is coming. Pure, so the page, Today
 * and the logic spec share it. */

/** The go-bag and house list a household starts from, in the order it is
 * usually done: water and food, light and power, health and papers, the
 * house. A household adds its own and removes what doesn't apply. */
export const READY_DEFAULTS = [
  "Drinking water for 3 days",
  "Canned food and a can opener",
  "Flashlights and spare batteries",
  "Power banks charged",
  "Phones charged and with load",
  "Medicines for a week",
  "First aid kit",
  "IDs and papers in a waterproof bag",
  "Some cash in small bills",
  "Battery radio",
  "Candles and matches",
  "Bring in what the wind can take",
] as const;

export type ReadyItem = { id: string; label: string; done_at: string | null };

/** "7 of 12 ready", and whether everything is. */
export function readyProgress(items: ReadyItem[]): { done: number; total: number; line: string; all: boolean } {
  const total = items.length;
  const done = items.filter((i) => i.done_at).length;
  return { done, total, all: total > 0 && done === total, line: total === 0 ? "Start the checklist" : `${done} of ${total} ready` };
}

/** A label as the database keeps it: spaces collapsed, 1 to 80 characters. */
export function cleanReadyLabel(raw: string): string | null {
  const s = raw.replace(/\s+/g, " ").trim();
  return s && s.length <= 80 ? s : null;
}
