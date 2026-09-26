"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";

/** Shortcuts to the apps that run the house's appliances (26 September).
 *
 * Shortcuts, deliberately, not a connection. LG does offer an official way
 * in (a personal token), but Xiaomi has none: every "Xiaomi integration"
 * signs in with the account's own password, which Kin will not ask for. So
 * both open their own app, where the controls already are.
 *
 * A web page cannot see which apps a phone has. On Android an intent link
 * opens the app when it is installed and its Play Store page when it isn't;
 * on an iPhone the App Store page shows "Open" when it is installed, which is
 * the only way in Apple leaves a web page that we can verify. */
const APPS = [
  {
    name: "Xiaomi Home",
    line: "Lights, fans, vacuums, cameras",
    pkg: "com.xiaomi.smarthome",
    appStore: "https://apps.apple.com/app/id957323480",
  },
  {
    name: "LG ThinQ",
    line: "Washer, fridge, aircon, TV",
    pkg: "com.lgeha.nuts",
    appStore: "https://apps.apple.com/app/id993504342",
  },
] as const;

type Platform = "android" | "apple" | "other";

function platform(): Platform {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod|Macintosh/i.test(ua)) return "apple";
  return "other";
}

const subscribe = () => () => {};

function hrefFor(app: (typeof APPS)[number], on: Platform) {
  const play = `https://play.google.com/store/apps/details?id=${app.pkg}`;
  if (on === "android") return `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${app.pkg};S.browser_fallback_url=${encodeURIComponent(play)};end`;
  if (on === "apple") return app.appStore;
  return play;
}

export function SmartHomeLinks() {
  // The server can't know the phone, so it renders the Play Store link and
  // the browser swaps in the right one.
  const on = useSyncExternalStore<Platform>(subscribe, platform, () => "other");
  return (
    <div className="kin-smarthome">
      {APPS.map((app) => (
        <a key={app.pkg} className="kin-smarthome-app" href={hrefFor(app, on)} target={on === "android" ? undefined : "_blank"} rel="noopener noreferrer">
          <span className="kin-smarthome-ico" aria-hidden="true">
            <Icon name="house" size="1.125rem" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="kin-smarthome-name">{app.name}</span>
            <span className="kin-smarthome-line">{app.line}</span>
          </span>
          <Icon name="external" size="0.875rem" />
        </a>
      ))}
    </div>
  );
}
