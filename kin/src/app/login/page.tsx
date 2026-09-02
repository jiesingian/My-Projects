"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";

const initialState: ActionState = { error: null };

export default function LoginPage() {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <OnboardingShell>
      <Wordmark />
      <p style={{ fontSize: 14, color: "var(--color-neutral-700)", margin: "14px 0 30px", maxWidth: "26ch" }}>
        One household, five ledgers. Sign in to your family.
      </p>
      <h2 style={{ fontSize: 32, margin: "0 0 20px" }}>Welcome back</h2>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: 16 }}>
          <label>EMAIL</label>
          <input className="input" type="email" name="email" required autoComplete="email" />
        </div>
        <div className="field" style={{ marginBottom: 24 }}>
          <label>PASSWORD</label>
          <input className="input" type="password" name="password" required autoComplete="current-password" />
        </div>
        <SubmitButton style={{ minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>SIGN IN</SubmitButton>
      </form>
      <p style={{ fontSize: 13, color: "var(--color-neutral-700)", marginTop: 20, textAlign: "center" }}>
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </OnboardingShell>
  );
}
