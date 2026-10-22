import { test, expect } from "@playwright/test";
import { hotkeyFor, lettersOn, shortcutList, stepIndex, G_WINDOW_MS, OVERLAY_SELECTOR, type HotkeyState } from "@/lib/hotkeys";

/** Keyboard shortcuts on a computer: which key means what, and when a key is
 * left alone (lib/hotkeys.ts). */

const ALL = ["/today", "/planner", "/chat", "/wealth", "/journal", "/family", "/household", "/settings"];
const KID = ["/today", "/chat", "/journal", "/family", "/settings"];
const s = (more: Partial<HotkeyState> = {}): HotkeyState => ({ typing: false, overlay: false, letters: true, pendingG: null, now: 10_000, places: ALL, ...more });

test("Ctrl+K and ⌘+K open Ask Kin; so does /", () => {
  expect(hotkeyFor({ key: "k", ctrlKey: true }, s())).toEqual({ kind: "search" });
  expect(hotkeyFor({ key: "K", metaKey: true }, s())).toEqual({ kind: "search" });
  expect(hotkeyFor({ key: "/" }, s())).toEqual({ kind: "search" });
});

test("? and Ctrl+/ open the list of shortcuts", () => {
  expect(hotkeyFor({ key: "?", shiftKey: true }, s())).toEqual({ kind: "help" });
  expect(hotkeyFor({ key: "/", ctrlKey: true }, s())).toEqual({ kind: "help" });
});

test("nothing fires while typing, not even Ctrl+K", () => {
  for (const key of ["/", "?", "n", "g", "ArrowDown"]) expect(hotkeyFor({ key }, s({ typing: true }))).toBeNull();
  expect(hotkeyFor({ key: "k", ctrlKey: true }, s({ typing: true }))).toBeNull();
});

test("nothing fires over an open sheet or dialog (Escape is the sheet's own)", () => {
  expect(hotkeyFor({ key: "/" }, s({ overlay: true }))).toBeNull();
  expect(hotkeyFor({ key: "k", metaKey: true }, s({ overlay: true }))).toBeNull();
  expect(hotkeyFor({ key: "Escape" }, s())).toBeNull();
});

test("the browser's and screen reader's own shortcuts are left alone", () => {
  for (const key of ["t", "l", "f", "r", "w", "n", "ArrowLeft"]) expect(hotkeyFor({ key, ctrlKey: true }, s())).toBeNull();
  expect(hotkeyFor({ key: "n", altKey: true }, s())).toBeNull();
  expect(hotkeyFor({ key: "k", ctrlKey: true, altKey: true }, s())).toBeNull();
  expect(hotkeyFor({ key: "k", ctrlKey: true, repeat: true }, s())).toBeNull();
  expect(hotkeyFor({ key: "/", defaultPrevented: true }, s())).toBeNull();
  expect(hotkeyFor({ key: "n", isComposing: true }, s())).toBeNull();
});

test("n adds; Shift+N does not", () => {
  expect(hotkeyFor({ key: "n" }, s())).toEqual({ kind: "quickAdd" });
  expect(hotkeyFor({ key: "N", shiftKey: true }, s())).toBeNull();
});

test("g then a letter goes to the place, within the window", () => {
  expect(hotkeyFor({ key: "g" }, s())).toEqual({ kind: "pending" });
  const after = (key: string, ms = 300) => hotkeyFor({ key }, s({ pendingG: 10_000 - ms }));
  expect(after("t")).toEqual({ kind: "go", href: "/today" });
  expect(after("p")).toEqual({ kind: "go", href: "/planner" });
  expect(after("c")).toEqual({ kind: "go", href: "/chat" });
  expect(after("w")).toEqual({ kind: "go", href: "/wealth" });
  expect(after("x")).toBeNull();
  // Too late: the letter means itself again.
  expect(after("n", G_WINDOW_MS + 1)).toEqual({ kind: "quickAdd" });
});

