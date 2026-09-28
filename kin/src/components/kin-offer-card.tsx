"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { respondKinOfferAction } from "@/lib/actions/offers";
import { OFFER_META } from "@/lib/offers";
import type { KinOfferState } from "@/lib/queries/offers";

const small = { minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" } as const;

/** One of Kin's offers, on Today: take it or skip it. Taken, it stays until
 * it is done (then the days are earned) or its week runs out. The days go to
 * Kin Plus: a taste of it on Kin Free, added on to it otherwise. */
export function KinOfferCard({ state, plus, referralCode }: { state: KinOfferState; plus: boolean; referralCode: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { offer, earned } = state;
  if (!offer && earned.length === 0) return null;

  const answer = (accept: boolean) => {
    if (!offer) return;
    setError(null);
    startTransition(async () => {
      const r = await respondKinOfferAction(offer.id, accept);
      if (r.error) setError(r.error);
      router.refresh();
    });
  };

  const share = async () => {
    const text = `Join us on Kin, the family app. When you set up your household, enter our family's code: ${referralCode}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* the person closed the share sheet */
    }
  };

  const meta = offer ? OFFER_META[offer.code] : null;
  const daysLeft = offer?.daysLeft ?? 0;

  return (
    <section aria-label="An offer from Kin" style={{ marginBottom: "1.125rem", display: "grid", gap: "0.5rem" }}>
      {earned.map((e) => (
        <div key={e.code} role="status" style={{ padding: "0.6875rem 0.8125rem", borderRadius: 14, background: "color-mix(in srgb, var(--cal-money) 14%, transparent)", fontSize: "0.875rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Icon name="sparkle" size={16} style={{ color: "var(--cal-money)", flex: "none" }} />
          <span>
            <strong>Done — {e.days} day{e.days === 1 ? "" : "s"} of Kin Plus earned.</strong> {OFFER_META[e.code].title}.
          </span>
        </div>
      ))}
      {offer && meta && (
        <div style={{ padding: "0.8125rem", borderRadius: 14, border: "1px solid color-mix(in srgb, var(--color-accent-solid) 30%, transparent)", background: "color-mix(in srgb, var(--color-accent-solid) 7%, transparent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.71875rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
            <span className="kin-plus-badge">PLUS</span>
            An offer from Kin · {offer.days} day{offer.days === 1 ? "" : "s"}
            {offer.code === "refer" ? " + 30" : ""}
          </div>
          <div style={{ font: "600 1.0625rem/1.25 var(--font-heading)", marginTop: "0.375rem" }}>{meta.title}</div>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "0.25rem 0 0", lineHeight: 1.45 }}>
            {meta.body} {plus ? "The days are added to your Kin Plus." : "The days give your household Kin Plus for that long."}
          </p>

          {offer.status === "offered" ? (
            <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={() => answer(true)} style={small}>
                <Icon name="check" size={14} />
                Take it
              </button>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => answer(false)} style={{ ...small, color: "var(--color-neutral-700)" }}>
                Skip
              </button>
            </div>
          ) : offer.code === "refer" ? (
            <div style={{ marginTop: "0.625rem" }}>
              <div style={{ fontSize: "0.8125rem" }}>
                Your family&rsquo;s code: <strong style={{ letterSpacing: ".08em" }}>{referralCode}</strong>
              </div>
              <button type="button" className="btn btn-primary" onClick={share} style={{ ...small, marginTop: "0.5rem" }}>
                <Icon name="upload" size={14} />
                {copied ? "Copied" : "Share the code"}
              </button>
              <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.375rem" }}>Taken · {daysLeft} day{daysLeft === 1 ? "" : "s"} left to share it</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
              <Link href={meta.href} className="btn btn-primary" style={small}>
                {meta.cta}
              </Link>
              <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                Taken · {daysLeft} day{daysLeft === 1 ? "" : "s"} left · Kin notices when it&rsquo;s done
              </span>
            </div>
          )}
          {error && <div role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
        </div>
      )}
    </section>
  );
}
