"use client";

import { useSyncExternalStore } from "react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string; open: boolean };

// Same shape as confirm-sheet.tsx's module-level store: state that belongs
// to the whole app, not one component, so it lives outside React and
// components subscribe to it rather than owning a copy of it.
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return items;
}

const DURATION: Record<ToastKind, number> = { success: 3000, error: 5000, info: 3500 };
// Matches the CSS transition below -- kept as one number instead of two so
// they can't drift apart.
const EXIT_MS = 200;

function dismiss(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, open: false } : t));
  notify();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    notify();
  }, EXIT_MS);
}

function push(kind: ToastKind, message: string) {
  const id = nextId++;
  items = [...items, { id, kind, message, open: false }];
  notify();
  // Mount closed, open on the next frame -- the same reason every sheet in
  // this app does it: a transition needs a painted "before" value to
  // animate away from.
  requestAnimationFrame(() => {
    items = items.map((t) => (t.id === id ? { ...t, open: true } : t));
    notify();
  });
  setTimeout(() => dismiss(id), DURATION[kind]);
  return id;
}

/** A drop-in replacement for `window.alert()` that doesn't block the page,
 * stacks instead of queuing, and matches the rest of the app instead of the
 * browser chrome. */
export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
  dismiss,
};

/** Mounted once, at the app shell. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, getSnapshot, () => []);
  if (list.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {list.map((t) => (
        <div key={t.id} role="status" className="toast" data-kind={t.kind} data-open={t.open} onClick={() => dismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
