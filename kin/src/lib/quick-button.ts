/** The phone's own button, pointed at Kin.
 *
 * A web app cannot hear a hardware button. What an iPhone can do is run a
 * Shortcut from its Action Button or from Back Tap (a double or triple tap on
 * the back of the phone), and a Shortcut can open a link. So Kin gives each
 * member three links that never change -- /go/tap, /go/double, /go/hold -- and
 * this setting decides where each one lands. The Shortcut is set up once;
 * changing what a press does afterwards is a choice in Settings, not a trip
 * back into the Shortcuts app.
 */

export const QUICK_SLOTS = ["tap", "double", "hold"] as const;
export type QuickSlot = (typeof QUICK_SLOTS)[number];

export const QUICK_SLOT_NAMES: Record<QuickSlot, string> = {
  tap: "Tap",
  double: "Double tap",
  hold: "Long press",
};

export type QuickActionId = "open" | "ask" | "talk" | "family-chat" | "expense" | "buy" | "event" | "journal";

export const QUICK_ACTIONS: { id: QuickActionId; name: string; path: string; kid: boolean }[] = [
  { id: "open", name: "Open Kin", path: "/today", kid: true },
  { id: "ask", name: "Chat with Kin", path: "/today?kin=chat", kid: false },
  { id: "talk", name: "Talk to Kin (voice)", path: "/today?kin=voice", kid: false },
  { id: "family-chat", name: "Family chat", path: "/chat", kid: true },
  { id: "buy", name: "Shopping list", path: "/household?seg=buy", kid: false },
  { id: "expense", name: "Add an expense", path: "/wealth/transact?mode=out", kid: false },
  { id: "event", name: "Add to the calendar", path: "/planner/add", kid: false },
  { id: "journal", name: "Write in the journal", path: "/journal/new", kid: false },
];

/** Which physical button the member uses. It only changes the setup steps
 * Settings shows; the three links are the same whichever it is. */
export type QuickButton = "action" | "backtap" | "android";

export const QUICK_BUTTONS: { id: QuickButton; name: string; line: string }[] = [
  { id: "action", name: "Action Button", line: "iPhone 15 Pro and later, with Back Tap for the other two" },
  { id: "backtap", name: "Back Tap", line: "Any iPhone 8 or later: tap the back of the phone" },
  { id: "android", name: "Android", line: "The home-screen icon and the side key" },
];

export type QuickPrefs = { button: QuickButton } & Record<QuickSlot, QuickActionId>;

export const QUICK_DEFAULTS: QuickPrefs = { button: "action", tap: "open", double: "ask", hold: "talk" };

export function isQuickAction(v: unknown): v is QuickActionId {
  return QUICK_ACTIONS.some((a) => a.id === v);
}

export function isQuickButton(v: unknown): v is QuickButton {
  return QUICK_BUTTONS.some((b) => b.id === v);
}

export function isQuickSlot(v: unknown): v is QuickSlot {
  return (QUICK_SLOTS as readonly unknown[]).includes(v);
}

/** The stored JSON, with anything missing or no longer offered replaced by
 * its default, so an old or hand-edited row still opens somewhere sensible. */
export function readQuickPrefs(raw: unknown): QuickPrefs {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    button: isQuickButton(o.button) ? o.button : QUICK_DEFAULTS.button,
    tap: isQuickAction(o.tap) ? o.tap : QUICK_DEFAULTS.tap,
    double: isQuickAction(o.double) ? o.double : QUICK_DEFAULTS.double,
    hold: isQuickAction(o.hold) ? o.hold : QUICK_DEFAULTS.hold,
  };
}

/** Where one press lands. A member in kid view only gets what kid view
 * shows; anything else opens Kin. */
export function quickPath(prefs: QuickPrefs, slot: QuickSlot, kid: boolean): string {
  const action = QUICK_ACTIONS.find((a) => a.id === prefs[slot]) ?? QUICK_ACTIONS[0];
  return kid && !action.kid ? "/today" : action.path;
}

export function quickActionName(id: QuickActionId): string {
  return QUICK_ACTIONS.find((a) => a.id === id)?.name ?? "Open Kin";
}

/** Which phone gesture runs which link, for the setup steps. Null where that
 * button has no gesture to give: Back Tap has two, not three. */
export function gestureFor(button: QuickButton, slot: QuickSlot): string | null {
  if (button === "action") return { tap: "Action Button", double: "Back Tap · Double Tap", hold: "Back Tap · Triple Tap" }[slot];
  if (button === "backtap") return { tap: "Back Tap · Double Tap", double: "Back Tap · Triple Tap", hold: null }[slot];
  return null;
}
