"use client";

import { useEffect, useState } from "react";
import { TodayRow, RowButton } from "@/components/today-row";
import { pushOptedOut, readPushState, type PushState } from "@/components/push-opt-in";

const LATER = "kin-push-nudge-later";
const WAIT_DAYS = 14;

/** One row on Today when this phone can't hear from Kin (29 October): SOS,
 * medicine and bill reminders all said "needs notifications allowed", and
 * nothing told a family their phone didn't. Shown only when something can
 * be done -- notifications not yet on, blocked in the browser, or an iPhone
 * not yet added to the Home Screen -- never when they were switched off on
 * purpose in Settings, and "Not now" quiets it on this device for two
 * weeks. The fix itself stays in Settings -> Notifications. */
export function PushNudge() {
  const [state, setState] = useState<PushState | null>(null);

  useEffect(() => {
    if (pushOptedOut()) return;
    try {
      const later = Number(localStorage.getItem(LATER) ?? 0);
      if (later && Date.now() - later < WAIT_DAYS * 86_400_000) return;
    } catch {}
    void readPushState()
      .then(setState)
      .catch(() => {});
  }, []);

  if (state !== "off" && state !== "blocked" && state !== "needs-install") return null;

  const meta =
    state === "needs-install"
      ? "On iPhone: Share → Add to Home Screen, then open Kin from there"
      : state === "blocked"
        ? "Notifications are blocked for Kin in this browser"
        : "SOS, medicines and bills can't reach you here yet";
  const later = () => {
    try {
      localStorage.setItem(LATER, String(Date.now()));
    } catch {}
    setState(null);
  };

  return (
    <div className="kin-today-rows" style={{ marginBottom: "0.75rem" }}>
      <TodayRow
        icon="info"
        tintColor="var(--cal-schedule)"
        title="Reminders can't reach this phone"
        meta={meta}
        href="/settings/notifications"
        actions={
          <>
            <RowButton kind="primary" label="Fix" href="/settings/notifications" />
            <RowButton kind="ghost" label="Not now" onClick={later} />
          </>
        }
      />
    </div>
  );
}
