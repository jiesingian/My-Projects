import type { KinAlarm } from "@/lib/alarms";

/** The Kin iPhone and Android apps (kin/native) are this web app inside a native shell.
 * Inside it, Capacitor's bridge puts `window.Capacitor` on the page, with
 * Kin's own native plugins under `Plugins`; in a browser there is none, and
 * everything here quietly does nothing. No npm dependency: the bridge is the
 * app's, not the page's. */

export type AlarmAuthorization = "authorized" | "denied" | "notDetermined";
export type AlarmStatus = {
  /** "alarmkit" on iOS 26 and later: real alarms, full screen, sound on
   * silent. "notifications" before that: time-sensitive notifications, the
   * most an older iPhone allows. "android": exact alarms that open full
   * screen and ring on the alarm stream (kin/native/android, KinAlarms). */
  engine: "alarmkit" | "notifications" | "android";
  authorization: AlarmAuthorization;
  scheduled: number;
  /** Android 14 and later only: false when the phone (or Google Play) took
   * away the full screen, so alarms and calls ring as heads-up notifications. */
  fullScreen?: boolean;
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

/** Apple's push for the app (lib/apns.ts): its tokens are saved in
 * push_subscriptions under Apple's real device address, with this in the
 * p256dh column and the channel ("alert" or "voip") in auth. Here, not in
 * lib/apns.ts, because the page that saves them must not pull in the server's
 * HTTP/2 sender. */
export const NATIVE_KEY = "kin-native";
export const APNS_HOSTS = { production: "api.push.apple.com", sandbox: "api.sandbox.push.apple.com" } as const;
export type ApnsEnv = keyof typeof APNS_HOSTS;

/** The address the app's token is kept under. */
export function nativeEndpoint(token: string, env: ApnsEnv): string {
  return `https://${APNS_HOSTS[env]}/3/device/${token}`;
}

/** The Kin Android app's push token (Firebase Cloud Messaging, lib/fcm.ts)
 * is kept under this address, with NATIVE_KEY in p256dh and "fcm" in auth.
 * Not Google's real send address: Chrome's Web Push endpoints live on
 * fcm.googleapis.com/fcm/send/, and this must never be read as one. */
export const FCM_PREFIX = "https://fcm.googleapis.com/kin-android/";
export function fcmEndpoint(token: string): string {
  return FCM_PREFIX + token;
}

export type NativeToken = { channel: "alert" | "voip"; token: string; env: ApnsEnv } | { channel: "fcm"; token: string; env: "production" };

/** Where a token from the app is kept in push_subscriptions. */
export function tokenEndpoint(t: NativeToken): string {
  return t.channel === "fcm" ? fcmEndpoint(t.token) : nativeEndpoint(t.token, t.env);
}

/** Whether a token from the app is one Kin can use. */
export function usableToken(t: { channel?: unknown; token?: unknown; env?: unknown }): t is NativeToken {
  if (typeof t.token !== "string") return false;
  if (t.channel === "fcm") return /^[A-Za-z0-9_:-]{20,400}$/.test(t.token);
  return (t.channel === "alert" || t.channel === "voip") && /^[0-9a-f]{32,200}$/i.test(t.token) && (t.env === "production" || t.env === "sandbox");
}

/** The app's Apple tokens, or none in a browser. */
export async function nativePushTokens(): Promise<NativeToken[]> {
  const cap = bridge();
  if (!cap) return [];
  try {
    const r = (cap.Plugins as { KinPush?: { tokens(): Promise<{ tokens: NativeToken[] }> } } | undefined)?.KinPush
      ? await (cap.Plugins as { KinPush: { tokens(): Promise<{ tokens: NativeToken[] }> } }).KinPush.tokens()
      : ((await cap.nativePromise?.("KinPush", "tokens", {})) as { tokens: NativeToken[] } | undefined);
    return (r?.tokens ?? []).filter(usableToken);
  } catch {
    return [];
  }
}

/** The event the Alarms screen fires after a change, so the app re-sends
 * the list at once rather than at the next open. The app fires it too when
 * the silent alarm push arrives with Kin on screen (KinAlarmSync). */
export const ALARMS_CHANGED = "kin:alarms-changed";
