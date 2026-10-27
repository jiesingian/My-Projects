"use client";

import { useCallback, useRef } from "react";

/** The class put on a form sheet's button row, so it sits pinned to the
 * bottom of the sheet (globals.css, "Pinned actions"). */
const PINNED = "kin-sheet-actions";

/** Pins a form sheet's Save / Cancel row to the bottom edge of the sheet
 * (Jonathan, 26 October: sheets of one balanced size, the buttons where the
 * thumb is, the spare room between the fields and the buttons rather than
 * hanging under them).
 *
 * Found rather than marked: some forty forms open in a sheet, and a class on
 * each would be one more thing every new form has to remember. The row is the
 * one holding the last submit button -- or, for a form saved by a plain
 * button, the last primary one. A form can name its own row instead with
 * data-sheet-actions, and opt out with data-sheet-actions="none" on the
 * sheet's content.
 *
 * Re-checked whenever the sheet's content changes shape, since a form can
 * swap its fields and its buttons (Already paid / Due later). */
export function usePinnedActions<T extends HTMLElement>() {
  // A callback ref, not an effect: a sheet's content is only in the page
  // while the sheet is open, so it comes and goes after the sheet mounts.
  const stop = useRef<(() => void) | null>(null);
  return useCallback((root: T | null) => {
    stop.current?.();
    stop.current = null;
    if (!root) return;
    let frame = 0;
    const tag = () => {
      frame = 0;
      // Off first, so the form's own layout is what findRow reads; on again
      // before anything is painted.
      root.querySelectorAll(`.${PINNED}`).forEach((el) => el.classList.remove(PINNED));
      findRow(root)?.classList.add(PINNED);
    };
    tag();
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(tag);
    });
    observer.observe(root, { childList: true, subtree: true });
    stop.current = () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
}

function findRow(root: HTMLElement): HTMLElement | null {
  if (root.querySelector('[data-sheet-actions="none"]')) return null;
  const named = root.querySelector<HTMLElement>("[data-sheet-actions]");
  if (named) return named;
  // A form's submit button, by what the browser makes of it: a <button>
  // with no type inside a form submits too. Else, for a form saved by a
  // plain button, the last primary one that is not a choice in a picker.
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.hidden && b.offsetParent !== null);
  const submits = buttons.filter((b) => b.type === "submit" && b.form);
  const primaries = [...root.querySelectorAll<HTMLElement>("button.btn-primary, a.btn-primary")].filter(
    (b) => b.offsetParent !== null && !b.closest('[role="radiogroup"], [role="group"], [aria-pressed]') && !b.hasAttribute("aria-pressed"),
  );
  const button = submits.at(-1) ?? primaries.at(-1);
  if (!button) return null;
  // The row the button shares with Cancel or Done, when it has one; the
  // button alone when it stands by itself.
  const parent = button.parentElement;
  if (!parent || parent === root || parent.tagName === "FORM") return button;
  const fields = !!parent.querySelector('input:not([type="hidden"]), select, textarea');
  // A side-by-side row of fields ending in the button -- an amount and Set
  // budget -- is left as it is. Pinned, every box above the button turns
  // into a full-height column, that row with it, and its fields stretch to
  // fill the sheet (Janine, 27 October, #1052).
  if (fields && sideBySide(parent)) return null;
  if (!fields && parent.querySelectorAll(".btn").length > 1) return parent;
  return button;
}

/** Laid out across rather than down: a flex row, or a grid of more than
 * one column. Read with the pin taken off (tag(), above), so the column the
 * pin itself makes is not mistaken for the form's own layout. */
function sideBySide(el: HTMLElement) {
  const style = getComputedStyle(el);
  if (style.display.includes("flex")) return !style.flexDirection.startsWith("column");
  if (style.display.includes("grid")) return style.gridTemplateColumns.trim().split(/\s+/).length > 1;
  return false;
}
