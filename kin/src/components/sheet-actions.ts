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
  const last = <E extends Element>(list: NodeListOf<E>) => (list.length ? list[list.length - 1] : null);
  const button =
    last(root.querySelectorAll<HTMLElement>('button[type="submit"]:not([hidden])')) ??
    last(root.querySelectorAll<HTMLElement>("button.btn-primary, a.btn-primary"));
  if (!button) return null;
  // The row the button shares with Cancel or Done, when it has one; the
  // button alone when it stands by itself.
  const parent = button.parentElement;
  if (parent && parent !== root && parent.tagName !== "FORM" && parent.querySelectorAll(".btn").length > 1) return parent;
  return button;
}
