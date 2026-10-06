"use client";

import { useEffect } from "react";
import { clearAll } from "@/lib/offline/store";

/** Empties offline Kin: the phone's copy of the last person's household
 * (lib/offline/store.ts), and anything the old worker cached.
 *
 * Rendered on the sign-in screen rather than wired into the sign-out button,
 * which is a server action and cannot talk to a service worker. Arriving
 * here means signed out, switching accounts, or a session that expired --
 * all three are reasons the last household's shopping list should stop
 * being readable on this device, and the button only covers the first. */
export function ClearOfflineCache() {
  useEffect(() => {
    void clearAll();
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage("kin:clear-cache"))
      .catch(() => {
        // No worker registered is the ordinary case on a first visit.
      });
  }, []);

  return null;
}
