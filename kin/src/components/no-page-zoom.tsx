"use client";

import { useEffect } from "react";

/** Older iPhones pinch-zoom the page through Safari's own gesture events,
 * which neither the viewport nor touch-action stops. Cancelling the gesture
 * stops the page zooming; photos and the family tree zoom through pointer
 * events, which this leaves alone. See the viewport in app/layout.tsx. */
export function NoPageZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
    };
  }, []);
  return null;
}
