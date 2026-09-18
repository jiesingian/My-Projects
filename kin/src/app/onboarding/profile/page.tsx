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
      <h2 style={{ fontSize: 34, margin: "0 0 22px" }}>Your profile</h2>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor={`${uid}-full-name`}>FULL NAME</label>
          <input id={`${uid}-full-name`} aria-label="Full Name" className="input" name="full_name" required autoFocus style={{ minHeight: 44 }} />
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${uid}-dob`}>DATE OF BIRTH</label>
            <DateInput aria-label="Date Of Birth" id={`${uid}-dob`} className="input" name="dob" style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${uid}-mobile`}>MOBILE</label>
            <input id={`${uid}-mobile`} aria-label="Mobile" className="input" type="tel" name="mobile" placeholder="+63 917 000 0000" style={{ minHeight: 44 }} />
          </div>
        </div>
        <SubmitButton style={{ minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>CONTINUE</SubmitButton>
      </form>
    </OnboardingShell>
  );
}
