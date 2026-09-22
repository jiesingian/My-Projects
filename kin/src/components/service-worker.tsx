"use client";

import { useEffect } from "react";

/** Registers the worker, once, after the page has settled.
 *
 * Deliberately not in a layout that renders before anything else: a worker
 * registered during the first paint competes with the page it is supposed
 * to be making faster. */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // No worker in development: it would cache a build that is about to
    // change and make every edit look like it did not happen.
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // A refused registration -- private mode, an unsupported browser,
        // a policy -- costs the household nothing except the offline
        // fallback, so it fails quietly.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
