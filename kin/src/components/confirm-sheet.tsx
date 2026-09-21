"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { AnimatedSheet } from "@/components/animated-sheet";

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
 * `visible` needs to outlive `request` by one closing transition, so it's
 * kept in sync by comparing during render and adjusting on the spot --
 * React's own pattern for deriving state from a changing value
 * (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
 * -- rather than an effect, since `request` can go back to null before the
 * close transition should discard what's on screen. `<AnimatedSheet>` still
 * owns the transition itself; this only has to keep describing what to
 * render while it plays. */
export function ConfirmSheetHost() {
  const request = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [visible, setVisible] = useState<ConfirmRequest | null>(null);
  const [trackedRequest, setTrackedRequest] = useState<ConfirmRequest | null>(null);

  if (request !== trackedRequest) {
    setTrackedRequest(request);
    if (request) setVisible(request);
  }

  const close = useCallback((value: boolean) => {
    current?.resolve(value);
    current = null;
    notify();
  }, []);

  if (!visible) return null;

  const titleId = "confirm-sheet-title";
  const descId = "confirm-sheet-description";

  return (
    <AnimatedSheet
      open={!!request}
      onClose={() => close(false)}
      role="alertdialog"
      labelledBy={titleId}
      describedBy={visible.description ? descId : undefined}
      panelClassName="sheet-panel--confirm"
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
        <button type="button" className="btn btn-secondary btn-block" autoFocus onClick={() => close(false)}>
          {visible.cancelLabel ?? "Cancel"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={visible.danger ? { background: "var(--color-accent-700)", boxShadow: "none" } : undefined}
          onClick={() => close(true)}
        >
          {visible.confirmLabel ?? "Confirm"}
        </button>
      </div>
    </AnimatedSheet>
  );
}
