"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { redeemCodeForHouseholdAction } from "@/lib/actions/billing";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PLAN_LIST, pesos, perMonth } from "@/lib/billing/plans";
import type { AccessStatus } from "@/lib/access";

const initialState: ActionState = { error: null };

function standing(status: AccessStatus, daysLeft: number | null): string {
  switch (status) {
    case "comped":
      return "Your household has Kin for free.";
    case "active":
      return daysLeft === null ? "Your subscription is active." : `Your subscription renews in ${daysLeft} days.`;
    case "trialing":
      return daysLeft === null ? "You're on a trial." : `${daysLeft} days left on your trial.`;
    case "past_due":
      return "The last payment didn't go through. Kin still works — update the payment to keep it that way.";
    case "expired":
      return "Your access has ended. Everything you've put in is still here, waiting.";
  }
}

export function SubscribeScreen({
  householdName,
  isOrganiser,
  status,
  daysLeft,
  allowed,
}: {
  householdName: string;
  isOrganiser: boolean;
  status: AccessStatus;
  daysLeft: number | null;
  allowed: boolean;
}) {
  const [state, formAction] = useActionState(redeemCodeForHouseholdAction, initialState);
  const uid = useId();

  return (
    <OnboardingShell backHref={allowed ? "/today" : undefined}>
      <Wordmark />
      <h2 style={{ fontSize: 30, margin: "24px 0 6px" }}>{allowed ? "Your plan" : "Kin needs a plan"}</h2>
      <p style={{ fontSize: 13.5, color: "var(--color-neutral-700)", margin: "0 0 20px" }}>
        {householdName} — {standing(status, daysLeft)}
      </p>

      {/* Paying is the organizer's job; everyone else is told who to ask
          rather than shown a button that will not work for them. */}
      {!isOrganiser ? (
        <Blueprint style={{ padding: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
            Ask the organizer of your household to sort the plan out. Once they do, Kin comes back
            for everyone at once — nothing you&apos;ve added is lost in the meantime.
          </p>
        </Blueprint>
      ) : (
        <>
          {PLAN_LIST.map((plan) => (
            <Blueprint key={plan.id} style={{ padding: 16, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ font: "600 20px/1.1 var(--font-heading)" }}>{plan.name}</span>
                <span style={{ marginLeft: "auto", font: "600 20px/1.1 var(--font-heading)" }}>
                  {pesos(plan.amountCents)}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--color-neutral-600)", margin: "6px 0 0" }}>
                {plan.blurb}
                {plan.months > 1 && ` That's ${perMonth(plan)} a month.`}
              </p>
            </Blueprint>
          ))}

          <Blueprint style={{ padding: 14, marginBottom: 20, background: "var(--color-accent-100)", display: "flex", gap: 10 }}>
            <Icon name="info" size={16} className="text-[var(--color-accent-700)] mt-1" />
            <span style={{ fontSize: 13.5, lineHeight: 1.4 }}>
              Card and e-wallet payment isn&apos;t switched on yet. Until it is, a code is the way
              in — enter one below.
            </span>
          </Blueprint>

          <form action={formAction}>
            <ErrorText message={state.error} />
            <div className="field" style={{ marginBottom: 14 }}>
              <label htmlFor={`${uid}-code`}>ACCESS CODE</label>
              <input
                id={`${uid}-code`}
                aria-label="Access code"
                className="input"
                name="code"
                required
                autoComplete="off"
                spellCheck={false}
                placeholder="KIN-BETA-XXXXXX"
                style={{ fontFamily: "var(--font-numeric)", letterSpacing: ".02em", textTransform: "uppercase" }}
              />
            </div>
            <SubmitButton style={{ minHeight: 46, fontSize: 15, letterSpacing: ".04em" }}>
              USE THIS CODE
            </SubmitButton>
          </form>
        </>
      )}

      <p style={{ fontSize: 13, color: "var(--color-neutral-700)", marginTop: 22, textAlign: "center" }}>
        {allowed ? <Link href="/today">Back to Kin</Link> : <Link href="/settings">Settings</Link>}
      </p>
    </OnboardingShell>
  );
}
