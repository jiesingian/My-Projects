"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { LOG_BACK_DAYS, REWARD_TERMS, daysBefore } from "@/lib/goals";
import {
  addGoalRewardAction,
  approveGoalChangeAction,
  approveGoalRewardAction,
  claimGoalPeriodAction,
  claimGoalRewardAction,
  confirmGoalRewardAction,
  disputeGoalRewardAction,
  deleteGoalAction,
  logGoalAction,
  logGoalReadingAction,
  markGoalRewardGivenAction,
  refuseGoalChangeAction,
  refuseGoalRewardAction,
  setGoalVisibilityAction,
  stepGoalWaterAction,
  unlogGoalAction,
  unclaimGoalPeriodAction,
  unlogGoalReadingAction,
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
    <div role="alert" style={{ fontSize: "0.78125rem", color: "var(--cal-occasion-ink)", marginTop: "0.375rem", flexBasis: "100%" }}>
      {error}
    </div>
  );
}

export type GoalLogMode = "water" | "steps" | "weight" | "gym" | "custom" | "money";

/** "Today", "Yesterday", "Mon 6 Oct" -- the past week, newest first. */
function dayChoices(today: string): { value: string; label: string }[] {
  return Array.from({ length: LOG_BACK_DAYS + 1 }, (_, i) => {
    const value = daysBefore(today, i);
    const [y, m, d] = value.split("-").map(Number);
    const label = i === 0 ? "Today" : i === 1 ? "Yesterday" : new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    return { value, label };
  });
}

function DayPick({ today, value, onChange, disabled }: { today: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select className="input" aria-label="Which day" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ minHeight: "2rem", width: "auto", fontSize: "1rem", paddingBlock: 0 }}>
      {dayChoices(today).map((d) => (
        <option key={d.value} value={d.value}>
          {d.label}
        </option>
      ))}
    </select>
  );
}

/** Logging by hand, on any goal. Each kind writes where Kin already keeps
 * that number, so nothing is counted twice: a glass is Today's water count,
 * steps and weight are readings in Health beside Apple Health's, and the
 * rest are the goal's own entries. Any day of the past week can be named. */
export function GoalLog({
  goalId,
  mode,
  today,
  autoToday = null,
  manualToday = null,
  locked = null,
}: {
  goalId: string;
  mode: GoalLogMode;
  /** The household's date, YYYY-MM-DD. */
  today: string;
  /** Steps: Apple Health's figure for today, if any. */
  autoToday?: number | null;
  /** Steps: what was typed for today, if anything. */
  manualToday?: number | null;
  /** Why logging is shut (Kin Plus lapsed, say), shown instead. */
  locked?: string | null;
}) {
  const { pending, error, run } = useGoalAction();
  const [day, setDay] = useState(today);
  const [value, setValue] = useState("");
  if (locked) return <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>{locked}</span>;

  const reading = mode === "steps" || mode === "weight";
  const typed = mode === "money" || mode === "custom" || reading;
  const n = Number(value.replace(/,/g, ""));
  // Custom counts one without a number; money and readings need one.
  const ready = mode === "custom" ? value === "" || n > 0 : !typed || n > 0;
  const placeholder = mode === "steps" ? "Steps" : mode === "weight" ? "kg" : mode === "money" ? "Amount" : "1";

  const save = () =>
    run(async () => {
      const result =
        mode === "water"
          ? await stepGoalWaterAction(goalId, 1, day)
          : reading
            ? await logGoalReadingAction(goalId, n, day)
            : await logGoalAction(goalId, typed && value !== "" ? n : 1, day);
      if (!result.error) setValue("");
      return result;
    });
  const undo = () => run(() => (mode === "water" ? stepGoalWaterAction(goalId, -1, day) : reading ? unlogGoalReadingAction(goalId) : unlogGoalAction(goalId)));
  const label = mode === "water" ? "Glass" : mode === "gym" ? "Session" : mode === "steps" || mode === "weight" ? "Log" : mode === "money" ? "Add" : value ? "Add" : "One more";

  return (
    <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", flexWrap: "wrap" }}>
      {typed && (
        <input
          className="input"
          type="number"
          inputMode={mode === "steps" ? "numeric" : "decimal"}
          min="0"
          step={mode === "steps" ? "1" : mode === "weight" ? "0.1" : "0.01"}
          aria-label={placeholder}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ minHeight: "2rem", width: mode === "custom" ? "4.5rem" : "7.5rem", fontSize: "1rem" }}
        />
      )}
      <button type="button" className="btn btn-primary" disabled={pending || !ready} onClick={save} style={small}>
        <Icon name="plus" size={14} />
        {label}
      </button>
      <button type="button" className="btn btn-ghost" disabled={pending} onClick={undo} style={{ ...small, color: "var(--color-neutral-700)" }}>
        {mode === "water" ? "− Glass" : "Undo"}
      </button>
      <DayPick today={today} value={day} onChange={setDay} disabled={pending} />
      {mode === "steps" && day === today && (autoToday !== null || manualToday !== null) && (
        <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", flexBasis: "100%" }}>
          {autoToday !== null ? `Apple Health has ${autoToday.toLocaleString("en-PH")} today` : "Nothing from Apple Health yet today"}
          {manualToday !== null ? ` · you typed ${manualToday.toLocaleString("en-PH")}` : ""} · the higher one counts, never both.
        </span>
      )}
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
      <button type="button" className="btn btn-ghost" style={{ ...ghost, color: "var(--cal-occasion-ink)" }} disabled={pending} onClick={() => run(() => deleteGoalAction(goalId))}>
        Remove
      </button>
      <button type="button" className="btn btn-ghost" style={ghost} onClick={() => setConfirming(false)}>
        Keep
      </button>
      <ErrorLine error={error} />
    </span>
  );
}

