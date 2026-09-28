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

export type QuickActionId = "open" | "ask" | "talk" | "family-chat" | "buy" | "expense" | "event" | "journal";

export const QUICK_ACTIONS: { id: QuickActionId; name: string; path: string; kid: boolean }[] = [
  { id: "open", name: "Open Kin", path: "/today", kid: true },
  { id: "ask", name: "Chat with Kin", path: "/today?kin=chat", kid: false },
  { id: "talk", name: "Talk to Kin", path: "/today?kin=voice", kid: false },
  { id: "family-chat", name: "Family chat", path: "/chat", kid: true },
  { id: "buy", name: "Shopping list", path: "/household?seg=buy", kid: false },
  { id: "expense", name: "Add an expense", path: "/wealth/transact?mode=out", kid: false },
  { id: "event", name: "Add to the calendar", path: "/planner/add", kid: false },
  { id: "journal", name: "Write in the journal", path: "/journal/new", kid: false },
];

/** A medium Shortcuts widget holds four buttons and a large one eight. */
export const WIDGET_MAX = 8;
export const MENU_MAX = 8;

export type QuickPrefs = { menu: QuickActionId[]; widget: QuickActionId[] };

export const QUICK_DEFAULTS: QuickPrefs = {
  menu: ["open", "ask", "talk"],
  widget: ["open", "ask", "talk", "family-chat"],
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
  };
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
