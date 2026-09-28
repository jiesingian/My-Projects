"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { approveGoalRewardAction, deleteGoalAction, logGoalAction, refuseGoalRewardAction, unlogGoalAction } from "@/lib/actions/goals";

function useGoalAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };
  return { pending, error, run };
}

const small = { minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem", gap: "0.3125rem" } as const;

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem", flexBasis: "100%" }}>
      {error}
    </div>
  );
}

/** Tick a session, a book, a page. Money asks how much. */
export function GoalLogButtons({ goalId, label, askAmount }: { goalId: string; label: string; askAmount?: boolean }) {
  const { pending, error, run } = useGoalAction();
  const [amount, setAmount] = useState("");

  return (
    <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", flexWrap: "wrap" }}>
      {askAmount && (
        <input
          className="input"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          aria-label="Amount"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ minHeight: "2rem", width: "7rem", fontSize: "1rem" }}
        />
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending || (askAmount && !(Number(amount) > 0))}
        onClick={() =>
          run(async () => {
            const result = await logGoalAction(goalId, askAmount ? Number(amount) : 1);
            if (!result.error) setAmount("");
            return result;
          })
        }
        style={small}
      >
        <Icon name="plus" size={14} />
        {label}
      </button>
      <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => unlogGoalAction(goalId))} style={{ ...small, color: "var(--color-neutral-700)" }}>
        Undo
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

/** The answer, on the goal itself -- for a grown-up who is on the Planner
 * rather than on Today when it comes up. Only rendered for someone who may
 * give it. */
export function GoalRewardAnswer({ goalId }: { goalId: string }) {
  const { pending, error, run } = useGoalAction();
  return (
    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => approveGoalRewardAction(goalId))} style={small}>
        <Icon name="check" size={14} />
        Approve
      </button>
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => refuseGoalRewardAction(goalId))} style={small}>
        Not this one
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

export function GoalDeleteButton({ goalId, title }: { goalId: string; title: string }) {
  const { pending, error, run } = useGoalAction();
  const [confirming, setConfirming] = useState(false);
  const ghost = { minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" } as const;

  if (!confirming) {
    return (
      <button type="button" className="btn btn-ghost" style={{ ...ghost, color: "var(--color-neutral-700)" }} onClick={() => setConfirming(true)}>
        Remove
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontSize: "0.78125rem", flexWrap: "wrap" }}>
      <span style={{ color: "var(--color-neutral-700)" }}>Remove “{title}”?</span>
      <button type="button" className="btn btn-ghost" style={{ ...ghost, color: "var(--cal-occasion)" }} disabled={pending} onClick={() => run(() => deleteGoalAction(goalId))}>
        Remove
      </button>
      <button type="button" className="btn btn-ghost" style={ghost} onClick={() => setConfirming(false)}>
        Keep
      </button>
      <ErrorLine error={error} />
    </span>
  );
}
