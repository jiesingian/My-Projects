"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tints the confirm button the same way every hand-rolled destructive
   * button in this app already does -- accent-700, not a separate red the
   * design has never used. */
  danger?: boolean;
};

type ConfirmRequest = ConfirmOptions & { resolve: (value: boolean) => void };

// A single module-level slot rather than a queue: only one question is ever
// on screen, the same way only one native confirm() can be. Asking a second
// one while the first is open answers the first "no" and replaces it, which
// is what opening a second native confirm would have done anyway.
let current: ConfirmRequest | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

/** A drop-in, animated replacement for `window.confirm`. A call site only
 * has to add `await`:
 *
 *   if (!window.confirm("Remove this?")) return;
 *   if (!(await confirm("Remove this?"))) return;
 *
 * Renders through the single <ConfirmSheetHost /> mounted at the app shell,
 * so nothing here touches the DOM directly. */
export function confirm(options: string | ConfirmOptions): Promise<boolean> {
  const opts = typeof options === "string" ? { title: options } : options;
  return new Promise((resolve) => {
    current?.resolve(false);
    current = { ...opts, resolve };
    notify();
  });
}

/** Mounted once, at the app shell. Owns the one confirm sheet the whole app
 * shares.
 *
 * `visible` stays mounted a beat after `request` clears, so the close
 * transition can play -- the gap `sheet.tsx`'s `{open && (...)}` leaves,
 * which is why nothing built on it has ever had an exit animation. It's kept
 * in sync with `request` by comparing during render and adjusting on the
 * spot (React's own pattern for deriving state from a changing value:
 * https://react.dev/reference/react/useState#storing-information-from-previous-renders)
 * rather than an effect, since `request` can go back to null before the
 * close transition should discard `visible`.
 *
 * `open` is only the transition's target, one frame behind on the way in so
 * the panel has a closed position to animate from. */
export function ConfirmSheetHost() {
  const request = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState<ConfirmRequest | null>(null);
  const [trackedRequest, setTrackedRequest] = useState<ConfirmRequest | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  if (request !== trackedRequest) {
    setTrackedRequest(request);
    if (request) setVisible(request);
  }

  const answer = useCallback((value: boolean) => {
    current?.resolve(value);
    current = null;
    setOpen(false);
    restoreFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (!request) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    // Mount closed, then open on the next frame -- the same trick every
    // CSS-transition entrance in this file needs, since there is no
    // @starting-style equivalent for an element that was already in the DOM.
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, [request]);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [visible, answer]);

  if (!visible) return null;

  const titleId = "confirm-sheet-title";
  const descId = "confirm-sheet-description";

  return (
    <div
      className="confirm-backdrop"
      data-open={open}
      onClick={() => answer(false)}
      style={{ position: "fixed", inset: 0, zIndex: 70, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={visible.description ? descId : undefined}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && !open) setVisible(null);
        }}
        className="confirm-panel kin-glass-bar"
        data-open={open}
      >
        <div className="confirm-grabber" />
        <p id={titleId} className="confirm-title">
          {visible.title}
        </p>
        {visible.description && (
          <p id={descId} className="confirm-description">
            {visible.description}
          </p>
        )}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-secondary btn-block" onClick={() => answer(false)}>
            {visible.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={visible.danger ? { background: "var(--color-accent-700)", boxShadow: "none" } : undefined}
            onClick={() => answer(true)}
          >
            {visible.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
