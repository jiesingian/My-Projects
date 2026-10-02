"use client";

import { usePhoneKind } from "@/components/wealth-controls";
import { appLaunchPlan } from "@/lib/wealth";

/** OPEN <bank>: into the app when it's on this phone, to its store page to
 * install it when it isn't. It replaces both the old OPEN button, which
 * did nothing useful without the app, and the GET … APP STORE / PLAY
 * STORE buttons beside it. Which link fits which phone is appLaunchPlan's
 * job (lib/wealth.ts); this only follows it.
 *
 * The one case that needs a timer is an iPhone trying an app's own scheme
 * (gcash://): if Kin is still the page on screen a moment later, nothing
 * opened, so it goes on to the App Store. Leaving for the app hides the
 * page, and a hidden page never takes that second step. */
export function OpenAppButton({
  linkedAppUrl,
  appStoreUrl,
  playStoreUrl,
  institution,
  country,
  label,
}: {
  linkedAppUrl: string | null;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  institution: string | null;
  country: string | null;
  label: string;
}) {
  const kind = usePhoneKind();
  const plan = appLaunchPlan(kind, { linkedAppUrl, appStoreUrl, playStoreUrl, institution, country });
  if (!plan) return null;

  return (
    <a
      href={plan.href}
      target={kind === "other" ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="btn btn-primary btn-block"
      style={{ minHeight: "2.75rem", fontSize: "0.875rem", letterSpacing: ".04em", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.5rem" }}
      onClick={() => {
        const fallback = plan.fallback;
        if (!fallback) return;
        window.setTimeout(() => {
          if (document.visibilityState === "visible") window.location.href = fallback;
        }, 1500);
      }}
    >
      Open {label}
    </a>
  );
}
