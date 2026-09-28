"use client";

import { useEffect, useState, useTransition } from "react";
import { savePushSubscriptionAction, removePushSubscriptionAction, sendTestPushAction } from "@/lib/actions/push";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
/** Set when someone taps "Turn off for this device"; cleared when they turn
 * it back on. PushKeepAlive never re-subscribes a device that carries it. */
const OPTED_OUT = "kin-push-off";
const setOptedOut = (on: boolean) => {
  try {
    if (on) localStorage.setItem(OPTED_OUT, "1");
    else localStorage.removeItem(OPTED_OUT);
  } catch {}
};

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
  const [tested, setTested] = useState<string | null>(null);

  const test = () =>
    start(async () => {
      setError(null);
      setTested(null);
      const r = await sendTestPushAction();
      if (r.error) setError(r.error);
      else setTested(`Sent to ${r.sent === 1 ? "1 device" : `${r.sent} devices`}. It should appear in a few seconds, even with Kin closed.`);
    });

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
        setOptedOut(false);
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
      setOptedOut(true);
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
        <>
          <button type="button" className="btn btn-secondary btn-block" disabled={pending} onClick={test}>
            {pending ? "Sending…" : "Send a test notification"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={turnOff}>
            Turn off for this device
          </button>
        </>
      )}
      {tested && <p role="status" className="kin-push-ok">{tested}</p>}
      {error && <p role="alert" className="kin-push-error">{error}</p>}
    </div>
  );
}

/** Keeps this device's notification address current (26 September). Push
 * services replace a device's address from time to time -- iPhones in
 * particular -- and nothing tells the app, so Kin went on sending to the old
 * one: Settings said "on" and calls never rang. Each time Kin opens on a
 * device where notifications are allowed, the current address is saved again
 * (at most once a day unless it changed). It never asks for permission; that
 * stays the button in Settings. */
export function PushKeepAlive() {
  useEffect(() => {
    if (!KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    // Switched off on purpose on this device: leave it off.
    try {
      if (localStorage.getItem(OPTED_OUT) === "1") return;
    } catch {}
    const t = window.setTimeout(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) as BufferSource }));
        const mark = `${sub.endpoint}|${new Date().toISOString().slice(0, 10)}`;
        let last: string | null = null;
        try {
          last = localStorage.getItem("kin-push-saved");
        } catch {}
        if (last === mark) return;
        const result = await savePushSubscriptionAction(sub.toJSON() as Parameters<typeof savePushSubscriptionAction>[0]);
        if (!result.error) {
          try {
            localStorage.setItem("kin-push-saved", mark);
          } catch {}
        }
      } catch {
        // No worker yet, or the browser refused: Settings shows the state.
      }
    }, 3000);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
