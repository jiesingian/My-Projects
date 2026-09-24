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
      <h2 style={{ fontSize: "2.125rem", margin: "0 0 6px" }}>Check your email</h2>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
        We sent a confirmation link to {email || "your email"}. Open it on this device to continue —
        it signs you in automatically.
      </p>
      <div
        className="blueprint"
        style={{ padding: "0.875rem", display: "flex", gap: "0.625rem", alignItems: "flex-start", marginBottom: "1.5rem", background: "var(--color-accent-100)" }}
      >
        <Icon name="shieldCheck" size={16} className="text-[var(--color-accent-700)] mt-1" />
        <span style={{ fontSize: "0.84375rem", lineHeight: 1.4 }}>
          Didn&apos;t get it? Check spam, or resend below. The link expires after a while, so request a
          fresh one if it&apos;s been sitting a bit.
        </span>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ minHeight: "2.75rem", fontSize: "0.84375rem" }}
        disabled={pending || !email}
        onClick={() =>
          startTransition(async () => {
            const res = await resendConfirmation(email);
            setResendNote(res.error ?? "Sent — check your inbox.");
          })
        }
      >
        {pending ? "Sending…" : "Resend email"}
      </button>
      {resendNote && (
        <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>{resendNote}</p>
      )}
    </OnboardingShell>
  );
}
