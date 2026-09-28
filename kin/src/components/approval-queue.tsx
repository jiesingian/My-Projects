"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Blueprint } from "@/components/ui";
import { approveRoutineLogAction, rejectRoutineLogAction } from "@/lib/actions/routines";
import { grantRedemptionAction, refuseRedemptionAction } from "@/lib/actions/rewards";
import { approveGoalChangeAction, approveGoalRewardAction, refuseGoalChangeAction, refuseGoalRewardAction } from "@/lib/actions/goals";
import type { PendingApproval, PendingRedemption } from "@/lib/queries/routines";
import type { PendingGoalChange, PendingGoalReward } from "@/lib/queries/goals";
import { REWARD_TERMS } from "@/lib/goals";
import { readableDay } from "@/lib/time";

/** What this person still has to answer for. Chores and redemptions come
 * only to a parent or an adult (a child sees their own chore waiting on the
 * task itself). Goal rewards and changes come to whoever gives the reward,
 * child or grown-up, since a promise is the giver's to make. */
export function ApprovalQueue({
  pending,
  redemptions,
  goalRewards = [],
  goalChanges = [],
}: {
  pending: PendingApproval[];
  redemptions: PendingRedemption[];
  goalRewards?: PendingGoalReward[];
  goalChanges?: PendingGoalChange[];
}) {
  const total = pending.length + redemptions.length + goalRewards.length + goalChanges.length;
  if (total === 0) return null;

  return (
    <section style={{ marginBottom: "1.625rem" }}>
      <h3 className="kin-eyebrow">Waiting on you · {total}</h3>
      {pending.map((p) => (
        <ApprovalRow key={`${p.routineId}-${p.date}`} item={p} />
      ))}
      {redemptions.map((r) => (
        <RedemptionRow key={r.id} item={r} />
      ))}
      {goalRewards.map((g) => (
        <GoalRewardRow key={g.goalId} item={g} />
      ))}
      {goalChanges.map((c) => (
        <GoalChangeRow key={c.changeId} item={c} />
      ))}
    </section>
  );
}

/** A reward asked for. Its points are already held against the balance, so
 * refusing is what hands them back rather than what takes them away. */
function RedemptionRow({ item }: { item: PendingRedemption }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        router.refresh();
        return;
      }
      // Answered. The refresh that removes this row from the queue lands a
      // moment later, so the row gets to leave rather than blink out from
      // under the finger that just tapped it.
      setLeaving(true);
      await new Promise((resolve) => setTimeout(resolve, 180));
      router.refresh();
    });
  };

  return (
    <Blueprint className={leaving ? "kin-leaving" : undefined} style={{ padding: "0.8125rem", marginBottom: "0.5625rem" }}>
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
        <span
          style={{
            width: 30,
            height: 30,
            flex: "none",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--cal-goal) 22%, transparent)",
          }}
        >
          <Icon name="gift" size={16} style={{ color: "var(--cal-goal)" }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 0.96875rem/1.2 var(--font-heading)" }}>{item.title}</div>
          <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
            {item.who.split(" ")[0]} is asking · {item.costPoints} point{item.costPoints === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => grantRedemptionAction(item.id))}
          style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" }}
        >
          <Icon name="check" size={14} />
          Grant it
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => refuseRedemptionAction(item.id))}
          style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}
        >
          Not this time
        </button>
      </div>
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
    </Blueprint>
  );
}

/** A reward this person has been asked to give. Saying yes is a promise,
 * so it is theirs alone to answer -- a child asked for a hug as much as a
 * parent asked for ₱500. Rewording it is done on the goal itself. */
