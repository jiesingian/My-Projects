"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { REWARD_TERMS } from "@/lib/goals";
import {
  addGoalRewardAction,
  approveGoalChangeAction,
  approveGoalRewardAction,
  claimGoalRewardAction,
  confirmGoalRewardAction,
  disputeGoalRewardAction,
  deleteGoalAction,
  logGoalAction,
  markGoalRewardGivenAction,
  refuseGoalChangeAction,
  refuseGoalRewardAction,
  unlogGoalAction,
  withdrawGoalChangeAction,
  withdrawGoalRewardAction,
} from "@/lib/actions/goals";

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

/** The giver's answer, on the goal itself. What the reward is was set when
 * it was asked for and cannot change here; saying yes accepts the terms
 * printed right above the button. Only rendered for the giver. */
export function GoalRewardAnswer({ goalId }: { goalId: string }) {
  const { pending, error, run } = useGoalAction();
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-700)", lineHeight: 1.45, margin: "0 0 0.4375rem" }}>{REWARD_TERMS}</p>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => approveGoalRewardAction(goalId))} style={small}>
          <Icon name="check" size={14} />
          Agree and promise
        </button>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => refuseGoalRewardAction(goalId))} style={{ ...small, color: "var(--color-neutral-700)" }}>
          Not this one
        </button>
        <ErrorLine error={error} />
      </div>
    </div>
  );
}

/** The giver: it is given. Pauses the chase until the receiver confirms. */
export function GoalRewardGiven({ goalId }: { goalId: string }) {
  const { pending, error, run } = useGoalAction();
  return (
    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => markGoalRewardGivenAction(goalId))} style={small}>
        <Icon name="gift" size={14} />
        Mark as given
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

/** The receiver, once the ring is full: the goal is reached. Starts the
 * giver's day. */
export function GoalRewardClaim({ goalId }: { goalId: string }) {
  const { pending, error, run } = useGoalAction();
  return (
    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => claimGoalRewardAction(goalId))} style={small}>
        <Icon name="gift" size={14} />
        I did it — claim the reward
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

/** The receiver, once it is marked given: did it arrive? "Not yet" makes it
 * overdue at once and the chase starts again. */
export function GoalRewardConfirm({ goalId }: { goalId: string }) {
  const { pending, error, run } = useGoalAction();
  return (
    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => confirmGoalRewardAction(goalId))} style={small}>
        <Icon name="check" size={14} />
        I got it
      </button>
      <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => disputeGoalRewardAction(goalId))} style={small}>
        Not yet
      </button>
      <ErrorLine error={error} />
    </div>
  );
}

export function GoalRewardWithdraw({ goalId }: { goalId: string }) {
  const { pending, error, run } = useGoalAction();
  return (
    <>
      <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => withdrawGoalRewardAction(goalId))} style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.375rem", color: "var(--color-neutral-700)" }}>
        Take back
      </button>
      <ErrorLine error={error} />
    </>
  );
}

/** A change to what a goal measures, answered by the giver (or, with no
 * reward in play, by anyone but the one who asked). */
export function GoalChangeAnswer({ changeId, canAnswer, viewerAsked }: { changeId: string; canAnswer: boolean; viewerAsked: boolean }) {
  const { pending, error, run } = useGoalAction();
  return (
    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
      {canAnswer && (
        <>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => approveGoalChangeAction(changeId))} style={small}>
            <Icon name="check" size={14} />
            Agree
          </button>
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => refuseGoalChangeAction(changeId))} style={small}>
            Keep it as it was
          </button>
        </>
      )}
      {viewerAsked && (
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => withdrawGoalChangeAction(changeId))} style={{ ...small, color: "var(--color-neutral-700)" }}>
          Take back
        </button>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

/** Asking for (or offering) a reward on a goal that has none. */
export function GoalAddReward({ goalId, givers, meId }: { goalId: string; givers: { id: string; label: string }[]; meId: string }) {
  const { pending, error, run } = useGoalAction();
  const [title, setTitle] = useState("");
  const [giver, setGiver] = useState("");
  return (
    <div>
      <input className="input" aria-label="Reward" maxLength={120} placeholder="₱500, a hug, a massage, a day out" value={title} onChange={(e) => setTitle(e.target.value)} style={{ minHeight: "2.75rem", width: "100%", marginBottom: "0.5rem" }} />
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginBottom: "0.375rem" }}>Who gives it</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.625rem" }}>
        {givers.map((p) => (
          <button key={p.id} type="button" className="chip" data-active={giver === p.id} aria-pressed={giver === p.id} onClick={() => setGiver(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-700)", lineHeight: 1.45, margin: "0 0 0.5rem" }}>{REWARD_TERMS}</p>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending || !title.trim() || !giver}
        onClick={() =>
          run(async () => {
            const r = await addGoalRewardAction(goalId, title, giver);
            if (!r.error) setTitle("");
            return r;
          })
        }
        style={small}
      >
        <Icon name="gift" size={14} />
        {giver === meId ? "Promise it" : "Ask for it"}
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
