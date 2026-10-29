"use client";

import { startTransition, useActionState, useId, useState } from "react";
import Link from "next/link";
import { signUp, type SignUpState } from "@/lib/actions/auth";
import { PASSWORD_MIN } from "@/lib/password";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Icon } from "@/components/icons";
import { CodeEntry } from "@/app/verify/verify-form";

const initialState: SignUpState = { error: null };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signUp, initialState);
  const uid = useId();
  // "Wrong email? Change it" brings the form back with what was typed still
  // in it (it stays mounted, hidden), and sending again shows the code box.
  const [changing, setChanging] = useState(false);
  const sentTo = !changing && !pending ? state.sentTo : undefined;

  return (
    <OnboardingShell step={sentTo ? "STEP 02 / 03" : "STEP 01 / 03"} backHref="/login">
      {sentTo && <CodeEntry key={sentTo} email={sentTo} onChangeEmail={() => setChanging(true)} />}
      <div hidden={!!sentTo}>
      <h2 style={{ fontSize: "2.125rem", margin: "0 0 6px" }}>Your account</h2>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0 0 26px" }}>
        Your own account first: every member signs in with their own verified email. Next you start your
        family or join one with its invite code. A child can join the same way; a parent approves them, and they start in kid view.
      </p>
      {/* Submitted from onSubmit rather than action= because React resets a
          form after its action runs, and on an error -- the mailer's hourly
          cap, most often -- that wiped the email and password the person had
          just typed, when trying again is all they need to do. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setChanging(false);
          startTransition(() => formAction(data));
        }}
      >
        <ErrorText message={state.error} />
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
          <span>Your household is walled off from every other one. Connect Google Drive and your documents and photos are kept there.</span>
        </div>
        {/* Ticked by the person, never for them (E-Commerce Act; NPC Circular
            2023-04: no pre-ticked consent). signUp refuses without it and
            records which version was agreed to, and when. */}
        <label className="kin-agree">
          <input type="checkbox" name="accept_terms" required />
          <span>
            I agree to the <Link href="/legal/terms">terms</Link> and have read the{" "}
            <Link href="/legal/privacy">privacy notice</Link>.
          </span>
        </label>
        <SubmitButton pending={pending} style={{ minHeight: "2.875rem", fontSize: "0.9375rem", letterSpacing: ".04em" }}>
          Send verification code
        </SubmitButton>
      </form>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "1.25rem", textAlign: "center" }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
      </div>
    </OnboardingShell>
  );
}
