import type { IconName } from "@/components/icons";

/** The iPhone's Action Button and a Home Screen widget, pointed at Kin.
 *
 * A web app cannot hear a hardware button or draw a widget of its own. What an
 * iPhone can do is run a Shortcut from its Action Button, and show Shortcuts as
 * buttons in the Shortcuts app's Home Screen widget; and a Shortcut can open a
 * link. So every Kin action has a link that never changes -- /go/open,
 * /go/ask, /go/talk… -- and:
 *
 *  - the Action Button runs one Shortcut, "Kin", whose Choose from Menu step
 *    pops up a small menu of the actions the member picked here;
 *  - the widget shows a folder of one-action Shortcuts, the ones picked here.
 *
 * Each menu item and widget button is named after its action and opens that
 * action's own link, so a label can never drift from what it does. What this
 * setting stores is which actions the member wants in each, which is what the
 * setup guide in Settings walks them through adding.
 */

export type QuickActionId = "open" | "ask" | "talk" | "family-chat" | "arrived" | "buy" | "expense" | "event" | "journal" | "milestone" | "note";

export const QUICK_ACTIONS: { id: QuickActionId; name: string; path: string; kid: boolean }[] = [
  { id: "open", name: "Open Kin", path: "/today", kid: true },
  { id: "ask", name: "Chat with Kin", path: "/today?kin=chat", kid: false },
  { id: "talk", name: "Talk to Kin", path: "/today?kin=voice", kid: false },
  { id: "family-chat", name: "Family chat", path: "/chat", kid: true },
  // One press tells the household where you are (lib/arrived.ts).
  { id: "arrived", name: "I've arrived", path: "/today?arrived=1", kid: true },
  { id: "buy", name: "Shopping list", path: "/household?seg=buy", kid: false },
  { id: "expense", name: "Add an expense", path: "/wealth/transact?mode=out", kid: false },
  { id: "event", name: "Add to the calendar", path: "/planner/add", kid: false },
  { id: "journal", name: "Write in the journal", path: "/journal/new", kid: false },
  // Today's Quick add row had these two from the start (Janine, 12 and 19
  // October); since 23 October the row is picked from this list.
  { id: "milestone", name: "Add a milestone", path: "/journal/milestones/new", kid: false },
  { id: "note", name: "Write a note", path: "/notes?new=1", kid: true },
];

/** A medium Shortcuts widget holds four buttons and a large one eight. */
export const WIDGET_MAX = 8;
export const MENU_MAX = 8;
/** Today's Quick add row: four across a phone (23 October). */
export const TODAY_MAX = 4;

export type QuickPrefs = { menu: QuickActionId[]; widget: QuickActionId[]; today: QuickActionId[] };

export const QUICK_DEFAULTS: QuickPrefs = {
  menu: ["open", "ask", "talk"],
  widget: ["open", "ask", "talk", "family-chat"],
  // Milestone · Event · Expense · Note, as the row was fixed (22 October).
  today: ["milestone", "event", "expense", "note"],
};

export function isQuickAction(v: unknown): v is QuickActionId {
  return QUICK_ACTIONS.some((a) => a.id === v);
}

/** A list of actions, kept in Kin's own order with duplicates and unknowns
 * dropped, so the setup steps always read the same way round. Null when the
 * input is not a usable non-empty list. */
export function cleanActions(raw: unknown, max: number): QuickActionId[] | null {
  if (!Array.isArray(raw)) return null;
  const picked = QUICK_ACTIONS.map((a) => a.id).filter((id) => raw.includes(id));
  return picked.length > 0 && picked.length <= max ? picked : null;
}

/** The stored JSON, with anything missing or no longer offered replaced by
 * the defaults, so an old or hand-edited row still reads sensibly. */
export function readQuickPrefs(raw: unknown): QuickPrefs {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    menu: cleanActions(o.menu, MENU_MAX) ?? QUICK_DEFAULTS.menu,
    widget: cleanActions(o.widget, WIDGET_MAX) ?? QUICK_DEFAULTS.widget,
    today: cleanActions(o.today, TODAY_MAX) ?? QUICK_DEFAULTS.today,
  };
}

/** Each action's icon, on Settings and on Today's row. */
export const QUICK_ICONS: Record<QuickActionId, IconName> = {
  open: "house",
  ask: "sparkle",
  talk: "mic",
  "family-chat": "message",
  arrived: "mapPin",
  buy: "basket",
  expense: "receipt",
  event: "calendarDays",
  journal: "images",
  milestone: "star",
  note: "fileText",
};

/** Today's Quick add row (23 October, decision 4): one word a button, where
 * it opens and the tint of its icon. Event opens the event form here, as
 * the row always did; the Action Button's "Add to the calendar" keeps the
 * Add sheet. */
export function todayQuick(id: QuickActionId): { label: string; href: string; tint?: "occasion" | "schedule" | "money" | "home" } {
  const a = quickAction(id);
  switch (id) {
    case "milestone": return { label: "Milestone", href: a.path, tint: "occasion" };
    case "event": return { label: "Event", href: "/planner/add?type=event", tint: "schedule" };
    case "expense": return { label: "Expense", href: a.path, tint: "money" };
    case "note": return { label: "Note", href: a.path };
    case "buy": return { label: "To buy", href: a.path, tint: "home" };
    case "journal": return { label: "Journal", href: a.path, tint: "occasion" };
    case "arrived": return { label: "Arrived", href: a.path, tint: "schedule" };
    case "family-chat": return { label: "Chat", href: a.path };
    case "ask": return { label: "Ask Kin", href: a.path };
    case "talk": return { label: "Talk", href: a.path };
    case "open": return { label: "Open Kin", href: a.path };
  }
}

export function quickAction(id: QuickActionId) {
  return QUICK_ACTIONS.find((a) => a.id === id) ?? QUICK_ACTIONS[0];
}

/** Where /go/<name> lands. Anything that is not one of Kin's actions opens
 * Kin, and a member in kid view only gets what kid view shows. The three
 * press names from the first version of this (tap, double, hold) still
 * resolve to what they meant then, for a Shortcut already made with them. */
const LEGACY: Record<string, QuickActionId> = { tap: "open", double: "ask", hold: "talk" };

export function goPath(name: string, kid: boolean): string {
  const id = isQuickAction(name) ? name : LEGACY[name] ?? "open";
  const action = quickAction(id);
  return kid && !action.kid ? "/today" : action.path;
}