/** Who sees the goal, switched by its owner on the edit page. It does not
 * change what the goal measures, so it applies at once. */
export function GoalVisibilitySwitch({ goalId, visibility, hasGiver }: { goalId: string; visibility: "household" | "private"; hasGiver: boolean }) {
  const { pending, error, run } = useGoalAction();
  const pick = (v: "household" | "private") => {
    if (v !== visibility) run(() => setGoalVisibilityAction(goalId, v));
  };
  return (
    <div style={{ marginBottom: "1.125rem" }}>
      <p style={{ fontSize: "0.75rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)", margin: "0 0 0.5rem" }}>Visible to</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
        <button type="button" className="chip" data-active={visibility === "household"} aria-pressed={visibility === "household"} disabled={pending} onClick={() => pick("household")}>
          <Icon name="house" size={13} />
          Whole household
        </button>
        <button type="button" className="chip" data-active={visibility === "private"} aria-pressed={visibility === "private"} disabled={pending} onClick={() => pick("private")}>
          <Icon name="eyeOff" size={13} />
          Just me
        </button>
      </div>
      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "0.375rem 0 0", lineHeight: 1.45 }}>
        {visibility === "private"
          ? `Only you see this goal${hasGiver ? ", and whoever gives its reward" : ""}. Readings you log on it stay “Just me” in Health.`
          : "Everyone in the house sees this goal and how far along it is. Your readings in Health keep their own setting."}
      </p>
      <ErrorLine error={error} />
    </div>
  );
}

/** The owner's "I did it" on a repeating goal once its ring is full, and
 * taking it back. A child's claim waits for a grown-up's yes on Today. */
export function GoalClaim({ goalId, periodStart, label, claimed }: { goalId: string; periodStart: string; label: string; claimed: boolean }) {
  const { pending, error, run } = useGoalAction();
  return (
    <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", flexWrap: "wrap" }}>
      {claimed ? (
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(() => unclaimGoalPeriodAction(goalId, periodStart))} style={{ ...small, color: "var(--color-neutral-700)" }}>
          Take back
        </button>
      ) : (
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => claimGoalPeriodAction(goalId))} style={small}>
          <Icon name="check" size={14} />
          {label}
        </button>
      )}
      <ErrorLine error={error} />
    </div>
  );
}

