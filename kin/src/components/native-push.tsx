"use client";

import { useEffect } from "react";
import { savePushSubscriptionAction } from "@/lib/actions/push";
import { NATIVE_KEY, nativePushTokens, tokenEndpoint } from "@/lib/native";

/** Inside the Kin iPhone app, saves the phone's two Apple tokens (alert and
 * VoIP) for the signed-in member, the way PushOptIn saves a browser's
 * subscription, so calls ring like Messenger and an SOS gets through
 * (lib/apns.ts, kin/native KinPushPlugin.swift). Each open saves them again,
 * which also moves a phone to whoever is signed in on it now. In a browser it
 * does nothing. */
export function NativePush() {
  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = async () => {
      const tokens = await nativePushTokens();
      for (const t of tokens) {
        await savePushSubscriptionAction({ endpoint: tokenEndpoint(t), keys: { p256dh: NATIVE_KEY, auth: t.channel } }).catch(() => undefined);
      }
      // Apple hands the tokens over a moment after launch: look again a few
      // times until both are there. Android has one (FCM, lib/fcm.ts).
      if (tokens.length < 2 && !tokens.some((t) => t.channel === "fcm") && ++tries < 5) timer = setTimeout(save, 3000);
    };
    void save();
    return () => clearTimeout(timer);
  }, []);
  return null;
}
