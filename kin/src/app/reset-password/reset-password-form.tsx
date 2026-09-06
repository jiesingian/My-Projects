"use client";

import { useActionState } from "react";
import { updatePasswordAction, type ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";
import { Icon } from "@/components/icons";

const initialState: ActionState = { error: null };

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(updatePasswordAction, initialState);

  return (
    <OnboardingShell>
      <Wordmark />
      <h2 style={{ fontSize: 32, margin: "24px 0 6px" }}>Set a new password</h2>
      <p style={{ fontSize: 13.5, color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
        For <strong>{email}</strong>. Once it&apos;s set you&apos;ll go straight into Kin.
      </p>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: 16 }}>
          <label>NEW PASSWORD</label>
          <input
            aria-label="New password"
            className="input"
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
          />
        </div>
        <div className="field" style={{ marginBottom: 20 }}>
          <label>CONFIRM NEW PASSWORD</label>
          <input
            aria-label="Confirm new password"
            className="input"
            type="password"
            name="confirm"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div
          className="blueprint"
          style={{ padding: 14, display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 24, background: "var(--color-accent-100)" }}
        >
          <Icon name="shieldCheck" size={16} className="text-[var(--color-accent-700)] mt-1" />
          <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>
            At least 8 characters. Saving this signs Kin out on your other devices, so anyone who
            had the old password is locked out.
          </span>
        </div>
        <SubmitButton style={{ minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>
          SAVE NEW PASSWORD
        </SubmitButton>
      </form>
    </OnboardingShell>
  );
}
