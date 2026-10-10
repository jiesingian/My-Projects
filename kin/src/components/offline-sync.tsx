"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { refreshSnapshot, replayQueue, describeSync } from "@/lib/offline/sync";
import { getSnapshot } from "@/lib/offline/store";

/** Keeps offline Kin current while the app is online, and says so when it
 * is not (mounted once, in the app layout).
 *
 * Online: sends anything queued offline, then saves a fresh snapshot for the
 * phone -- a few seconds after a page opens, on coming back online, and on
 * returning to the app, at most every three minutes. Offline, on a live page: a calm line at the top,
 * with the way to the saved copy. On Today, the shopping list and the
 * household chat it says what waits for a connection (lib/offline/live
 * queues it); anywhere else, that changes there won't save. */

/** The live pages that queue their changes offline. */
const QUEUES_HERE = /^\/(today|household|chat\/household)$/;

const REFRESH_EVERY_MS = 3 * 60_000;
/** How long a page is open, and visible, before the snapshot is refreshed. */
const SETTLE_MS = 8_000;

function subscribeOnline(fn: () => void) {
  window.addEventListener("online", fn);
  window.addEventListener("offline", fn);
  return () => {
    window.removeEventListener("online", fn);
    window.removeEventListener("offline", fn);
  };
}

/** navigator.onLine: false is reliable (no network at all); true only means
 * a network, not a working one -- which is why the service worker also gives
 * up on a navigation that hangs. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** `userId` is the signed-in auth user: a saved copy for anyone else is never
 * counted as fresh, so a new person's copy replaces it straight away. */
export function OfflineSync({ userId }: { userId: string }) {
  const online = useOnline();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker?.ready.then((r) => r.active?.postMessage("kin:refresh-shell")).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!online) return;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Anything written offline goes at once: it is the person's own change.
    const replay = async () => {
      const summary = await replayQueue();
      const said = summary && describeSync(summary);
      if (said) {
        toast[said.kind](said.message);
        router.refresh();
      }
      return (summary?.applied ?? 0) > 0;
    };

    // The snapshot is the expensive part -- some forty reads of the database
    // -- so it is not fetched on every page load. It waits until the page has
    // been open and visible for a few seconds, and skips the fetch when the
    // phone's copy for this person is under three minutes old, however many
    // pages were opened in between. On 8 October the shared dev database
    // stalled for most of a day; every test page is a fresh load, so each
    // CI run fetched a snapshot per page on top of the page itself.
    const refresh = async (force: boolean) => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const saved = await getSnapshot().catch(() => null);
        const fresh = saved && saved.userId === userId && Date.now() - Date.parse(saved.savedAt) < REFRESH_EVERY_MS;
        if (force || !fresh) await refreshSnapshot();
      } finally {
        running = false;
      }
    };
    const later = (force = false) => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(force), SETTLE_MS);
    };

    void replay().then((changed) => later(changed));
    const onVisible = () => {
      if (document.visibilityState !== "visible") return clearTimeout(timer);
      void replay().then((changed) => later(changed));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [online, router, userId]);

  if (online) return null;
  return (
    <div className="kin-offline-bar" role="status">
      <span>
        {QUEUES_HERE.test(pathname)
          ? "Offline — Done, ticks, new items and messages wait here and send when you’re back."
          : "Offline — changes on this screen won’t save."}
      </span>
      <a
        href="/offline"
        // Where they are, read at the tap, so the saved copy opens on the
        // same screen.
        onClick={(e) => {
          e.currentTarget.href = `/offline?from=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }}
      >
        Open saved Kin
      </a>
    </div>
  );
}
