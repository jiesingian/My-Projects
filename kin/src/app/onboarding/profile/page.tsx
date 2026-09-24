"use client";

import { useActionState, useId } from "react";
import { saveProfile } from "@/lib/actions/family";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";
import { DateInput } from "@/components/date-input";

const initialState: ActionState = { error: null };

export default function ProfilePage() {
  const [state, formAction] = useActionState(saveProfile, initialState);
  const uid = useId();

  return (
    <OnboardingShell step="STEP 03 / 05">
      <h2 style={{ fontSize: "2.125rem", margin: "0 0 22px" }}>Your profile</h2>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: "0.875rem" }}>
          <label htmlFor={`${uid}-full-name`}>Full name</label>
          <input id={`${uid}-full-name`} aria-label="Full Name" className="input" name="full_name" required autoFocus style={{ minHeight: "2.75rem" }} />
        </div>
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.125rem" }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${uid}-dob`}>Date of birth</label>
            <DateInput aria-label="Date Of Birth" id={`${uid}-dob`} className="input" name="dob" style={{ minHeight: "2.75rem" }} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${uid}-mobile`}>Mobile</label>
            <input id={`${uid}-mobile`} aria-label="Mobile" className="input" type="tel" name="mobile" placeholder="+63 917 000 0000" style={{ minHeight: "2.75rem" }} />
          </div>
        </div>
        <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.9375rem", letterSpacing: ".04em" }}>Continue</SubmitButton>
      </form>
    </OnboardingShell>
  );
}
