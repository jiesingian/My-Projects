"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { createFamilyAction, joinFamilyAction } from "@/lib/actions/family";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell } from "@/components/onboarding-shell";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
import { PLANS, pesos } from "@/lib/billing/plans";
import { TRIAL_DAYS } from "@/lib/access";
import { readFirstOpen, type ChosenPlan } from "@/lib/first-open";

const initialState: ActionState = { error: null };

const numericCode = {
  minHeight: "2.75rem",
  fontFamily: "var(--font-numeric)",
  letterSpacing: ".02em",
  textTransform: "uppercase",
} as const;

/** The least setup (agreed 13 October): your name and a family name, then
 * Today. Country is folded away (the Philippines unless changed) and a Kin
 * code is tucked away as before. Birthday, mobile, the surname suggestion and
 * the members screen left the path: adding the kids and inviting a partner
 * are Start here steps, and the surname suggestion is in Settings beside the
 * household name.
 *
 * The name box sits above both forms and rides into whichever is sent, so
 * joining with an invite code asks for nothing else. */
export function SetupForm({ inviteCode = "" }: { inviteCode?: string }) {
  const [createState, createAction] = useActionState(createFamilyAction, initialState);
  const [joinState, joinAction] = useActionState(joinFamilyAction, initialState);
  const [fullName, setFullName] = useState("");
  const uid = useId();
  // The plan picked on the public plan step, if this browser went through it.
  // Read after load (localStorage is the browser's), so the server-rendered
  // form and the browser's agree; nothing at all when it was skipped.
  const [plan, setPlan] = useState<ChosenPlan | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage, read once after hydration
    setPlan(readFirstOpen()?.plan ?? null);
  }, []);

  const joinForm = (
    <form action={joinAction}>
      <input type="hidden" name="full_name" value={fullName} />
      <Blueprint className="bg-[var(--color-accent-100)] mb-4" style={{ padding: "1.25rem" }}>
        <Icon name="keyRound" size={22} className="text-[var(--color-accent-700)]" />
        <span style={{ font: "600 1.375rem/1.1 var(--font-heading)", display: "block", margin: "9px 0 4px" }}>Join your family</span>
        <span style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)", display: "block", marginBottom: "0.875rem" }}>
          You were invited. The code is filled in; tap Join.
        </span>
        <ErrorText message={joinState.error} />
        <div style={{ display: "flex", gap: "0.5625rem" }}>
          <input className="input" name="invite_code" aria-label="Invite code" defaultValue={inviteCode} placeholder="A7K-2QD" required style={numericCode} />
          <SubmitButton className="btn btn-primary" style={{ minHeight: "2.75rem", paddingInline: "1rem" }}>
            Join
          </SubmitButton>
        </div>
      </Blueprint>
    </form>
  );

  return (
    <OnboardingShell step="STEP 03 / 03">
      <h2 style={{ fontSize: "2.125rem", margin: "0 0 6px" }}>Set up Kin</h2>
      <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)", margin: "0 0 18px" }}>
        Two names and you&apos;re in. Everything else can wait.
      </p>

      <div className="field" style={{ marginBottom: "1.125rem" }}>
        <label htmlFor={`${uid}-full-name`}>Your name</label>
        <input
          id={`${uid}-full-name`}
          aria-label="Your name"
          className="input"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          autoFocus
          required
          style={{ minHeight: "2.75rem" }}
        />
      </div>

      {inviteCode && joinForm}

      <form action={createAction}>
        <input type="hidden" name="full_name" value={fullName} />
        <input type="hidden" name="chosen_plan" value={plan ?? ""} />
        <Blueprint className={inviteCode ? "mb-4" : "bg-[var(--color-accent-100)] mb-4"} style={{ padding: "1.25rem" }}>
          {inviteCode && (
            <span style={{ font: "600 1.125rem/1.1 var(--font-heading)", display: "block", marginBottom: "10px" }}>Or start your own family</span>
          )}
          <div className="field" style={{ marginBottom: "0.75rem" }}>
            <label htmlFor={`${uid}-household-name`}>Family name</label>
            <input id={`${uid}-household-name`} aria-label="Family name" className="input" name="household_name" placeholder="The Reyes Family" required style={{ minHeight: "2.75rem" }} />
          </div>
          {/* Folded away with the Philippines chosen: most families never
              open it. It is used from the first account someone adds, and
              can be changed in Settings like currency. */}
          <details className="kin-code-optional" style={{ marginBottom: "0.25rem" }}>
            <summary>Not in the Philippines?</summary>
            <div className="field" style={{ margin: "0.25rem 0 0.5rem" }}>
              <label htmlFor={`${uid}-country`}>Country</label>
              <select id={`${uid}-country`} aria-label="Country" className="input" name="country" defaultValue={DEFAULT_COUNTRY} style={{ minHeight: "2.75rem" }}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </details>
          {/* Optional since open sign-up (28 September): a new family starts
              on a 7-day Kin Plus trial by itself. A Kin code -- a gift or a
              tester's -- is tucked away rather than asked for. Not in the
              iPhone app, where Kin may not unlock Plus with its own codes
              (lib/ios-app.ts). */}
          <details className="kin-code-optional kin-web-only" style={{ marginBottom: "0.75rem" }}>
            <summary>Have a Kin code?</summary>
            <div className="field" style={{ marginTop: "0.5rem" }}>
              <label htmlFor={`${uid}-access-code`}>Kin code (optional)</label>
              <input aria-label="Access Code" id={`${uid}-access-code`} className="input" name="access_code" placeholder="KIN-XXXXXX" autoComplete="off" spellCheck={false} style={numericCode} />
            </div>
          </details>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "0 0 0.75rem" }}>
            {plan === "free" ? (
              <>Kin Free, as you chose, with {TRIAL_DAYS} days of the Plus extras to try first. No card, nothing to cancel.</>
            ) : (
              <>
                Starts with {TRIAL_DAYS} days of Kin Plus, free. No card. After that, Kin Free for good
                <span className="kin-web-only">, or Plus for {pesos(PLANS.monthly.amountCents)} a month if you choose it</span>.
              </>
            )}
          </p>
          <ErrorText message={createState.error} />
          <SubmitButton className={inviteCode ? "btn btn-secondary btn-block" : "btn btn-primary btn-block"} style={{ minHeight: "2.875rem" }}>
            Create family
          </SubmitButton>
        </Blueprint>
      </form>

      {/* Without an invite link, joining is the rarer case: tucked away like
          the Kin code, one tap to open. */}
      {!inviteCode && (
        <details className="kin-code-optional">
          <summary>Joining a family? Enter its invite code</summary>
          <form action={joinAction} style={{ marginTop: "0.5rem" }}>
            <input type="hidden" name="full_name" value={fullName} />
            <span style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)", display: "block", marginBottom: "0.625rem" }}>
              Ask whoever set it up for the six-character invite code.
            </span>
            <ErrorText message={joinState.error} />
            <div style={{ display: "flex", gap: "0.5625rem" }}>
              <input className="input" name="invite_code" aria-label="Invite code" placeholder="A7K-2QD" required style={numericCode} />
              <SubmitButton className="btn btn-secondary" style={{ minHeight: "2.75rem", paddingInline: "1rem" }}>
                Join
              </SubmitButton>
            </div>
          </form>
        </details>
      )}

      <div style={{ marginTop: "auto", fontSize: "0.8125rem", color: "var(--color-neutral-600)", display: "flex", gap: "0.5rem", paddingTop: "1.25rem" }}>
        <Icon name="info" size={14} className="text-[var(--color-accent)]" />
        <span>You&apos;re in one household at a time. Your own journal and notes are yours, and come with you if you later start a household of your own.</span>
      </div>
    </OnboardingShell>
  );
}
