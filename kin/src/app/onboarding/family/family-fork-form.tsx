"use client";

import { useActionState } from "react";
import { createFamilyAction, joinFamilyAction } from "@/lib/actions/family";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";

const initialState: ActionState = { error: null };

export function FamilyForkForm({
  fullName,
  dob,
  mobile,
}: {
  fullName: string;
  dob: string;
  mobile: string;
}) {
  const [createState, createAction] = useActionState(createFamilyAction, initialState);
  const [joinState, joinAction] = useActionState(joinFamilyAction, initialState);

  return (
    <OnboardingShell step="STEP 04 / 05" backHref="/onboarding/profile">
      <h2 style={{ fontSize: 34, margin: "0 0 6px" }}>Family group</h2>
      <p style={{ fontSize: 13.5, color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
        One group per household. Everything in Kin belongs to it.
      </p>

      <form action={createAction}>
        <input type="hidden" name="full_name" value={fullName} />
        <input type="hidden" name="dob" value={dob} />
        <input type="hidden" name="mobile" value={mobile} />
        <Blueprint
          className="bg-[var(--color-accent-100)] mb-4"
          style={{ padding: 20 }}
        >
          <Icon name="housePlus" size={22} className="text-[var(--color-accent-700)]" />
          <span style={{ font: "600 22px/1.1 var(--font-heading)", display: "block", margin: "9px 0 10px" }}>
            Create a family
          </span>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>HOUSEHOLD NAME</label>
            <input className="input" name="household_name" placeholder="The Reyes Household" required style={{ minHeight: 44 }} />
          </div>
          <ErrorText message={createState.error} />
          <SubmitButton className="btn btn-primary btn-block" style={{ minHeight: 44 }}>
            CREATE HOUSEHOLD
          </SubmitButton>
        </Blueprint>
      </form>

      <form action={joinAction}>
        <input type="hidden" name="full_name" value={fullName} />
        <input type="hidden" name="dob" value={dob} />
        <input type="hidden" name="mobile" value={mobile} />
        <Blueprint style={{ padding: 20 }}>
          <Icon name="keyRound" size={22} className="text-[var(--color-accent-700)]" />
          <span style={{ font: "600 22px/1.1 var(--font-heading)", display: "block", margin: "9px 0 4px" }}>
            Join with a code
          </span>
          <span style={{ fontSize: 12.5, color: "var(--color-neutral-700)", display: "block", marginBottom: 14 }}>
            Ask the organiser for the six-character invite code.
          </span>
          <ErrorText message={joinState.error} />
          <div style={{ display: "flex", gap: 9 }}>
            <input
              className="input"
              name="invite_code"
              placeholder="A7K-2QD"
              required
              style={{
                minHeight: 44,
                fontFamily: "ui-monospace, Menlo, monospace",
                letterSpacing: ".14em",
                textTransform: "uppercase",
              }}
            />
            <SubmitButton className="btn btn-secondary" style={{ minHeight: 44, paddingInline: 16 }}>
              JOIN
            </SubmitButton>
          </div>
        </Blueprint>
      </form>

      <div style={{ marginTop: "auto", fontSize: 11.5, color: "var(--color-neutral-600)", display: "flex", gap: 8, paddingTop: 20 }}>
        <Icon name="info" size={14} className="text-[var(--color-accent)]" />
        <span>You can be in one family group at a time. Organisers can transfer the role later.</span>
      </div>
    </OnboardingShell>
  );
}
