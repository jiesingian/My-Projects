"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";

const initialState: ActionState = { error: null };

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, initialState);

  return (
    <OnboardingShell backHref="/login">
      <Wordmark />
      <h2 style={{ fontSize: 32, margin: "24px 0 6px" }}>Forgot your password</h2>
      <p style={{ fontSize: 13.5, color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
        Tell us the email you sign in with and we&apos;ll send a code to set a new password.
      </p>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: 24 }}>
          <label>EMAIL</label>
          <input aria-label="Email" className="input" type="email" name="email" required autoComplete="email" autoFocus />
        </div>
        <SubmitButton style={{ minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>
          SEND RESET CODE
        </SubmitButton>
      </form>
      <p style={{ fontSize: 13, color: "var(--color-neutral-700)", marginTop: 20, textAlign: "center" }}>
        Remembered it? <Link href="/login">Sign in</Link>
      </p>
    </OnboardingShell>
  );
}
