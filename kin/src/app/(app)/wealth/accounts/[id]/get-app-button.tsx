"use client";

import { useSyncExternalStore } from "react";
import { phoneKind } from "@/components/wealth-controls";

const noSubscription = () => () => {};

/** Companion to the OPEN button above it: that one only works once the app
 * is already installed. This is for before that -- where to get it, on
 * whichever store the phone in hand actually uses. The server can't see a
 * visitor's user agent ahead of the request reaching them, so the server
 * snapshot below is always "other" (both links) and useSyncExternalStore
 * -- not an effect -- swaps in the real answer right after hydration,
 * without a mismatch between what the server sent and what the browser
 * first paints. */
export function GetAppButton({
  appStoreUrl,
  playStoreUrl,
  label,
}: {
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  label: string;
}) {
  const kind = useSyncExternalStore(noSubscription, phoneKind, () => "other" as const);

  if (!appStoreUrl && !playStoreUrl) return null;

  const links: { href: string; text: string }[] = [];
  if (kind === "ios" && appStoreUrl) {
    links.push({ href: appStoreUrl, text: `GET ${label} — APP STORE` });
  } else if (kind === "android" && playStoreUrl) {
    links.push({ href: playStoreUrl, text: `GET ${label} — PLAY STORE` });
  } else {
    if (appStoreUrl) links.push({ href: appStoreUrl, text: `GET ${label} — APP STORE` });
    if (playStoreUrl) links.push({ href: playStoreUrl, text: `GET ${label} — PLAY STORE` });
  }

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ flex: 1, minHeight: 40, fontSize: 12, letterSpacing: ".03em", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {l.text}
        </a>
      ))}
    </div>
  );
}
