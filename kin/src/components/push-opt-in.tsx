"use client";

import { useEffect, useState, useTransition } from "react";
import { savePushSubscriptionAction, removePushSubscriptionAction } from "@/lib/actions/push";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "unsupported" | "needs-install" | "not-set-up" | "off" | "on" | "blocked";

/** Notifications for this phone or browser. The switches below choose what;
 * this chooses whether this device hears about it at all. On an iPhone, web
 * notifications only exist once Kin is added to the Home Screen, so that is
 * what it says there instead of offering a button that cannot work. */
export function PushOptIn() {
  const [state, setState] = useState<State | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!KEY) return setState("not-set-up");
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "needs-install" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.ready;
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })();
  }, []);

  const turnOn = () =>
    start(async () => {
      setError(null);
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) as BufferSource });
        const json = sub.toJSON() as Parameters<typeof savePushSubscriptionAction>[0];
        const result = await savePushSubscriptionAction(json);
        if (result.error) {
          await sub.unsubscribe();
          return setError(result.error);
        }
        setState("on");
      } catch {
        setError("This browser wouldn't turn notifications on. Try again, or from another browser.");
      }
    });

  const turnOff = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });

  if (!state) return null;
  const line: Record<State, string> = {
    unsupported: "This browser can't show notifications.",
    "needs-install": "On iPhone, add Kin to your Home Screen first (Share → Add to Home Screen), then open it from there to turn notifications on.",
    "not-set-up": "Notifications aren't switched on for Kin yet. These choices are saved and start working as soon as they are.",
    off: "Get a notification on this device when something happens in the family.",
    on: "Notifications are on for this device.",
    blocked: "Notifications are blocked for Kin in this browser's settings. Allow them there, then come back.",
  };
  return (
    <div className="kin-push">
      <p>{line[state]}</p>
      {state === "off" && (
        <button type="button" className="btn btn-primary btn-block" disabled={pending} onClick={turnOn}>
          {pending ? "Turning on…" : "Turn on notifications on this device"}
        </button>
      )}
      {state === "on" && (
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={turnOff}>
          Turn off for this device
        </button>
      )}
      {error && <p role="alert" className="kin-push-error">{error}</p>}
    </div>
  );
}
