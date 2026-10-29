"use client";

import { useEffect } from "react";
import { ALARMS_CHANGED, nativeAlarms } from "@/lib/native";
import type { KinAlarm } from "@/lib/alarms";

/** Inside the Kin iPhone app, hands the member's alarms for the next two
 * weeks (api/alarms, lib/alarms.ts) to the phone each time Kin opens or
 * comes back to the front, and after a change on the Alarms screen. The
 * phone then rings them itself (AlarmKit), offline and on silent too. A read
 * that fails leaves the alarms already set as they were. In a browser this
 * renders nothing and does nothing. */
export function NativeAlarmSync() {
  useEffect(() => {
    const plugin = nativeAlarms();
    if (!plugin) return;
    let busy = false;
    const sync = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch("/api/alarms", { cache: "no-store" });
        if (!res.ok) return;
        const { alarms } = (await res.json()) as { alarms: KinAlarm[] };
        if (!Array.isArray(alarms)) return;
        let status = await plugin.status();
        // Asked once, the first time there is something to ring.
        if (status.authorization === "notDetermined" && alarms.length) status = await plugin.authorize();
        if (status.authorization === "authorized") await plugin.replaceAll({ alarms });
      } catch {
        // No signal, or the app is older than this page: try again next time.
      } finally {
        busy = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    void sync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ALARMS_CHANGED, sync);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(ALARMS_CHANGED, sync);
    };
  }, []);
  return null;
}
