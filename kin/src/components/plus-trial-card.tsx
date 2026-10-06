"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { hidePlusTrialCardAction } from "@/lib/actions/plus-trial";
import type { PlusTrialStep } from "@/lib/queries/plus-trial";
import { TRIAL_DAYS } from "@/lib/access";

const ICONS: Record<PlusTrialStep["id"], IconName> = {
  bill: "receipt",
  vault: "shieldCheck",
  medicine: "activity",
};

/** The first days of a Kin Plus trial on Today (approved 6 October). Drawn
 * the way "Start here" is (start-here.tsx): which steps are done comes from
 * the server, and a done step stays in place, struck through. */
export function PlusTrialCard({ steps, daysLeft }: { steps: PlusTrialStep[]; daysLeft: number }) {
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  if (hidden) return null;

  const done = steps.filter((s) => s.done).length;

  return (
    <section className="kin-start" aria-labelledby="kin-plus-trial-title">
      <header className="kin-start-head">
        <h3 id="kin-plus-trial-title" className="kin-eyebrow" style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="kin-plus-badge">PLUS</span>
          Your {TRIAL_DAYS} days of Kin Plus · {done} of {steps.length}
        </h3>
        <button
          type="button"
          className="btn btn-ghost kin-start-hide"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await hidePlusTrialCardAction();
              setHidden(true);
            })
          }
        >
          Hide
        </button>
      </header>
      <p className="kin-brief-meta" style={{ margin: "0 0 0.5rem" }}>
        {daysLeft} days left to try these free. Afterwards everything you add stays yours.
      </p>
      <div className="kin-brief">
        {steps.map((s) => {
          const body = (
            <>
              <span className="kin-brief-ico" data-tint={s.done ? undefined : "money"}>
                <Icon name={s.done ? "check" : ICONS[s.id]} size="1.0625rem" />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="kin-brief-title" data-done={s.done || undefined}>
                  {s.title}
                </span>
                {!s.done && <span className="kin-brief-meta">{s.hint}</span>}
              </span>
              {!s.done && <Icon name="chevronLeft" size="0.9375rem" className="kin-brief-chev" />}
            </>
          );
          return s.done ? (
            <div key={s.id} className="kin-brief-row kin-start-done" aria-label={`${s.title}: done`}>
              {body}
            </div>
          ) : (
            <Link key={s.id} href={s.href} className="kin-brief-row">
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
