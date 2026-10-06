"use client";

import { useEffect, useState } from "react";
import { enqueue, getOwner, listQueue, onStoreChange, type Queued } from "@/lib/offline/store";
import type { QueuedOp } from "@/lib/offline/types";

/** The live pages' way into the offline queue (Today, the shopping list, the
 * household chat).
 *
 * The saved copy (app/offline) queues its four changes; since 6 October the
 * live pages queue the same four, into the same queue, so a tap made after
 * the signal dropped is kept rather than lost. OfflineSync sends the queue
 * on reconnect through app/api/offline/replay, which applies the conflict
 * rules written there -- nothing here decides who wins.
 *
 * A change is queued only when it cannot be sent now: the phone says it is
 * offline, or the call to the server failed at the network. Online, the page
 * calls its action as it always did.
 *
 * And only when this phone holds a saved copy: the queue is replayed as the
 * copy's owner, so without one there is nobody to send it as. That happens
 * only before Kin has ever finished loading online on this phone. */

/** Whether the phone knows it has no network. True is reliable; false only
 * means a network, not a working one (see isNetworkFailure). */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** A server action that never reached the server throws a TypeError ("Failed
 * to fetch", "Load failed" on iPhone, "NetworkError ..." in Firefox) rather
 * than returning an error of its own. */
export function isNetworkFailure(e: unknown): boolean {
  return isOffline() || e instanceof TypeError || /failed to fetch|load failed|networkerror|network request failed/i.test(String(e));
}

export function newOpId(): string {
  return crypto.randomUUID();
}

/** Puts a change in the queue. Returns what to tell the person: null when it
 * is waiting, or why it could not be kept. */
export async function queueOffline(op: QueuedOp): Promise<string | null> {
  try {
    if (!(await getOwner())) return "You're offline, and this phone has no saved copy of Kin yet, so this can't wait. Try again with a signal.";
    return (await enqueue(op)) ? null : "Too many changes are waiting to send. Try again once you're back online.";
  } catch {
    return "You're offline, and this change couldn't be kept on the phone.";
  }
}

/** What is waiting to send, kept current as it changes in this tab or any
 * other -- so a page can show a queued tick, a queued "Done" and a queued
 * message, and drop each as the replay settles it. */
export function useQueue(): Queued[] {
  const [queue, setQueue] = useState<Queued[]>([]);
  useEffect(() => {
    let live = true;
    const read = () => void listQueue().then((q) => live && setQueue(q)).catch(() => undefined);
    read();
    const stop = onStoreChange(read);
    return () => {
      live = false;
      stop();
    };
  }, []);
  return queue;
}
