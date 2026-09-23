"use client";

import { usePhoneKind } from "@/components/wealth-controls";
import { appStoreSearchUrl, playStoreSearchUrl } from "@/lib/wealth";

/** Companion to the OPEN button above it: that one only works once the app
 * is already installed. This is for before that -- where to get it, on
 * whichever store the phone in hand actually uses.
 *
 * When neither store link is set -- any institution Kin hasn't
 * hand-verified, which is most of them, in any country -- this falls back
 * to searching that store for the institution's name instead of showing
 * nothing. Less precise than a direct listing (a search page, not the
 * exact app), but it means GET APP never dead-ends just because a bank
 * isn't one of the handful Kin has verified. No institution named at all
 * means nothing to search for, so the button stays gone in that one case. */
export function GetAppButton({
  appStoreUrl,
  playStoreUrl,
  institution,
  country,
  label,
}: {
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  institution: string | null;
  country: string | null;
  label: string;
}) {
  const kind = usePhoneKind();

  if (!appStoreUrl && !playStoreUrl && !institution) return null;

  // Each store gets its own verb -- a household that hand-typed an App
  // Store link under Other but left Play Store blank should see GET on
  // one and FIND (a search, not a listing) on the other, not the same
  // word claiming a precision neither link actually has in common.
  const resolvedAppStoreUrl = appStoreUrl ?? (institution ? appStoreSearchUrl(institution, country) : null);
  const resolvedPlayStoreUrl = playStoreUrl ?? (institution ? playStoreSearchUrl(institution) : null);
  const appStoreVerb = appStoreUrl ? "GET" : "FIND";
  const playStoreVerb = playStoreUrl ? "GET" : "FIND";

  const links: { href: string; text: string }[] = [];
  if (kind === "ios" && resolvedAppStoreUrl) {
    links.push({ href: resolvedAppStoreUrl, text: `${appStoreVerb} ${label} — APP STORE` });
  } else if (kind === "android" && resolvedPlayStoreUrl) {
    links.push({ href: resolvedPlayStoreUrl, text: `${playStoreVerb} ${label} — PLAY STORE` });
  } else {
    if (resolvedAppStoreUrl) links.push({ href: resolvedAppStoreUrl, text: `${appStoreVerb} ${label} — APP STORE` });
    if (resolvedPlayStoreUrl) links.push({ href: resolvedPlayStoreUrl, text: `${playStoreVerb} ${label} — PLAY STORE` });
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary"
          style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.75rem", letterSpacing: ".03em", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {l.text}
        </a>
      ))}
    </div>
  );
}