test("a child's view goes only where a child's tabs go", () => {
  const kid = (key: string) => hotkeyFor({ key }, s({ pendingG: 9_900, places: KID }));
  expect(kid("w")).toBeNull();
  expect(kid("p")).toBeNull();
  expect(kid("t")).toEqual({ kind: "go", href: "/today" });
});

test("a child's view has no n: no Planner to add to, and the list does not offer it", () => {
  expect(hotkeyFor({ key: "n" }, s({ places: KID }))).toBeNull();
  expect(shortcutList(KID, true, false).some((r) => r.keys === "n")).toBe(false);
  expect(shortcutList(ALL, true).some((r) => r.keys === "n")).toBe(true);
});

/** The shape Kin's sheets really have (Vaul over Radix): role="dialog" and
 * data-state, never aria-modal. Missing it let g then p move the page behind
 * an open sheet (wrap-up check, 22 October). */
test("an open sheet counts as open, as Radix marks it; a closing one does not", async ({ page }) => {
  const open = async (html: string) => {
    await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
    return page.evaluate((sel) => !!document.querySelector(sel), OVERLAY_SELECTOR);
  };
  expect(await open('<div role="dialog" data-state="open" aria-labelledby="t"><h2 id="t">Keyboard shortcuts</h2></div>')).toBe(true);
  expect(await open('<div role="alertdialog" data-state="open"></div>')).toBe(true);
  expect(await open('<div role="dialog" aria-modal="true"></div>')).toBe(true);
  expect(await open("<dialog open></dialog>")).toBe(true);
  expect(await open('<div role="dialog" data-state="closed"></div>')).toBe(false);
  expect(await open("<main><h1>Today</h1></main>")).toBe(false);
});

test("single-key shortcuts off: only Ctrl/⌘ ones work", () => {
  const off = s({ letters: false });
  for (const key of ["/", "?", "n", "g", "ArrowLeft"]) expect(hotkeyFor({ key }, off)).toBeNull();
  expect(hotkeyFor({ key: "k", ctrlKey: true }, off)).toEqual({ kind: "search" });
  expect(hotkeyFor({ key: "/", metaKey: true }, off)).toEqual({ kind: "help" });
});

test("arrows step, held down too, but not inside tabs, sliders or menus", () => {
  expect(hotkeyFor({ key: "ArrowRight" }, s())).toEqual({ kind: "step", dir: 1, axis: "x" });
  expect(hotkeyFor({ key: "ArrowUp", repeat: true }, s())).toEqual({ kind: "step", dir: -1, axis: "y" });
  expect(hotkeyFor({ key: "ArrowDown" }, s({ ownArrows: true }))).toBeNull();
  expect(hotkeyFor({ key: "n", repeat: true }, s())).toBeNull();
});

test("stepping stops at the ends, and starts at the near end", () => {
  expect(stepIndex(-1, 1, 5)).toBe(0);
  expect(stepIndex(-1, -1, 5)).toBe(4);
  expect(stepIndex(2, 1, 5)).toBe(3);
  expect(stepIndex(4, 1, 5)).toBe(4);
  expect(stepIndex(0, -1, 5)).toBe(0);
  expect(stepIndex(0, 1, 0)).toBe(-1);
});

test("single-key shortcuts start off in Simple Kin; a saved choice wins", () => {
  expect(lettersOn(null, false)).toBe(true);
  expect(lettersOn(null, true)).toBe(false);
  expect(lettersOn("on", true)).toBe(true);
  expect(lettersOn("off", false)).toBe(false);
});

test("the help list shows only what works for this person", () => {
  const kid = shortcutList(KID, true).map((r) => r.what);
  expect(kid).toContain("Go to Today");
  expect(kid).not.toContain("Go to Wealth");
  expect(shortcutList(KID, true, false).map((r) => r.what)).not.toContain("Ask Kin (search)");
  const off = shortcutList(ALL, false).map((r) => r.keys);
  expect(off).not.toContain("n");
  expect(off).toContain("Esc");
});
