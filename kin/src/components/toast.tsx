"use client";

import { useEffect, useSyncExternalStore } from "react";

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

/* Timers that can be stopped and picked up again.
 *
 * A plain setTimeout runs whatever the person is doing: switch tabs for six
 * seconds and the error you had not read yet is gone when you come back,
 * and the five second one is exactly the message that mattered. Hovering to
 * read a long line has the same problem, and on a toast you dismiss by
 * clicking it, a toast that vanishes as the finger arrives leaves the click
 * to land on whatever was underneath.
 *
 * So each toast keeps the time it has left rather than a deadline, and the
 * clock stops whenever somebody is plainly still looking. */
type Countdown = { remaining: number; startedAt: number; handle: ReturnType<typeof setTimeout> | null };
const countdowns = new Map<number, Countdown>();

function resume(id: number) {
  const c = countdowns.get(id);
  if (!c || c.handle) return;
  c.startedAt = Date.now();
  c.handle = setTimeout(() => dismiss(id), c.remaining);
}

function pause(id: number) {
  const c = countdowns.get(id);
  if (!c || !c.handle) return;
  clearTimeout(c.handle);
  c.handle = null;
  c.remaining = Math.max(0, c.remaining - (Date.now() - c.startedAt));
}

function pauseAll() {
  for (const id of countdowns.keys()) pause(id);
}

function resumeAll() {
  for (const id of countdowns.keys()) resume(id);
}

function dismiss(id: number) {
  const c = countdowns.get(id);
  if (c?.handle) clearTimeout(c.handle);
  countdowns.delete(id);

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

  // Mount closed, open once the closed state has actually been painted.
  // Two frames, not one: a single requestAnimationFrame can run before the
  // browser has painted the first state, so both states land in the same
  // paint and the transition is skipped entirely -- which looks like the
  // toast simply appearing, intermittently, on faster machines.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      items = items.map((t) => (t.id === id ? { ...t, open: true } : t));
      notify();
    });
  });

  countdowns.set(id, { remaining: DURATION[kind], startedAt: 0, handle: null });
  resume(id);
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

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pauseAll();
      else resumeAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (list.length === 0) return null;

  return (
    // The live region is the stack, not each toast. A role="status" on every
    // child nests a live region inside a live region, which some screen
    // readers read twice.
    <div
      className="toast-stack"
      aria-live="polite"
      aria-atomic="false"
      onPointerEnter={pauseAll}
      onPointerLeave={resumeAll}
      onFocusCapture={pauseAll}
      onBlurCapture={resumeAll}
    >
      {list.map((t) => (
        // A button, because that is what it is: the whole surface dismisses
        // it. As a div it was unreachable by keyboard, which is worst for
        // the error toast -- the one somebody most wants to hold on to and
        // then put away.
        <button
          key={t.id}
          type="button"
          className="toast"
          data-kind={t.kind}
          data-open={t.open}
          onClick={() => dismiss(t.id)}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
