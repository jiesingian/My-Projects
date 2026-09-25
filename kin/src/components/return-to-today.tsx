"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { shouldReturnToToday } from "@/lib/return-to-today";

const HIDDEN_AT = "kin-hidden-at";

/** Opening Kin fresh already lands on Today (the manifest's start_url, and
 * "/" redirects there). A phone that kept Kin in the background, though,
 * brings it back on whatever screen it was left on -- hours later, that is
 * rarely what anyone wants. So when the app comes back after 30 minutes or
 * more away, it goes to Today; a shorter trip comes back where it was.
 *
 * Mounted once, in the app shell. It renders nothing. */
export function ReturnToToday() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const remember = () => {
      try {
        sessionStorage.setItem(HIDDEN_AT, String(Date.now()));
      } catch {
        // Storage refused (private mode, quota): the app simply comes back
        // where it was, as it always has.
      }
    };

    const comeBack = () => {
      let hiddenAt: number | null = null;
      try {
        const raw = sessionStorage.getItem(HIDDEN_AT);
        sessionStorage.removeItem(HIDDEN_AT);
        hiddenAt = raw ? Number(raw) : null;
      } catch {
        return;
      }
      if (hiddenAt === null) return;
      if (shouldReturnToToday({ awayMs: Date.now() - hiddenAt, pathname, hasUnsavedInput: hasUnsavedInput() })) {
        router.replace("/today");
      }
    };

    const onVisibility = () => (document.visibilityState === "hidden" ? remember() : comeBack());
    // iOS can restore a page from its back-forward cache instead of firing
    // visibilitychange; pageshow with persisted set is that case.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) comeBack();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", remember);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", remember);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [pathname, router]);

  return null;
}

/** Anything typed on this page and not yet saved: a text field or text area
 * whose value has moved from the one the page arrived with. */
function hasUnsavedInput(): boolean {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="number"], input[type="tel"], input[type="url"], input[type="date"], input[type="time"]',
  );
  return Array.from(fields).some((f) => f.value !== f.defaultValue);
}
