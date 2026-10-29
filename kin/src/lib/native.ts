import type { KinAlarm } from "@/lib/alarms";

/** The Kin iPhone app (kin/native) is this web app inside a native shell.
 * Inside it, Capacitor's bridge puts `window.Capacitor` on the page, with
 * Kin's own native plugins under `Plugins`; in a browser there is none, and
 * everything here quietly does nothing. No npm dependency: the bridge is the
 * app's, not the page's. */

export type AlarmAuthorization = "authorized" | "denied" | "notDetermined";
export type AlarmStatus = {
  /** "alarmkit" on iOS 26 and later: real alarms, full screen, sound on
   * silent. "notifications" before that: time-sensitive notifications, the
   * most an older iPhone allows. */
  engine: "alarmkit" | "notifications";
  authorization: AlarmAuthorization;
  scheduled: number;
};

type KinAlarmsPlugin = {
  status(): Promise<AlarmStatus>;
  authorize(): Promise<AlarmStatus>;
  replaceAll(input: { alarms: KinAlarm[] }): Promise<AlarmStatus>;
};

type Bridge = {
  isNativePlatform?: () => boolean;
  Plugins?: { KinAlarms?: KinAlarmsPlugin };
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
};

function bridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: Bridge }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

/** True inside the Kin iPhone app. */
export function inNativeApp(): boolean {
  return bridge() !== null;
}

/** The native alarm plugin, or null in a browser (or an app build without it). */
export function nativeAlarms(): KinAlarmsPlugin | null {
  const cap = bridge();
  if (!cap) return null;
  if (cap.Plugins?.KinAlarms) return cap.Plugins.KinAlarms;
  // A plugin registered by the app itself (kin/native, KinBridgeViewController)
  // is reached through the bridge's own call when it is not listed.
  const call = cap.nativePromise;
  if (!call) return null;
  return {
    status: () => call("KinAlarms", "status", {}) as Promise<AlarmStatus>,
    authorize: () => call("KinAlarms", "authorize", {}) as Promise<AlarmStatus>,
    replaceAll: (input) => call("KinAlarms", "replaceAll", input) as Promise<AlarmStatus>,
  };
}

/** The event the Alarms screen fires after a change, so the app re-sends
 * the list at once rather than at the next open. */
export const ALARMS_CHANGED = "kin:alarms-changed";
