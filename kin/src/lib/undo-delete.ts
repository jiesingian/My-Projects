"use client";

import { useSyncExternalStore } from "react";
import { toast } from "@/components/toast";

/** Delete with Undo (final design check, 22 October; ISO 9241-110 error
 * tolerance). The row leaves the list at once, a toast offers Undo for a few
 * seconds, and only when that passes does the real delete run. No soft
 * delete in the database: nothing is deleted until the person has had their
 * chance to take it back. Undo, or a delete that fails, brings the row back.
 *
 * `hidden` is every id waiting on its toast, or already deleted and waiting
 * on the refresh that drops it from the list. */
const hidden = new Set<string>();
let snapshot: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const EMPTY: ReadonlySet<string> = new Set();

function set(id: string, on: boolean) {
  if (on) hidden.add(id);
  else hidden.delete(id);
  snapshot = new Set(hidden);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The ids a list should leave out right now. */
export function useHiddenRows(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}

/** Whether a list should leave `id` out: useHiddenRows outside React (the
 * logic tests use it). */
export function isHidden(id: string): boolean {
  return hidden.has(id);
}

/** Hide `id`, offer Undo, and run `remove` once the chance has passed.
 * Returns the toast's id. */
export function deleteWithUndo({
  id,
  message,
  remove,
  onDeleted,
}: {
  id: string;
  message: string;
  remove: () => Promise<{ error: string | null } | void>;
  onDeleted?: () => void;
}) {
  set(id, true);
  return toast.undo(message, {
    onUndo: () => set(id, false),
    onExpire: async () => {
      let error: string | null = null;
      try {
        const r = await remove();
        error = r ? r.error : null;
      } catch {
        // A thrown failure (offline, the server action itself failing) as
        // well as a returned one: the row comes back either way.
        error = "Kin couldn't delete that just now. It's back on the list; try again in a minute.";
      }
      if (error) {
        set(id, false);
        toast.error(error);
        return;
      }
      onDeleted?.();
      // Deleted: the refresh drops the row; let go of its id once it has,
      // so the set does not grow all session.
      setTimeout(() => set(id, false), 10_000);
    },
  });
}
