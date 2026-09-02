"use client";

import { useActionState, useState, useTransition } from "react";
import { verifyEmail, resendCode, type ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";

const initialState: ActionState = { error: null };

export function VerifyForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(verifyEmail, initialState);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <OnboardingShell step="STEP 02 / 05" backHref="/signup">
      <h2 style={{ fontSize: 34, margin: "0 0 6px" }}>Verify email</h2>
      <p style={{ fontSize: 13.5, color: "var(--color-neutral-700)", margin: "0 0 30px" }}>
        Six digits sent to {email || "your email"}.
      </p>
      <form action={formAction}>
        <input type="hidden" name="email" value={email} />
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: 18 }}>
          <label>CODE</label>
          <input
            className="input"
            name="token"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 24,
              letterSpacing: ".3em",
              textAlign: "center",
              minHeight: 54,
            }}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginBottom: 18, fontSize: 13 }}
          disabled={pending || !email}
          onClick={() =>
            startTransition(async () => {
              const res = await resendCode(email);
              setResendNote(res.error ?? "Code resent — check your inbox.");
            })
          }
        >
          {pending ? "Resending…" : "Resend code"}
        </button>
        {resendNote && (
          <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", marginTop: -10, marginBottom: 18 }}>
            {resendNote}
          </p>
        )}
        <SubmitButton style={{ minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>VERIFY</SubmitButton>
      </form>
    </OnboardingShell>
  );
}
