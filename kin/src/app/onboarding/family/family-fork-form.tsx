"use client";

import { useActionState, useId } from "react";
import { createFamilyAction, joinFamilyAction } from "@/lib/actions/family";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";

const initialState: ActionState = { error: null };

export function FamilyForkForm({
  fullName,
  dob,
  mobile,
  inviteCode = "",
}: {
  fullName: string;
  dob: string;
  mobile: string;
  /** From an invite link; fills the join code and puts joining first. */
  inviteCode?: string;
}) {
  const [createState, createAction] = useActionState(createFamilyAction, initialState);
  const [joinState, joinAction] = useActionState(joinFamilyAction, initialState);
  const uid = useId();

  const joinForm = (
        <form action={joinAction}>
          <input type="hidden" name="full_name" value={fullName} />
          <input type="hidden" name="dob" value={dob} />
          <input type="hidden" name="mobile" value={mobile} />
          <Blueprint className={inviteCode ? "bg-[var(--color-accent-100)] mb-4" : undefined} style={{ padding: "1.25rem" }}>
            <Icon name="keyRound" size={22} className="text-[var(--color-accent-700)]" />
            <span style={{ font: "600 1.375rem/1.1 var(--font-heading)", display: "block", margin: "9px 0 4px" }}>
              Join with a code
            </span>
            <span style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)", display: "block", marginBottom: "0.875rem" }}>
              {inviteCode ? "You were invited. The code is filled in; tap Join." : "Ask the organizer for the six-character invite code."}
            </span>
            <ErrorText message={joinState.error} />
            <div style={{ display: "flex", gap: "0.5625rem" }}>
              <input
                className="input"
                name="invite_code"
                aria-label="Invite code"
                defaultValue={inviteCode}
                placeholder="A7K-2QD"
                required
                style={{
                  minHeight: "2.75rem",
                  fontFamily: "var(--font-numeric)",
                  letterSpacing: ".02em",
                  textTransform: "uppercase",
                }}
              />
              <SubmitButton className="btn btn-secondary" style={{ minHeight: "2.75rem", paddingInline: "1rem" }}>
                Join
              </SubmitButton>
            </div>
          </Blueprint>
        </form>
  );

  return (
    <OnboardingShell step="STEP 04 / 05" backHref="/onboarding/profile">
      <h2 style={{ fontSize: "2.125rem", margin: "0 0 6px" }}>Family group</h2>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0 0 24px" }}>
        One group per household. Everything in Kin belongs to it.
      </p>

      {inviteCode && joinForm}
      <form action={createAction}>
        <input type="hidden" name="full_name" value={fullName} />
        <input type="hidden" name="dob" value={dob} />
        <input type="hidden" name="mobile" value={mobile} />
        <Blueprint
          className="bg-[var(--color-accent-100)] mb-4"
          style={{ padding: "1.25rem" }}
        >
          <Icon name="housePlus" size={22} className="text-[var(--color-accent-700)]" />
          <span style={{ font: "600 1.375rem/1.1 var(--font-heading)", display: "block", margin: "9px 0 10px" }}>
            Create a family
          </span>
          <div className="field" style={{ marginBottom: "0.75rem" }}>
            <label htmlFor={`${uid}-household-name`}>Household name</label>
            <input id={`${uid}-household-name`} aria-label="Household Name" className="input" name="household_name" placeholder="The Reyes Household" required style={{ minHeight: "2.75rem" }} />
          </div>
          {/* One setting the household won't have to find its way to Settings
              for afterward -- it's used from the first account someone adds.
              Change it later same as currency; it never changes on its own
              just because a phone traveled. */}
          <div className="field" style={{ marginBottom: "0.75rem" }}>
            <label htmlFor={`${uid}-country`}>Country</label>
            <select id={`${uid}-country`} aria-label="Country" className="input" name="country" defaultValue={DEFAULT_COUNTRY} style={{ minHeight: "2.75rem" }}>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {/* Starting a household is the one step a family invite code does
              not open — that code brings you into an existing family below. */}
          <div className="field" style={{ marginBottom: "0.75rem" }}>
            <label htmlFor={`${uid}-access-code`}>Access code</label>
            <input aria-label="Access Code"
              id={`${uid}-access-code`}
              className="input"
              name="access_code"
              placeholder="KIN-BETA-XXXXXX"
              required
              autoComplete="off"
              spellCheck={false}
              style={{
                minHeight: "2.75rem",
                fontFamily: "var(--font-numeric)",
                letterSpacing: ".02em",
                textTransform: "uppercase",
              }}
            />
          </div>
          <ErrorText message={createState.error} />
          <SubmitButton className="btn btn-primary btn-block" style={{ minHeight: "2.75rem" }}>
            Create household
          </SubmitButton>
        </Blueprint>
      </form>


      {!inviteCode && joinForm}

      <div style={{ marginTop: "auto", fontSize: "0.8125rem", color: "var(--color-neutral-600)", display: "flex", gap: "0.5rem", paddingTop: "1.25rem" }}>
        <Icon name="info" size={14} className="text-[var(--color-accent)]" />
        <span>You can be in one family group at a time. Organizers can transfer the role later.</span>
      </div>
    </OnboardingShell>
  );
}
