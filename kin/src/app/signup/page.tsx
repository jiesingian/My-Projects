"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Icon } from "@/components/icons";

const initialState: ActionState = { error: null };

export default function SignupPage() {
  const [state, formAction] = useActionState(signUp, initialState);

  return (
    <OnboardingShell step="STEP 01 / 05" backHref="/login">
      <h2 style={{ fontSize: 34, margin: "0 0 6px" }}>Your account</h2>
      <p style={{ fontSize: 13.5, color: "var(--color-neutral-700)", margin: "0 0 26px" }}>
        Every member signs in with their own verified email. Children under 13 are added as managed profiles
        instead.
      </p>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: 16 }}>
          <label>EMAIL</label>
          <input className="input" type="email" name="email" required autoComplete="email" />
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>PASSWORD</label>
          <input
            className="input"
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12, color: "var(--color-neutral-700)", marginBottom: 24 }}>
          <Icon name="shieldCheck" size={15} className="text-[var(--color-accent)]" />
          <span>Documents and health records stay in your own connected Drive. Kin stores only the index.</span>
        </div>
        <SubmitButton style={{ minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>
          SEND VERIFICATION CODE
        </SubmitButton>
      </form>
      <p style={{ fontSize: 13, color: "var(--color-neutral-700)", marginTop: 20, textAlign: "center" }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </OnboardingShell>
  );
}
