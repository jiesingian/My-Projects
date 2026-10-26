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
      const row = findRow(root);
      root.querySelectorAll(`.${PINNED}`).forEach((el) => {
        if (el !== row) el.classList.remove(PINNED);
      });
      row?.classList.add(PINNED);
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
  // button alone when it stands by itself. A row with fields in it is part
  // of the form, not its buttons.
  const parent = button.parentElement;
  if (
    parent &&
    parent !== root &&
    parent.tagName !== "FORM" &&
    parent.querySelectorAll(".btn").length > 1 &&
    !parent.querySelector('input:not([type="hidden"]), select, textarea')
  )
    return parent;
  return button;
}
