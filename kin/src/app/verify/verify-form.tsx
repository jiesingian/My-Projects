"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { resendConfirmation, verifySignupCode, type ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Icon } from "@/components/icons";

const initialState: ActionState = { error: null };

/** The second half of sign-up: the 6-digit code from the email, typed on the
 * screen the person is already on. Shown by /signup once the email is sent,
 * and by /verify for anyone holding an older link to that page. */
export function CodeEntry({ email, onChangeEmail }: { email: string; onChangeEmail?: () => void }) {
  const [state, formAction] = useActionState(verifySignupCode, initialState);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [resending, startResend] = useTransition();
  const uid = useId();

  return (
    <>
      <h2 style={{ fontSize: "2.125rem", margin: "0 0 6px" }}>Check your email</h2>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0 0 20px" }}>
        We sent a 6-digit code to <strong>{email || "your email"}</strong>. Type it here to confirm it&apos;s you.
      </p>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <input type="hidden" name="email" value={email} />
        <div className="field" style={{ marginBottom: "1rem" }}>
          <label htmlFor={`${uid}-code`}>Code from the email</label>
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
            style={{ fontFamily: "var(--font-numeric)", letterSpacing: ".18em", fontSize: "1.25rem", minHeight: "2.875rem" }}
          />
        </div>
        <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.9375rem", letterSpacing: ".04em" }}>Confirm</SubmitButton>
      </form>
      <div
        className="blueprint"
        style={{ padding: "0.875rem", display: "flex", gap: "0.625rem", alignItems: "flex-start", margin: "1.25rem 0 1rem", background: "var(--color-accent-100)" }}
      >
        <Icon name="shieldCheck" size={16} className="text-[var(--color-accent-700)] mt-1" />
        {/* The email carries only a link until the "Confirm signup" template
            is switched to show the code. The link still confirms the account
            wherever it opens, and signing in afterwards works from here. */}
        <span style={{ fontSize: "0.84375rem", lineHeight: 1.4 }}>
          Didn&apos;t get it? Check spam, or send a new one below. If the email has a button instead of a
          code, tap it, then come back and sign in.
        </span>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ minHeight: "2.75rem", fontSize: "0.84375rem" }}
        disabled={resending || !email}
        onClick={() =>
          startResend(async () => {
            const res = await resendConfirmation(email);
            setResendNote(res.error ?? "Sent. Check your inbox.");
          })
        }
      >
        {resending ? "Sending…" : "Send a new code"}
      </button>
      {resendNote && (
        <p role="status" style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>{resendNote}</p>
      )}
      {onChangeEmail && (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "1.25rem", textAlign: "center" }}>
          Wrong email?{" "}
          <button type="button" onClick={onChangeEmail} style={{ background: "none", border: 0, padding: 0, color: "var(--color-accent-700)", textDecoration: "underline", font: "inherit", cursor: "pointer" }}>
            Change it
          </button>
        </p>
      )}
    </>
  );
}

export function VerifyForm({ email }: { email: string }) {
  return (
    <OnboardingShell step="STEP 02 / 05" backHref="/signup">
      <CodeEntry email={email} />
    </OnboardingShell>
  );
}
