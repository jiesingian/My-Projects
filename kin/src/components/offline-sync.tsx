"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { refreshSnapshot, replayQueue, describeSync } from "@/lib/offline/sync";

/** Keeps offline Kin current while the app is online, and says so when it
 * is not (mounted once, in the app layout).
 *
 * Online: sends anything queued offline, then saves a fresh snapshot for the
 * phone -- on load, on coming back online, and on returning to the app, at
 * most every three minutes. Offline, on a live page: a calm line at the top,
 * with the way to the saved copy. On Today, the shopping list and the
 * household chat it says what waits for a connection (lib/offline/live
 * queues it); anywhere else, that changes there won't save. */

/** The live pages that queue their changes offline. */
const QUEUES_HERE = /^\/(today|household|chat\/household)$/;

const REFRESH_EVERY_MS = 3 * 60_000;

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

export function OfflineSync() {
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
    let last = 0;
    let running = false;
    const sync = async (force = false) => {
      if (running || (!force && Date.now() - last < REFRESH_EVERY_MS)) return;
      running = true;
      try {
        const summary = await replayQueue();
        const said = summary && describeSync(summary);
        if (said) {
          toast[said.kind](said.message);
          router.refresh();
        }
        if (await refreshSnapshot()) last = Date.now();
      } finally {
        running = false;
      }
    };
    void sync(true);
    const onVisible = () => document.visibilityState === "visible" && void sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [online, router]);

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
