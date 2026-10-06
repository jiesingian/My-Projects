"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import { redeemCodeForHouseholdAction } from "@/lib/actions/billing";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { OnboardingShell, Wordmark } from "@/components/onboarding-shell";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PLANS, pesos, perMonth } from "@/lib/billing/plans";
import type { AccessStatus, Plan } from "@/lib/access";
import { FREE_FEATURES, PLUS_FEATURES } from "@/lib/plan-features";

const initialState: ActionState = { error: null };

function standing(status: AccessStatus, plan: Plan, trialing: boolean, daysLeft: number | null): string {
  if (status === "comped") return "Your household has Kin Plus for free, for good.";
  if (trialing) return daysLeft === 1 ? "Your Kin Plus trial ends today." : `Kin Plus trial: ${daysLeft} days left. After that you move to Kin Free, and nothing you've added is lost.`;
  if (status === "past_due") return "The last payment didn't go through. Plus still works — update the payment to keep it that way.";
  if (plan === "plus") return daysLeft === null ? "Your household is on Kin Plus." : `Kin Plus renews in ${daysLeft} days.`;
  return "Your household is on Kin Free. Everything you've added is still here, and Plus areas open again the moment you upgrade.";
}

export function SubscribeScreen({
  householdName,
  isOrganiser,
  status,
  plan,
  trialing,
  daysLeft,
}: {
  householdName: string;
  isOrganiser: boolean;
  status: AccessStatus;
  plan: Plan;
  trialing: boolean;
  daysLeft: number | null;
}) {
  const [state, formAction] = useActionState(redeemCodeForHouseholdAction, initialState);
  const uid = useId();

  return (
    <OnboardingShell backHref="/today" ownLook={false}>
      <Wordmark />
      <h2 style={{ fontSize: "1.875rem", margin: "24px 0 6px" }}>Your plan</h2>
      <p style={{ fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "0 0 20px" }}>
        {householdName}: {standing(status, plan, trialing, daysLeft)}
      </p>

      <div className="kin-plans">
        <section className="kin-plan" data-current={plan === "free" || undefined} aria-labelledby={`${uid}-free`}>
          <h3 id={`${uid}-free`}>
            Kin Free {plan === "free" && <span className="tag tag-accent">CURRENT</span>}
          </h3>
          <p className="kin-plan-price">₱0, for good</p>
          <ul>
            {FREE_FEATURES.map((f) => (
              <li key={f}>
                <Icon name="check" size="0.875rem" />
                {f}
              </li>
            ))}
          </ul>
        </section>
        <section className="kin-plan" data-current={plan === "plus" || undefined} aria-labelledby={`${uid}-plus`}>
          <h3 id={`${uid}-plus`}>
            Kin Plus {plan === "plus" && <span className="tag tag-accent">{trialing ? "TRIAL" : "CURRENT"}</span>}
          </h3>
          <p className="kin-plan-price">
            {pesos(PLANS.monthly.amountCents)} a month, or {pesos(PLANS.annual.amountCents)} a year ({perMonth(PLANS.annual)}/mo). One price for the whole household.
          </p>
          <ul>
            {PLUS_FEATURES.map((f) => (
              <li key={f}>
                <Icon name="check" size="0.875rem" />
                {f}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Paying is the organizer's job; everyone else is told who to ask
          rather than shown a button that will not work for them. */}
      {!isOrganiser ? (
        <Blueprint style={{ padding: "1rem", marginBottom: "1.25rem" }}>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.5, margin: 0 }}>
            The organizer of your household chooses the plan. It covers everyone in the family at once.
          </p>
        </Blueprint>
      ) : (
        status !== "comped" && (
          <>
            <Blueprint style={{ padding: "0.875rem", marginBottom: "1.25rem", background: "var(--color-accent-100)", display: "flex", gap: "0.625rem" }}>
              <Icon name="info" size={16} className="text-[var(--color-accent-700)] mt-1" />
              <span style={{ fontSize: "0.84375rem", lineHeight: 1.4 }}>
                Paying with GCash, Maya or a card is coming soon. Until then, a Kin code unlocks Plus. Enter one below.
              </span>
            </Blueprint>

            <form action={formAction}>
              <ErrorText message={state.error} />
              <div className="field" style={{ marginBottom: "0.875rem" }}>
                <label htmlFor={`${uid}-code`}>Kin code</label>
                <input
                  id={`${uid}-code`}
                  aria-label="Access code"
                  className="input"
                  name="code"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="KIN-XXXXXX"
                  style={{ fontFamily: "var(--font-numeric)", letterSpacing: ".02em", textTransform: "uppercase" }}
                />
              </div>
              <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.9375rem", letterSpacing: ".04em" }}>
                Use this code
              </SubmitButton>
            </form>
          </>
        )
      )}

      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "1.375rem", textAlign: "center" }}>
        <Link href="/today">Back to Kin</Link>
      </p>
    </OnboardingShell>
  );
}
