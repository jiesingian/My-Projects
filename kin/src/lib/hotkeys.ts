/** Keyboard shortcuts on a computer (final design check, 22 October). Only
 * the deciding lives here -- which key means what, and when a key is left
 * alone -- so it can be tested without a browser; components/keyboard-
 * shortcuts.tsx listens and acts.
 *
 * Rules that keep them out of the way:
 * - Never while typing: an input, a textarea, a select or anything
 *   contenteditable keeps every key, Ctrl/⌘+K included.
 * - Never over a sheet or dialog: it has its own keys (Escape closes it,
 *   Radix already does that) and a shortcut must not act on the page behind.
 * - Never with Alt, and never with Ctrl/⌘ except Ctrl/⌘+K and Ctrl/⌘+/:
 *   the browser's and the screen reader's own shortcuts use those. A screen
 *   reader in browse mode takes single letters itself before the page sees
 *   them, so letters here do not fight its quick navigation.
 * - Single-key shortcuts (/, ?, n, g then a letter, arrows) can be turned
 *   off (WCAG 2.2, 2.1.4 Character Key Shortcuts), and start off in Simple
 *   Kin, where a stray key press moving the page is the last thing anyone
 *   needs. Ctrl/⌘+K and Ctrl/⌘+/ always work. */

export type HotkeyAction =
  | { kind: "search" }
  | { kind: "help" }
  | { kind: "quickAdd" }
  | { kind: "go"; href: string }
  | { kind: "step"; dir: -1 | 1; axis: "x" | "y" }
  | { kind: "pending" };

export type KeyLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
};

export type HotkeyState = {
  /** The target is a field the person is typing in. */
  typing: boolean;
  /** A sheet or dialog is open. */
  overlay: boolean;
  /** The target already uses the arrow keys (tabs, a slider, a menu, a
   * grid); arrows are left to it. */
  ownArrows?: boolean;
  /** Single-key shortcuts are on. */
  letters: boolean;
  /** When "g" was pressed, if it was, and still waiting for its letter. */
  pendingG: number | null;
  now: number;
  /** Which places this person has (a child's view has fewer). */
  places: readonly string[];
};

/** How long "g" waits for its second letter. */
export const G_WINDOW_MS = 1200;

/** g then a letter: the places, by the first letter of their tab. */
export const GO_KEYS: Record<string, string> = {
  t: "/today",
  p: "/planner",
  c: "/chat",
  w: "/wealth",
  j: "/journal",
  f: "/family",
  h: "/household",
  s: "/settings",
};

/** What a key means, or null to leave it alone. */
export function hotkeyFor(e: KeyLike, s: HotkeyState): HotkeyAction | null {
  if (e.defaultPrevented || e.isComposing || s.typing || s.overlay || e.altKey) return null;
  const mod = !!(e.ctrlKey || e.metaKey);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (e.repeat) return null;
    if (key === "k") return { kind: "search" };
    if (key === "/") return { kind: "help" };
    return null;
  }
  if (!s.letters) return null;
  if (s.pendingG !== null && s.now - s.pendingG <= G_WINDOW_MS && key.length === 1) {
    const href = GO_KEYS[key];
    return href && s.places.includes(href) ? { kind: "go", href } : null;
  }
  if (e.repeat) return key.startsWith("Arrow") ? arrow(key, s) : null;
  if (key === "/") return { kind: "search" };
  if (key === "?") return { kind: "help" };
  if (key === "n" && !e.shiftKey) return { kind: "quickAdd" };
  if (key === "g" && !e.shiftKey) return { kind: "pending" };
  return arrow(key, s);
}

function arrow(key: string, s: HotkeyState): HotkeyAction | null {
  if (s.ownArrows) return null;
  if (key === "ArrowLeft") return { kind: "step", dir: -1, axis: "x" };
  if (key === "ArrowRight") return { kind: "step", dir: 1, axis: "x" };
  if (key === "ArrowUp") return { kind: "step", dir: -1, axis: "y" };
  if (key === "ArrowDown") return { kind: "step", dir: 1, axis: "y" };
  return null;
}

/** The next index when stepping through `count` items from `from` (-1: none
 * focused yet). Stops at the ends rather than wrapping: a list that jumps
 * from the last item back to the first is easy to get lost in. */
export function stepIndex(from: number, dir: -1 | 1, count: number): number {
  if (count <= 0) return -1;
  if (from < 0) return dir === 1 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, from + dir));
}

/** Whether single-key shortcuts start on: on, except in Simple Kin. A choice
 * the person made on this computer wins either way. */
export function lettersOn(saved: string | null, simple: boolean): boolean {
  if (saved === "on") return true;
  if (saved === "off") return false;
  return !simple;
}

export const LETTERS_KEY = "kin-shortcut-letters";

/** The list the help sheet shows, in the order it shows them. */
export function shortcutList(places: readonly string[], letters: boolean, ask = true): { keys: string; what: string }[] {
  const names: Record<string, string> = { "/today": "Today", "/planner": "Planner", "/chat": "Chat", "/wealth": "Wealth", "/journal": "Journal", "/family": "Family", "/household": "Household", "/settings": "Settings" };
  const always = [
    ...(ask ? [{ keys: "Ctrl K  or  ⌘ K", what: "Ask Kin (search)" }] : []),
    { keys: "Ctrl /  or  ⌘ /", what: "This list" },
    { keys: "Esc", what: "Close a sheet or dialog" },
    { keys: "Enter", what: "Send, in a chat (Shift Enter for a new line)" },
  ];
  if (!letters) return always;
  const go = Object.entries(GO_KEYS)
    .filter(([, href]) => places.includes(href))
    .map(([k, href]) => ({ keys: `g then ${k}`, what: `Go to ${names[href]}` }));
  return [
    ...(ask ? [{ keys: "/", what: "Ask Kin (search)" }] : []),
    { keys: "?", what: "This list" },
    { keys: "n", what: "Add something" },
    ...go,
    { keys: "← →", what: "Previous or next day, in the Planner" },
    { keys: "↑ ↓", what: "Move through a list" },
    ...always,
  ];
}
