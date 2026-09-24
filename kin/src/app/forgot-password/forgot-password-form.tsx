"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { requestPasswordReset, type ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";

const initialState: ActionState = { error: null };

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, initialState);
  const uid = useId();

  return (
    <OnboardingShell backHref="/login">
      <Wordmark />
      <h2 style={{ fontSize: "2rem", margin: "24px 0 6px" }}>Forgot your password</h2>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
        Tell us the email you sign in with and we&apos;ll send a code to set a new password.
      </p>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: "1.5rem" }}>
          <label htmlFor={`${uid}-email`}>Email</label>
          <input id={`${uid}-email`} aria-label="Email" className="input" type="email" name="email" required autoComplete="email" autoFocus />
        </div>
        <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.9375rem", letterSpacing: ".04em" }}>
          Send reset code
        </SubmitButton>
      </form>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "1.25rem", textAlign: "center" }}>
        Remembered it? <Link href="/login">Sign in</Link>
      </p>
    </OnboardingShell>
  );
}
