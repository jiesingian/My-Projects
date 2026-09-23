"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { signIn, type ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";

const initialState: ActionState = { error: null };

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  confirmation_failed: "That confirmation link didn't work — it may have expired. Try signing in, or request a new one from the sign-up page.",
};

export function LoginForm({ callbackError }: { callbackError?: string }) {
  const [state, formAction] = useActionState(signIn, initialState);
  const uid = useId();

  return (
    <OnboardingShell>
      <Wordmark />
      <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)", margin: "14px 0 30px", maxWidth: "26ch" }}>
        One household, five ledgers. Sign in to your family.
      </p>
      <h2 style={{ fontSize: "2rem", margin: "0 0 20px" }}>Welcome back</h2>
      {callbackError && <ErrorText message={CALLBACK_ERROR_MESSAGES[callbackError] ?? "Something went wrong — please try again."} />}
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label htmlFor={`${uid}-email`}>EMAIL</label>
          <input id={`${uid}-email`} aria-label="Email" className="input" type="email" name="email" required autoComplete="email" />
        </div>
        <div className="field" style={{ marginBottom: "0.625rem" }}>
          <label htmlFor={`${uid}-password`}>PASSWORD</label>
          <input id={`${uid}-password`} aria-label="Password" className="input" type="password" name="password" required autoComplete="current-password" />
        </div>
        {/* Directly under the password, which is where it gets looked for the
            moment one fails. */}
        <p style={{ fontSize: "0.8125rem", textAlign: "right", margin: "0 0 22px" }}>
          <Link href="/forgot-password">Forgot your password?</Link>
        </p>
        <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.9375rem", letterSpacing: ".04em" }}>SIGN IN</SubmitButton>
      </form>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "1.25rem", textAlign: "center" }}>
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </OnboardingShell>
  );
}
