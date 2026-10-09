"use client";

import { clearAll, getOwner, listQueue, removeQueued, saveSnapshot, updateQueued, type Queued } from "@/lib/offline/store";
import { uploadFileDirect } from "@/lib/upload-client";
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
    const [owner, waiting] = await Promise.all([getOwner(), listQueue()]);
    if (!owner || waiting.length === 0) return null;
    const files = await uploadQueuedFiles(waiting);
    const queue = files.ready;
    const held = waiting.length - queue.length - files.refused.length;
    if (queue.length === 0) return { applied: 0, skipped: files.notes, remaining: held };
    let res: Response;
    try {
      res = await fetch("/api/offline/replay", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: owner, ops: queue.map((q) => ({ ...q, seq: undefined, files: undefined })) }),
      });
    } catch {
      return { applied: 0, skipped: files.notes, remaining: queue.length + held };
    }
    // Signed out, or someone else is signed in: these changes are not theirs
    // to send. They stay until the sign-in screen clears the phone.
    if (signedOut(res) || res.status === 409 || !res.ok) return { applied: 0, skipped: files.notes, remaining: queue.length + held };
    const { results } = (await res.json().catch(() => ({ results: [] }))) as { results: ReplayResult[] };
    const byId = new Map(results.map((r) => [r.id, r]));
    const settled = queue.filter((q) => {
      const r = byId.get(q.id);
      return r && r.outcome !== "retry";
    });
    await removeQueued(settled.map((q) => q.seq));
    return {
      applied: results.filter((r) => r.outcome === "applied").length,
      skipped: [...files.notes, ...results.filter((r) => r.outcome === "skipped").map((r) => r.note ?? "One change was not saved.")],
      remaining: queue.length - settled.length + held,
    };
  });
}

/** Uploads the files of messages written offline, in queue order, before
 * anything is sent. Returns the changes ready to send: everything up to the
 * first message whose files could not go up for want of a signal -- that one
 * and everything after it wait, so a later message never overtakes it.
 * A file Storage refuses (too big, the household's space full) cannot pass
 * on a retry either; that message is taken out and said in words, rather
 * than holding the whole queue behind it for ever. */
async function uploadQueuedFiles(queue: Queued[]): Promise<{ ready: Queued[]; refused: Queued[]; notes: string[] }> {
  const ready: Queued[] = [];
  const refused: Queued[] = [];
  const notes: string[] = [];
  for (const q of queue) {
    if (q.kind !== "chat.send" || !q.files?.length || q.uploaded) {
      ready.push(q);
      continue;
    }
    const pending = q.files;
    try {
      const up = await Promise.all(pending.map((f) => uploadFileDirect(new File([f.blob], f.name, { type: f.type }), "chat")));
      if (up.some((u) => u.provider !== "supabase")) throw new Error("Chat files go to Kin's own storage.");
      const done: Queued = {
        ...q,
        files: undefined,
        uploaded: up.map((u, i) => ({
          storagePath: u.provider === "supabase" ? u.storagePath : "",
          fileName: pending[i].name,
          mimeType: pending[i].type,
          sizeBytes: pending[i].size,
          transcript: pending[i].transcript,
        })),
      };
      // Kept before sending, so a replay that dies now does not upload twice.
      await updateQueued(done);
      ready.push(done);
    } catch (e) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      if (e instanceof TypeError || /failed to fetch|load failed|networkerror/i.test(String(e))) break;
      refused.push(q);
      const words = q.body.trim() ? `"${q.body.trim().slice(0, 40)}${q.body.trim().length > 40 ? "…" : ""}"` : "A message with files";
      notes.push(`${words} wasn't sent: ${e instanceof Error ? e.message : "a file didn't upload."}`);
    }
  }
  if (refused.length) await removeQueued(refused.map((r) => r.seq));
  return { ready, refused, notes };
}

/** In words, for the toast that follows a sync. */
export function describeSync(s: SyncSummary): { kind: "success" | "info"; message: string } | null {
  if (s.applied === 0 && s.skipped.length === 0) return null;
  const saved = s.applied > 0 ? `Back online · ${s.applied} change${s.applied === 1 ? "" : "s"} saved` : "Back online";
  if (s.skipped.length === 0) return { kind: "success", message: `${saved}.` };
  return { kind: "info", message: `${saved}. ${s.skipped.slice(0, 2).join(" ")}${s.skipped.length > 2 ? ` And ${s.skipped.length - 2} more.` : ""}` };
}
