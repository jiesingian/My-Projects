"use client";

import { useActionState } from "react";
import { saveProfile } from "@/lib/actions/family";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";

const initialState: ActionState = { error: null };

export default function ProfilePage() {
  const [state, formAction] = useActionState(saveProfile, initialState);

  return (
    <OnboardingShell step="STEP 03 / 05">
      <h2 style={{ fontSize: 34, margin: "0 0 22px" }}>Your profile</h2>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <div className="field" style={{ marginBottom: 14 }}>
          <label>FULL NAME</label>
          <input className="input" name="full_name" required autoFocus style={{ minHeight: 44 }} />
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>DATE OF BIRTH</label>
            <input className="input" type="date" name="dob" style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>MOBILE</label>
            <input className="input" type="tel" name="mobile" placeholder="+63 917 000 0000" style={{ minHeight: 44 }} />
          </div>
        </div>
        <SubmitButton style={{ minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>CONTINUE</SubmitButton>
      </form>
    </OnboardingShell>
  );
}
