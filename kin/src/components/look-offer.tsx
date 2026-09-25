"use client";

import { useState, useTransition } from "react";
import { answerLookOfferAction } from "@/lib/actions/settings";
import { ErrorText } from "@/components/form";

/** The one-time offer of Kin's new look -- the icon's warm coral -- to
 * someone who had a profile before it became the default (item 3, 25
 * September). Nobody's look changes unless they say yes here, and either
 * answer is kept on their profile, so it is asked once, not once per phone.
 * Settings -> Appearance can change it back, or to anything else, later. */
export function LookOffer() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  if (gone) return null;

  const answer = (accept: boolean) =>
    startTransition(async () => {
      const result = await answerLookOfferAction(accept);
      if (result.error) {
        setError(result.error);
        return;
      }
      // The palette is drawn by the app shell, so a yes shows once the page
      // reloads -- the same as choosing a theme in Settings.
      if (accept) window.location.reload();
      else setGone(true);
    });

  return (
    <section className="kin-look-offer" aria-labelledby="look-offer-title">
      {/* The icon itself is the preview: the new look is its colours. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={44} height={44} className="kin-look-offer-icon" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 id="look-offer-title" className="kin-look-offer-title">
          Try Kin&rsquo;s new look?
        </h3>
        <p className="kin-look-offer-text">Warm coral, to match the new icon. You can change it back any time in Settings → Appearance.</p>
        <ErrorText message={error} />
        <div className="kin-look-offer-actions">
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => answer(true)}>
            Try it
          </button>
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => answer(false)}>
            Keep mine
          </button>
        </div>
      </div>
    </section>
  );
}
