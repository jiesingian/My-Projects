"use client";

import { useEffect, useState, useTransition } from "react";
import { helperPushSavedAction, removeHelperPushAction, saveHelperPushAction } from "@/lib/actions/helpers";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "unsupported" | "needs-install" | "blocked" | "off" | "on";

/** "Tell me when the family adds to the list" (20261019212500): the helper's
 * own choice, for this phone and this household. Shown only where it can
 * work -- a browser that can be told things, with Kin's notifications set
 * up -- and, on an iPhone, says to add Kin to the Home Screen first, as
 * Settings does for members (components/push-opt-in). */
export function HelperPush({ familyId }: { familyId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!KEY) return;
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "needs-install" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub && (await helperPushSavedAction(familyId, sub.endpoint)) ? "on" : "off");
    })();
  }, [familyId]);

  const turnOn = () =>
    start(async () => {
      setError(null);
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) as BufferSource }));
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const r = await saveHelperPushAction(familyId, json);
        if (r.error) return setError(r.error);
        setState("on");
      } catch {
        setError("This phone wouldn't turn notifications on. Try again.");
      }
    });

  const turnOff = () =>
    start(async () => {
      setError(null);
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      // The phone's own subscription stays: the same phone may also be told
      // about another household's list, or be a member's own.
      if (sub) {
        const r = await removeHelperPushAction(familyId, sub.endpoint);
        if (r.error) return setError(r.error);
      }
      setState("off");
    });

  if (!state || state === "unsupported") return null;
  const quiet = { fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.5rem 0 0", lineHeight: 1.45 } as const;
  return (
    <div style={{ marginTop: "0.75rem" }}>
      {state === "off" && (
        <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.75rem" }} disabled={pending} onClick={turnOn}>
          {pending ? "Turning on…" : "Tell me when the family adds to the list"}
        </button>
      )}
      {state === "on" && (
        <>
          <p style={quiet}>This phone is told when the family adds to the list.</p>
          <button type="button" className="btn btn-ghost" style={{ minHeight: "2.75rem" }} disabled={pending} onClick={turnOff}>
            Stop telling me
          </button>
        </>
      )}
      {state === "needs-install" && <p style={quiet}>To be told when the family adds to the list, add Kin to your Home Screen (Share → Add to Home Screen) and open it from there.</p>}
      {state === "blocked" && <p style={quiet}>Notifications are blocked for Kin in this browser&apos;s settings. Allow them there to be told when the family adds to the list.</p>}
      {error && (
        <p role="alert" style={{ ...quiet, color: "var(--cal-occasion)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
