"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AD_TRACKING_ON } from "@/lib/legal";
import { CONSENT_KEY, bannerShown, isPublicPage, parseConsent, type Consent } from "@/lib/consent";

function readConsent(): Consent {
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_KEY));
  } catch {
    return null;
  }
}

function writeConsent(value: Consent) {
  try {
    if (value) window.localStorage.setItem(CONSENT_KEY, value);
    else window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Private mode: the question simply comes back next time.
  }
  window.dispatchEvent(new Event("kin-consent"));
}

/** The consent banner for the public pages (home, features): Accept or
 * Decline, kept per browser. Renders nothing while the ad stage is off
 * (lib/legal.ts, AD_TRACKING_ON), which is the default. */
export function ConsentBanner() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<Consent | "unread">("unread");

  useEffect(() => {
    if (!AD_TRACKING_ON) return;
    const sync = () => setConsent(readConsent());
    sync();
    window.addEventListener("kin-consent", sync);
    return () => window.removeEventListener("kin-consent", sync);
  }, []);

  if (!AD_TRACKING_ON || consent === "unread" || !isPublicPage(pathname) || !bannerShown(AD_TRACKING_ON, consent)) return null;

  return (
    <div
      role="region"
      aria-label="Advertising choice"
      style={{
        position: "fixed",
        left: "max(1rem, env(safe-area-inset-left))",
        right: "max(1rem, env(safe-area-inset-right))",
        bottom: "max(1rem, env(safe-area-inset-bottom))",
        zIndex: 50,
        maxWidth: 520,
        margin: "0 auto",
        padding: "0.875rem 1rem",
        background: "var(--color-surface, #fff)",
        border: "1px solid color-mix(in srgb, var(--color-text) 14%, transparent)",
        boxShadow: "0 6px 24px rgb(0 0 0 / 0.12)",
      }}
    >
      <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, margin: "0 0 0.625rem" }}>
        May Kin measure which ads brought you here? If you accept, this page tells Meta (Facebook and Instagram) that you
        visited. Nothing from inside the app is ever shared. <Link href="/legal/privacy#advertising">Privacy notice</Link>
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem" }} onClick={() => writeConsent("declined")}>
          Decline
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: "2.5rem" }} onClick={() => writeConsent("accepted")}>
          Accept
        </button>
      </div>
    </div>
  );
}

/** "Change my choice" on the privacy notice: forgets this browser's answer,
 * so the banner asks again on the next public page. */
export function ConsentReset() {
  const [done, setDone] = useState(false);
  if (!AD_TRACKING_ON) return null;
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        writeConsent(null);
        setDone(true);
      }}
    >
      {done ? "Forgotten. You'll be asked again." : "Change my choice"}
    </button>
  );
}
