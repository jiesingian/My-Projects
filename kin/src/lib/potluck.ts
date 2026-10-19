/** Potluck on an event (20261019233100_event_potluck.sql): who brings what.
 * Pure, so the event screen, the relatives' list and the logic tests read
 * the same rules the database keeps (potluck_claims_fill). */

export const POTLUCK_LABEL_MAX = 80;
export const POTLUCK_WANTED_MAX = 50;

export type PotluckItemRow = { id: string; label: string; wanted: number; position: number };
export type PotluckClaimRow = { id: string; item_id: string; member_id: string; member_name: string; household_name: string; family_id: string; qty: number };

export type PotluckLine = {
  id: string;
  label: string;
  wanted: number;
  taken: number;
  left: number;
  /** The viewer's own claim on it, if any. */
  mine: { id: string; qty: number } | null;
  /** Who is bringing it: first names, and the household when it is not the
   * viewer's own ("Ben · House B"). */
  bringers: { id: string; name: string; qty: number }[];
};

/** The list as the event screen shows it, in the host's order. */
export function potluckLines(items: PotluckItemRow[], claims: PotluckClaimRow[], me: { id: string; familyId: string }): PotluckLine[] {
  return [...items]
    .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
    .map((item) => {
      const on = claims.filter((c) => c.item_id === item.id);
      const taken = on.reduce((n, c) => n + c.qty, 0);
      const mine = on.find((c) => c.member_id === me.id);
      return {
        id: item.id,
        label: item.label,
        wanted: item.wanted,
        taken,
        left: Math.max(0, item.wanted - taken),
        mine: mine ? { id: mine.id, qty: mine.qty } : null,
        bringers: on.map((c) => ({
          id: c.id,
          name: c.member_id === me.id ? "You" : `${firstName(c.member_name)}${c.family_id !== me.familyId && c.household_name ? ` · ${c.household_name}` : ""}`,
          qty: c.qty,
        })),
      };
    });
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "Someone";
}

/** The most the viewer may set their claim to: what is left, plus what they
 * already hold. */
export function claimLimit(line: Pick<PotluckLine, "left" | "mine">): number {
  return line.left + (line.mine?.qty ?? 0);
}

/** One line for the whole list: "3 of 5 covered" -- items fully claimed. */
export function potluckSummary(lines: PotluckLine[]): string {
  if (lines.length === 0) return "Nothing listed yet";
  const covered = lines.filter((l) => l.left === 0).length;
  return covered === lines.length ? "Everything is covered" : `${covered} of ${lines.length} covered`;
}

/** "Pancit x2", "Ice ×3" or "2 Lumpia trays" typed into one box: the label
 * and how many are wanted (1 when it doesn't say). */
export function parsePotluckItem(text: string): { label: string; wanted: number } | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return null;
  let label = t;
  let wanted = 1;
  const after = /^(.*?)\s*[x×]\s*(\d{1,2})$/i.exec(t);
  const before = /^(\d{1,2})\s+(.+)$/.exec(t);
  if (after && after[1]) {
    label = after[1];
    wanted = Number(after[2]);
  } else if (before) {
    label = before[2];
    wanted = Number(before[1]);
  }
  label = label.slice(0, POTLUCK_LABEL_MAX).trim();
  if (!label) return null;
  return { label, wanted: Math.min(POTLUCK_WANTED_MAX, Math.max(1, wanted)) };
}
