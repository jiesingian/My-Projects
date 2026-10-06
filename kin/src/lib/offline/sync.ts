"use client";

import { clearAll, getOwner, listQueue, removeQueued, saveSnapshot } from "@/lib/offline/store";
import { SNAPSHOT_VERSION, type OfflineSnapshot, type ReplayResult } from "@/lib/offline/types";

/** Talking to the server on offline Kin's behalf: fetching the snapshot, and
 * sending the queue. */

export type SyncSummary = { applied: number; skipped: string[]; remaining: number };

/** Signed out, as far as a fetch can tell: a 401 from the route, or the
 * proxy's redirect to /login (lib/supabase/middleware) followed to a page. */
const signedOut = (res: Response) => res.status === 401 || (res.redirected && new URL(res.url).pathname.startsWith("/login"));

/** Fetches and stores the latest snapshot. Returns false when it could not
 * (offline, a server error), which leaves the saved one as it was. */
export async function refreshSnapshot(): Promise<boolean> {
  try {
    const res = await fetch("/api/offline/snapshot", { cache: "no-store", credentials: "same-origin" });
    if (signedOut(res)) {
      // Nobody is signed in, so nothing on this phone is anybody's to read.
      await clearAll();
      return false;
    }
    if (!res.ok) return false;
    const snap = (await res.json()) as OfflineSnapshot;
    if (snap.version !== SNAPSHOT_VERSION || !snap.userId) return false;
    await saveSnapshot(snap);
    return true;
  } catch {
    return false;
  }
}

/** Runs `work` in one tab at a time. Two tabs coming back online together
 * would otherwise both send the same queue -- harmless, since every change
 * carries its own id, but it doubles the traffic and the "saved" messages. */
async function exclusively<T>(work: () => Promise<T>): Promise<T | null> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks) return work();
  return locks.request("kin-offline-replay", { ifAvailable: true }, async (lock) => (lock ? work() : null));
}

/** Sends everything waiting, in order, and forgets what the server settled.
 * Null when there was nothing to send or another tab is already sending. */
export async function replayQueue(): Promise<SyncSummary | null> {
  return exclusively(async () => {
    const [owner, queue] = await Promise.all([getOwner(), listQueue()]);
    if (!owner || queue.length === 0) return null;
    let res: Response;
    try {
      res = await fetch("/api/offline/replay", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: owner, ops: queue.map((q) => ({ ...q, seq: undefined })) }),
      });
    } catch {
      return { applied: 0, skipped: [], remaining: queue.length };
    }
    // Signed out, or someone else is signed in: these changes are not theirs
    // to send. They stay until the sign-in screen clears the phone.
    if (signedOut(res) || res.status === 409 || !res.ok) return { applied: 0, skipped: [], remaining: queue.length };
    const { results } = (await res.json().catch(() => ({ results: [] }))) as { results: ReplayResult[] };
    const byId = new Map(results.map((r) => [r.id, r]));
    const settled = queue.filter((q) => {
      const r = byId.get(q.id);
      return r && r.outcome !== "retry";
    });
    await removeQueued(settled.map((q) => q.seq));
    return {
      applied: results.filter((r) => r.outcome === "applied").length,
      skipped: results.filter((r) => r.outcome === "skipped").map((r) => r.note ?? "One change was not saved."),
      remaining: queue.length - settled.length,
    };
  });
}

/** In words, for the toast that follows a sync. */
export function describeSync(s: SyncSummary): { kind: "success" | "info"; message: string } | null {
  if (s.applied === 0 && s.skipped.length === 0) return null;
  const saved = s.applied > 0 ? `Back online · ${s.applied} change${s.applied === 1 ? "" : "s"} saved` : "Back online";
  if (s.skipped.length === 0) return { kind: "success", message: `${saved}.` };
  return { kind: "info", message: `${saved}. ${s.skipped.slice(0, 2).join(" ")}${s.skipped.length > 2 ? ` And ${s.skipped.length - 2} more.` : ""}` };
}