function GoalRewardRow({ item }: { item: PendingGoalReward }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        router.refresh();
        return;
      }
      setLeaving(true);
      await new Promise((resolve) => setTimeout(resolve, 180));
      router.refresh();
    });
  };

  const forWhom = item.forWhom === "Everyone" ? "the household" : item.forWhom.split(" ")[0];
  const asked = item.askedBy ? `${item.askedBy.split(" ")[0]} asks` : "Asked";

  return (
    <Blueprint className={leaving ? "kin-leaving" : undefined} style={{ padding: "0.8125rem", marginBottom: "0.5625rem" }}>
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
        <span
          style={{
            width: 30,
            height: 30,
            flex: "none",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--cal-goal) 22%, transparent)",
          }}
        >
          <Icon name="target" size={16} style={{ color: "var(--cal-goal)" }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 0.96875rem/1.2 var(--font-heading)" }}>{item.reward}</div>
          <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
            {asked} you · for {forWhom}, on reaching &ldquo;{item.goalTitle}&rdquo;
          </div>
        </div>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-700)", lineHeight: 1.45, margin: "0.5rem 0 0" }}>{REWARD_TERMS}</p>
      <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => approveGoalRewardAction(item.goalId))}
          style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" }}
        >
          <Icon name="check" size={14} />
          Agree and promise
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => refuseGoalRewardAction(item.goalId))}
          style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}
        >
          Not this one
        </button>
      </div>
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
    </Blueprint>
  );
}

/** A change to a goal whose reward this person gives. Agreeing applies it;
 * keeping it as it was leaves the goal alone. */
function GoalChangeRow({ item }: { item: PendingGoalChange }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        router.refresh();
        return;
      }
      setLeaving(true);
      await new Promise((resolve) => setTimeout(resolve, 180));
      router.refresh();
    });
  };

  return (
    <Blueprint className={leaving ? "kin-leaving" : undefined} style={{ padding: "0.8125rem", marginBottom: "0.5625rem" }}>
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
        <span
          style={{
            width: 30,
            height: 30,
            flex: "none",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--cal-goal) 22%, transparent)",
          }}
        >
          <Icon name="target" size={16} style={{ color: "var(--cal-goal)" }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 0.96875rem/1.2 var(--font-heading)" }}>Change &ldquo;{item.goalTitle}&rdquo;?</div>
          <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
            {item.askedBy ? `${item.askedBy.split(" ")[0]} asks` : "Asked"} · you give its reward
          </div>
          {item.lines.map((l) => (
            <div key={l} style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}>
              {l}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => approveGoalChangeAction(item.changeId))}
          style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" }}
        >
          <Icon name="check" size={14} />
          Agree
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => refuseGoalChangeAction(item.changeId))}
          style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}
        >
          Keep it as it was
        </button>
      </div>
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
    </Blueprint>
  );
}

function ApprovalRow({ item }: { item: PendingApproval }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        router.refresh();
        return;
      }
      // Answered. The refresh that removes this row from the queue lands a
      // moment later, so the row gets to leave rather than blink out from
      // under the finger that just tapped it.
      setLeaving(true);
      await new Promise((resolve) => setTimeout(resolve, 180));
      router.refresh();
    });
  };

  return (
    <Blueprint className={leaving ? "kin-leaving" : undefined} style={{ padding: "0.8125rem", marginBottom: "0.5625rem" }}>
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
        <span
          style={{
            width: 30,
            height: 30,
            flex: "none",
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--cal-money) 22%, transparent)",
          }}
        >
          <Icon name="check" size={16} style={{ color: "var(--cal-money)" }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 0.96875rem/1.2 var(--font-heading)" }}>{item.title}</div>
          <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
            {item.who.split(" ")[0]} says it is done · {readableDate(item.date)}
            {item.points > 0 ? ` · ${item.points} point${item.points === 1 ? "" : "s"}` : ""}
          </div>
          {item.note && (
            <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "0.25rem", lineHeight: 1.4 }}>&ldquo;{item.note}&rdquo;</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.625rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => approveRoutineLogAction(item.routineId, item.date))}
          style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.875rem", gap: "0.3125rem" }}
        >
          <Icon name="check" size={14} />
          Approve
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() => run(() => rejectRoutineLogAction(item.routineId, item.date))}
          style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}
        >
          Not yet
        </button>
      </div>
      {error && <div style={{ fontSize: "0.78125rem", color: "var(--cal-occasion)", marginTop: "0.375rem" }}>{error}</div>}
    </Blueprint>
  );
}

function readableDate(iso: string): string {
  return readableDay(iso);
}
