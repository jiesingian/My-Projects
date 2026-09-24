"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { signUp, type ActionState } from "@/lib/actions/auth";
import { PASSWORD_MIN } from "@/lib/password";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Icon } from "@/components/icons";

const initialState: ActionState = { error: null };

export default function SignupPage() {
  const [state, formAction] = useActionState(signUp, initialState);
  const uid = useId();

  return (
    <OnboardingShell step="STEP 01 / 05" backHref="/login">
      <h2 style={{ fontSize: "2.125rem", margin: "0 0 6px" }}>Your account</h2>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0 0 26px" }}>
        Kin is invite-only while we build it. Every member signs in with their own verified email. Children
        under 13 are added as managed profiles instead.
      </p>
      <form action={formAction}>
        <ErrorText message={state.error} />
        {/* First field, not last: if the code is wrong there is no reason to
            make them type an email and password before finding out. */}
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label htmlFor={`${uid}-access-code`}>Access code</label>
          <input aria-label="Access Code"
            id={`${uid}-access-code`}
            className="input"
            name="access_code"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="KIN-BETA-XXXXXX"
            style={{ fontFamily: "var(--font-numeric)", letterSpacing: ".02em", textTransform: "uppercase" }}
          />
          <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", display: "block", marginTop: "0.375rem" }}>
            Your household&apos;s invite code works here too.
          </span>
        </div>
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label htmlFor={`${uid}-email`}>Email</label>
          <input id={`${uid}-email`} aria-label="Email" className="input" type="email" name="email" required autoComplete="email" />
        </div>
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label htmlFor={`${uid}-password`}>Password</label>
          <input aria-label="Password"
            id={`${uid}-password`}
            className="input"
            type="password"
            name="password"
            required
            minLength={PASSWORD_MIN}
            autoComplete="new-password"
          />
        </div>
        <div style={{ display: "flex", gap: "0.5625rem", alignItems: "flex-start", fontSize: "0.84375rem", color: "var(--color-neutral-700)", marginBottom: "1.5rem" }}>
          <Icon name="shieldCheck" size={15} className="text-[var(--color-accent)]" />
          <span>Documents and health records stay in your own connected Drive. Kin stores only the index.</span>
        </div>
        <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.9375rem", letterSpacing: ".04em" }}>
          Send verification code
        </SubmitButton>
      </form>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "1.25rem", textAlign: "center" }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </OnboardingShell>
  );
}
