"use client";

import { useState, type Ref } from "react";
import { Icon } from "@/components/icons";
import { PLANS, pesos } from "@/lib/billing/plans";
import { TRIAL_DAYS } from "@/lib/access";
import { FREE_FEATURES, PLUS_FEATURES } from "@/lib/plan-features";
import type { ChosenPlan } from "@/lib/first-open";

/** The plan step before sign-up (agreed 13 October, answer 6A): "Start with
 * Plus free", highlighted, or "Just Kin Free". Both start the same trial;
 * the choice only changes the trial card's and reminders' wording later.
 * Under them, plainly, the no-surprise-charges promise, as the spec words it.
 * Prices and trial length come from plans.ts and access.ts. */
export function PlanStep({ onChoose, onBack, heading }: { onChoose: (plan: ChosenPlan) => void; onBack: () => void; heading: Ref<HTMLHeadingElement> }) {
  const [plan, setPlan] = useState<ChosenPlan>("plus");
  const monthly = pesos(PLANS.monthly.amountCents);
  const yearly = pesos(PLANS.annual.amountCents);

  return (
    <section className="kin-welcome-step kin-check-plan">
      <h2 ref={heading} tabIndex={-1}>
        Pick how you start
      </h2>
      <p>Either way, the whole family gets {TRIAL_DAYS} days of Kin Plus free. Sulit.</p>

      <fieldset className="kin-check-plans">
        <legend className="sr-only">Plan</legend>
        <label className="kin-check-plan-card" data-on={plan === "plus" || undefined} data-best>
          <input type="radio" name="kin-check-plan" value="plus" checked={plan === "plus"} onChange={() => setPlan("plus")} />
          <span>
            <strong>
              Start with Plus free <span className="kin-plus-badge">RECOMMENDED</span>
            </strong>
            <small>
              Everything, free for {TRIAL_DAYS} days. After that, {monthly}/mo or {yearly}/yr for the whole family, only if you subscribe.
            </small>
          </span>
        </label>
        <label className="kin-check-plan-card" data-on={plan === "free" || undefined}>
          <input type="radio" name="kin-check-plan" value="free" checked={plan === "free"} onChange={() => setPlan("free")} />
          <span>
            <strong>Just Kin Free</strong>
            <small>The same {TRIAL_DAYS}-day trial, then Kin Free: ₱0, for good.</small>
          </span>
        </label>
      </fieldset>

      <ul className="kin-check-promise">
        <li>
          <Icon name="check" size="1rem" />
          No card needed.
        </li>
        <li>
          <Icon name="check" size="1rem" />
          No automatic payment, ever, unless you subscribe yourself.
        </li>
        <li>
          <Icon name="check" size="1rem" />A reminder on the last day of the trial.
        </li>
        <li>
          <Icon name="check" size="1rem" />
          Do nothing and you move to Kin Free and keep everything.
        </li>
      </ul>

      <details className="kin-check-more">
        <summary>What&rsquo;s in each</summary>
        <div className="kin-plans">
          <section className="kin-plan" aria-labelledby="kin-check-free">
            <h3 id="kin-check-free">Kin Free</h3>
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
          <section className="kin-plan" aria-labelledby="kin-check-plus">
            <h3 id="kin-check-plus">Kin Plus</h3>
            <p className="kin-plan-price">
              {monthly} a month or {yearly} a year
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
      </details>

      <button type="button" className="btn btn-primary btn-block kin-welcome-cta" onClick={() => onChoose(plan)}>
        Create your account
      </button>
      <button type="button" className="btn btn-ghost kin-check-secondary" onClick={onBack}>
        Back
      </button>
    </section>
  );
}
