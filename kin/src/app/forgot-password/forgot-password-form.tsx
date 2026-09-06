"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";
import { Icon } from "@/components/icons";

const initialState: ActionState = { error: null };

export function ForgotPasswordForm({ sentTo }: { sentTo: string | null }) {
  const [state, formAction] = useActionState(requestPasswordReset, initialState);

  // Said the same way whether or not that address has an account — the page is
  // open to anyone, and who is in a family is the family's business.
  if (sentTo) {
    return (
      <OnboardingShell backHref="/login">
        <Wordmark />
        <h2 style={{ fontSize: 32, margin: "24px 0 6px" }}>Check your email</h2>
        <p style={{ fontSize: 13.5, color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
          If <strong>{sentTo}</strong> has an account, a link to set a new password is on its way.
          Open it on this device.
        </p>
        <div
          className="blueprint"
          style={{ padding: 14, display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 24, background: "var(--color-accent-100)" }}
        >
          <Icon name="shieldCheck" size={16} className="text-[var(--color-accent-700)] mt-1" />
          <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>
            The link works once and expires before long, so ask for a fresh one if it has been
            sitting a while. Nothing changes until you set the new password.
          </span>
        </div>
        <Link
          href="/forgot-password"
          className="btn btn-secondary btn-block"
          style={{ minHeight: 44, fontSize: 13.5, letterSpacing: ".04em" }}
        >
          SEND ANOTHER
        </Link>
        <p style={{ fontSize: 13, color: "var(--color-neutral-700)", marginTop: 20, textAlign: "center" }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell backHref="/login">
      <Wordmark />
      <h2 style={{ fontSize: 32, margin: "24px 0 6px" }}>Forgot your password</h2>
      <p style={{ fontSize: 13.5, color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
        Tell us the email you sign in with and we&apos;ll send a link to set a new one.
      </p>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: 24 }}>
          <label>EMAIL</label>
          <input aria-label="Email" className="input" type="email" name="email" required autoComplete="email" autoFocus />
        </div>
        <SubmitButton style={{ minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>
          SEND RESET LINK
        </SubmitButton>
      </form>
      <p style={{ fontSize: 13, color: "var(--color-neutral-700)", marginTop: 20, textAlign: "center" }}>
        Remembered it? <Link href="/login">Sign in</Link>
      </p>
    </OnboardingShell>
  );
}
