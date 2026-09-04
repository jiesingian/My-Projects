"use client";

import { useState, useTransition } from "react";
import { resendConfirmation } from "@/lib/actions/auth";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Icon } from "@/components/icons";

export function VerifyForm({ email }: { email: string }) {
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <OnboardingShell step="STEP 02 / 05" backHref="/signup">
      <h2 style={{ fontSize: 34, margin: "0 0 6px" }}>Check your email</h2>
      <p style={{ fontSize: 13.5, color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
        We sent a confirmation link to {email || "your email"}. Open it on this device to continue —
        it signs you in automatically.
      </p>
      <div
        className="blueprint"
        style={{ padding: 14, display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 24, background: "var(--color-accent-100)" }}
      >
        <Icon name="shieldCheck" size={16} className="text-[var(--color-accent-700)] mt-1" />
        <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>
          Didn&apos;t get it? Check spam, or resend below. The link expires after a while, so request a
          fresh one if it&apos;s been sitting a bit.
        </span>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ minHeight: 44, fontSize: 13.5 }}
        disabled={pending || !email}
        onClick={() =>
          startTransition(async () => {
            const res = await resendConfirmation(email);
            setResendNote(res.error ?? "Sent — check your inbox.");
          })
        }
      >
        {pending ? "SENDING…" : "RESEND EMAIL"}
      </button>
      {resendNote && (
        <p style={{ fontSize: 14, color: "var(--color-neutral-600)", marginTop: 10 }}>{resendNote}</p>
      )}
    </OnboardingShell>
  );
}
