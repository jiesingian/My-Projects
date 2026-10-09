"use client";

import type { OfflineSnapshot, QueuedOp } from "@/lib/offline/types";
import { MAX_QUEUE, MAX_QUEUED_FILE_BYTES } from "@/lib/offline/types";

/** The phone's copy of Kin for offline use, in IndexedDB.
 *
 * ONE PERSON AT A TIME
 *
 * Everything here belongs to the one signed-in user it was saved for, and
 * the store says whose it is ("owner"). Saving for anybody else wipes it
 * first, so on a shared phone the second person to sign in never sees the
 * first person's list, even for the moment before their own arrives. The
 * sign-in screen wipes it too (components/clear-offline-cache), which covers
 * signing out, switching accounts and a session that ran out.
 *
 * No session, token or cookie is ever written here -- only what the
 * snapshot route returns (lib/offline/types lists every field), and changes
 * waiting to be sent.
 */

const DB = "kin-offline";
const VERSION = 1;
const META = "meta";
const SNAPSHOT = "snapshot";
const QUEUE = "queue";

/** Tells any open tab that the store changed, so a banner or a list can
 * update without polling. */
export const STORE_EVENT = "kin:offline-store";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexeddb"));
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(SNAPSHOT)) db.createObjectStore(SNAPSHOT);
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "seq", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const req = work(tx);
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function announce() {
  try {
    window.dispatchEvent(new Event(STORE_EVENT));
    new BroadcastChannel(STORE_EVENT).postMessage("changed");
  } catch {
    // An old browser without BroadcastChannel only misses other tabs.
  }
}

export async function getOwner(): Promise<string | null> {
  return ((await run<string>([META], "readonly", (tx) => tx.objectStore(META).get("owner")).catch(() => undefined)) ?? null) as string | null;
}

/** Saves what the server sent, for the user it was built for. Anyone else's
 * copy, and anyone else's waiting changes, go first. */
export async function saveSnapshot(snapshot: OfflineSnapshot): Promise<void> {
  const owner = await getOwner();
  await run([META, SNAPSHOT, QUEUE], "readwrite", (tx) => {
    if (owner && owner !== snapshot.userId) {
      tx.objectStore(SNAPSHOT).clear();
      tx.objectStore(QUEUE).clear();
    }
    tx.objectStore(META).put(snapshot.userId, "owner");
    tx.objectStore(SNAPSHOT).put(snapshot, "current");
  });
  announce();
}

export async function getSnapshot(): Promise<OfflineSnapshot | null> {
  const [owner, snap] = await Promise.all([
    getOwner(),
    run<OfflineSnapshot>([SNAPSHOT], "readonly", (tx) => tx.objectStore(SNAPSHOT).get("current")).catch(() => undefined),
  ]);
  // Belt and braces: a snapshot that is not the owner's is never shown.
  return snap && owner && snap.userId === owner ? snap : null;
}

/** Everything, for everyone. Signing out, and a snapshot request that finds
 * nobody signed in. */
export async function clearAll(): Promise<void> {
  await run([META, SNAPSHOT, QUEUE], "readwrite", (tx) => {
    tx.objectStore(META).clear();
    tx.objectStore(SNAPSHOT).clear();
    tx.objectStore(QUEUE).clear();
  }).catch(() => undefined);
  announce();
}

export type Queued = QueuedOp & { seq: number };

export async function listQueue(): Promise<Queued[]> {
  return ((await run<Queued[]>([QUEUE], "readonly", (tx) => tx.objectStore(QUEUE).getAll()).catch(() => undefined)) ?? []) as Queued[];
}

/** Adds a change to the end of the queue. A tick on an item that already has
 * one waiting replaces it, keeping its place: only where the item ends up
 * matters, and two ticks replayed in turn would each look like the other had
 * been overtaken (app/api/offline/replay). Returns false when the queue is
 * full, which the caller says in words. */
export async function enqueue(op: QueuedOp): Promise<boolean> {
  const waiting = await listQueue();
  if (op.kind === "buy.toggle") {
    const earlier = waiting.find((w) => w.kind === "buy.toggle" && w.itemId === op.itemId);
    if (earlier) {
      await run([QUEUE], "readwrite", (tx) => {
        tx.objectStore(QUEUE).put({ ...op, seq: earlier.seq });
      });
      announce();
      return true;
    }
  }
  if (waiting.length >= MAX_QUEUE) return false;
  const bytes = (q: QueuedOp) => (q.kind === "chat.send" ? (q.files ?? []).reduce((n, f) => n + f.size, 0) : 0);
  if (bytes(op) > 0 && waiting.reduce((n, w) => n + bytes(w), 0) + bytes(op) > MAX_QUEUED_FILE_BYTES) return false;
  await run([QUEUE], "readwrite", (tx) => {
    tx.objectStore(QUEUE).add(op);
  });
  announce();
  return true;
}

/** Rewrites one waiting change in place, keeping its place in the queue. */
export async function updateQueued(q: Queued): Promise<void> {
  await run([QUEUE], "readwrite", (tx) => {
    tx.objectStore(QUEUE).put(q);
  });
  announce();
}

export async function removeQueued(seqs: number[]): Promise<void> {
  if (seqs.length === 0) return;
  await run([QUEUE], "readwrite", (tx) => {
    for (const s of seqs) tx.objectStore(QUEUE).delete(s);
  });
  announce();
}

/** Listens for changes to the store, from this tab and any other. */
export function onStoreChange(fn: () => void): () => void {
  window.addEventListener(STORE_EVENT, fn);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(STORE_EVENT);
    channel.onmessage = fn;
  } catch {
    channel = null;
  }
  return () => {
    window.removeEventListener(STORE_EVENT, fn);
    channel?.close();
  };
}
