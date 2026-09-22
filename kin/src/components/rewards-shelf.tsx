"use client";

import { useActionState, useState, useTransition } from "react";
import { useId } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { SubmitButton, ErrorText } from "@/components/form";
import { confirm } from "@/components/confirm-sheet";
import { addRewardAction, retireRewardAction, redeemRewardAction } from "@/lib/actions/rewards";
import type { ActionState } from "@/lib/actions/auth";
import type { RewardView, MemberScore } from "@/lib/queries/routines";

const initialState: ActionState = { error: null };

/** What the points are for. Sits under the scoreboard, because a number with
 * nothing to spend it on is not a reward system -- it is a scoreboard.
 *
 * Everyone sees the list and what they can afford. Only a grown-up can add
 * to it or take something off. */
export function RewardsShelf({
  rewards,
  me,
  canManage,
}: {
  rewards: RewardView[];
  me: MemberScore | undefined;
  canManage: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const spendable = me?.spendable ?? 0;

  if (rewards.length === 0 && !canManage) return null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
          Rewards
        </span>
        {me && (
          <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
            · {spendable} to spend
          </span>
        )}
        {canManage && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setAdding((a) => !a)}
            style={{ minHeight: 28, fontSize: 12.5, padding: "0 8px", gap: 4, marginLeft: "auto" }}
          >
            <Icon name={adding ? "x" : "plus"} size={13} />
            {adding ? "Cancel" : "Add"}
          </button>
        )}
      </div>

      {adding && <AddReward onDone={() => setAdding(false)} />}

      {rewards.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: 0 }}>
          Nothing to spend points on yet. An hour of screen time, choosing Friday&rsquo;s dinner, a trip to the shop —
          whatever the house agrees is worth earning.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {rewards.map((r) => (
            <RewardRow key={r.id} reward={r} spendable={spendable} canManage={canManage} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddReward({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useActionState(addRewardAction, initialState);
  const router = useRouter();
  const uid = useId();

  // A successful save clears the error and leaves the form open; closing it
  // is the caller's business, and refreshing is what makes the new row show.
  return (
    <form
      action={async (fd) => {
        await formAction(fd);
        router.refresh();
        onDone();
      }}
      style={{ marginBottom: 9 }}
    >
      <ErrorText message={state.error} />
      <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
        <span style={{ flex: 1 }}>
          <label htmlFor={`${uid}-title`} style={{ display: "block", fontSize: 11.5, color: "var(--color-neutral-600)", marginBottom: 3 }}>
            WHAT
          </label>
          <input id={`${uid}-title`} className="input" name="title" required maxLength={100} placeholder="An hour of screen time" style={{ minHeight: 40, fontSize: 13 }} />
        </span>
        <span style={{ width: 92 }}>
          <label htmlFor={`${uid}-cost`} style={{ display: "block", fontSize: 11.5, color: "var(--color-neutral-600)", marginBottom: 3 }}>
            POINTS
          </label>
          <input id={`${uid}-cost`} className="input" name="cost_points" type="number" min="1" max="10000" required defaultValue={10} style={{ minHeight: 40, fontSize: 13 }} />
        </span>
        <SubmitButton style={{ minHeight: 40, fontSize: 13, padding: "0 12px" }}>SAVE</SubmitButton>
      </div>
    </form>
  );
}

function RewardRow({ reward, spendable, canManage }: { reward: RewardView; spendable: number; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const affordable = spendable >= reward.costPoints;

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <Blueprint style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 110 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{reward.title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: affordable ? "var(--color-accent-700)" : "var(--color-neutral-600)" }}>
          {reward.costPoints} points{affordable ? "" : ` · ${reward.costPoints - spendable} more to go`}
        </span>
      </span>

      <button
        type="button"
        className={affordable ? "btn btn-primary" : "btn btn-secondary"}
        disabled={pending || !affordable}
        onClick={() => run(() => redeemRewardAction(reward.id))}
        style={{ minHeight: 30, fontSize: 12.5, padding: "0 12px" }}
      >
        Ask for it
      </button>

      {canManage && (
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={async () => {
            if (!(await confirm({ title: `Take "${reward.title}" off the list?`, description: "Requests already made keep working.", confirmLabel: "Take it off" }))) return;
            run(() => retireRewardAction(reward.id));
          }}
          style={{ minHeight: 30, fontSize: 12, padding: "0 8px", color: "var(--color-neutral-700)" }}
        >
          Remove
        </button>
      )}

      {error && <div style={{ flexBasis: "100%", fontSize: 12, color: "var(--cal-occasion)" }}>{error}</div>}
    </Blueprint>
  );
}
