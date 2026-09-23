"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { updatePasswordAction, type ActionState } from "@/lib/actions/auth";
import { PASSWORD_MIN } from "@/lib/password";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";
import { Icon } from "@/components/icons";

const initialState: ActionState = { error: null };

export function ResetPasswordForm({ email, verified }: { email: string; verified: boolean }) {
  const [state, formAction] = useActionState(updatePasswordAction, initialState);
  const uid = useId();

  return (
    <OnboardingShell backHref="/login">
      <Wordmark />
      <h2 style={{ fontSize: "2rem", margin: "24px 0 6px" }}>Set a new password</h2>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
        {verified ? (
          <>
            For <strong>{email}</strong>. Once it&apos;s set you&apos;ll go straight into Kin.
          </>
        ) : (
          <>
            We emailed a 6-digit code to <strong>{email || "your email"}</strong>. Enter it below
            with the password you want.
          </>
        )}
      </p>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <input type="hidden" name="email" value={email} />

        {/* Only asked for when the emailed link did not sign them in already. */}
        {!verified && (
          <div className="field" style={{ marginBottom: "1rem" }}>
            <label htmlFor={`${uid}-code`}>CODE FROM THE EMAIL</label>
            <input
              id={`${uid}-code`}
              aria-label="Code from the email"
              className="input"
              name="code"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              style={{ fontFamily: "var(--font-numeric)", letterSpacing: ".18em", fontSize: "1.25rem" }}
            />
          </div>
        )}

        <div className="field" style={{ marginBottom: "1rem" }}>
          <label htmlFor={`${uid}-password`}>NEW PASSWORD</label>
          <input
            id={`${uid}-password`}
            aria-label="New password"
            className="input"
            type="password"
            name="password"
            required
            minLength={PASSWORD_MIN}
            autoComplete="new-password"
            autoFocus={verified}
          />
        </div>
        <div className="field" style={{ marginBottom: "1.25rem" }}>
          <label htmlFor={`${uid}-confirm`}>CONFIRM NEW PASSWORD</label>
          <input
            id={`${uid}-confirm`}
            aria-label="Confirm new password"
            className="input"
            type="password"
            name="confirm"
            required
            minLength={PASSWORD_MIN}
            autoComplete="new-password"
          />
        </div>
        <div
          className="blueprint"
          style={{ padding: "0.875rem", display: "flex", gap: "0.625rem", alignItems: "flex-start", marginBottom: "1.5rem", background: "var(--color-accent-100)" }}
        >
          <Icon name="shieldCheck" size={16} className="text-[var(--color-accent-700)] mt-1" />
          <span style={{ fontSize: "0.84375rem", lineHeight: 1.4 }}>
            At least {PASSWORD_MIN} characters. Saving this signs Kin out on your other devices, so
            anyone who had the old password is locked out.
          </span>
        </div>
        <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.9375rem", letterSpacing: ".04em" }}>
          SAVE NEW PASSWORD
        </SubmitButton>
      </form>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "1.25rem", textAlign: "center" }}>
        Code expired? <Link href="/forgot-password">Send a new one</Link>
      </p>
    </OnboardingShell>
  );
}
