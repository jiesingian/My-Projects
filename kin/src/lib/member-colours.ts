/** The six member colours, and how a member gets one before they pick.
 *
 * Pure module: no server imports, so a client component can hold the
 * palette without dragging Supabase into the browser bundle. */

export const MEMBER_COLOURS = ["coral", "amber", "teal", "indigo", "violet", "moss"] as const;
export type MemberColour = (typeof MEMBER_COLOURS)[number];

export const MEMBER_COLOUR_LABEL: Record<MemberColour, string> = {
  coral: "Coral",
  amber: "Amber",
  teal: "Teal",
  indigo: "Indigo",
  violet: "Violet",
  moss: "Moss",
};

export function isMemberColour(value: string): value is MemberColour {
  return (MEMBER_COLOURS as readonly string[]).includes(value);
}

/** A stable colour for somebody who has never chosen one.
 *
 * Derived from the member id rather than from their position in the
 * household, because a list position moves the day somebody joins or
 * leaves, and a colour that silently swaps between two children is worse
 * than no colour at all. The id never changes, so neither does this.
 *
 * Two members can land on the same colour. That is accepted rather than
 * worked around: their names are shown beside the swatch everywhere it
 * appears, and anybody who minds can pick a different one. */
export function fallbackColour(memberId: string): MemberColour {
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
  }
  return MEMBER_COLOURS[hash % MEMBER_COLOURS.length];
}

export function memberColour(memberId: string, chosen: string | null | undefined): MemberColour {
  return chosen && isMemberColour(chosen) ? chosen : fallbackColour(memberId);
}

/** The CSS variable, ready to drop into a style prop. */
export function memberColourVar(memberId: string, chosen: string | null | undefined): string {
  return `var(--member-${memberColour(memberId, chosen)})`;
}
