"use client";

import { useActionState, useId, useState } from "react";
import { updateGoalAction, type GoalFormState } from "@/lib/actions/goals";
import { SubmitButton } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import { Icon } from "@/components/icons";
import { DateInput } from "@/components/date-input";
import { GoalAddReward } from "@/components/goal-controls";
import { GOAL_KIND_META, GOAL_PERIODS, PERIOD_LABEL, type GoalKind, type GoalPeriod } from "@/lib/goals";

const initialState: GoalFormState = { error: null };
const hint = { display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.25rem", lineHeight: 1.45 } as const;

/** Editing a goal. With a reward in play, what it measures changes only with
 * the giver's yes -- so the form says, before anything is saved, who will
 * be asked. The name always changes at once. */
export function GoalEditForm({
  goal,
  meId,
  currency,
  today,
  giverName,
  givers,
}: {
  goal: { id: string; title: string; kind: GoalKind; target: number; period: GoalPeriod; unit: string | null; dueDate: string | null };
  meId: string;
  currency: string;
  today: string;
  giverName: string | null;
  givers: { id: string; label: string }[] | null;
}) {
  const [state, formAction] = useActionState(updateGoalAction.bind(null, goal.id), initialState);
  const uid = useId();
  const [period, setPeriod] = useState<GoalPeriod>(goal.period);
  const meta = GOAL_KIND_META[goal.kind];
  const unitLabel = goal.kind === "money" ? currency : goal.kind === "custom" ? "" : meta.unit;

  return (
    <div>
      <DetailHeader backHref="/planner?seg=goals" eyebrow="Planner" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "1.875rem", margin: "0 0 14px" }}>Edit goal</h3>

        {giverName && (
          <p style={{ fontSize: "0.84375rem", lineHeight: 1.45, margin: "0 0 1rem", padding: "0.625rem 0.75rem", borderRadius: 12, background: "color-mix(in srgb, var(--cal-goal) 12%, transparent)" }}>
            <Icon name="gift" size={14} style={{ verticalAlign: "-2px", marginRight: "0.375rem", color: "var(--cal-goal)" }} />
            This goal has a reward from {giverName}. A new target, period or date goes to them for a yes — they can agree or keep it as it was. The name changes now.
          </p>
        )}

        <form action={formAction}>
          <div className="field" data-field="title" style={{ marginBottom: "0.875rem" }}>
            <label htmlFor={`${uid}-title`}>Name</label>
            <input id={`${uid}-title`} className="input" name="title" required maxLength={80} defaultValue={goal.title} style={{ minHeight: "2.75rem" }} />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.875rem" }}>
            <div className="field" data-field="target" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-target`}>{goal.kind === "weight" ? "Target weight" : "Target"}</label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input id={`${uid}-target`} className="input" type="number" inputMode="decimal" name="target" required min="0" step="any" defaultValue={goal.target} style={{ minHeight: "2.75rem", flex: 1, minWidth: 0 }} />
                {unitLabel && <span style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)" }}>{unitLabel}</span>}
              </div>
            </div>
            {goal.kind !== "weight" && (
              <div className="field" data-field="period" style={{ flex: 1 }}>
                <label htmlFor={`${uid}-period`}>Counted</label>
                <select id={`${uid}-period`} className="input" name="period" value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)} style={{ minHeight: "2.75rem" }}>
                  {GOAL_PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {PERIOD_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {goal.kind === "custom" && (
            <div className="field" data-field="unit" style={{ marginBottom: "0.875rem" }}>
              <label htmlFor={`${uid}-unit`}>Counting what (optional)</label>
              <input id={`${uid}-unit`} className="input" name="unit" maxLength={24} defaultValue={goal.unit ?? ""} placeholder="books" style={{ minHeight: "2.75rem" }} />
            </div>
          )}

          <div className="field" data-field="due_date" style={{ marginBottom: "1.125rem" }}>
            <label htmlFor={`${uid}-due`}>By when (optional)</label>
            <DateInput id={`${uid}-due`} className="input" name="due_date" min={today} defaultValue={goal.dueDate ?? undefined} style={{ minHeight: "2.75rem" }} />
          </div>

          {state.error && (
            <p role="alert" style={{ margin: "0 0 12px", padding: "0.6875rem 0.8125rem", borderRadius: 12, background: "color-mix(in srgb, var(--cal-occasion) 12%, transparent)", fontSize: "0.875rem", lineHeight: 1.4 }}>
              {state.error}
            </p>
          )}

          <SubmitButton>{giverName ? "Save, and ask for the rest" : "Save goal"}</SubmitButton>
        </form>

        {givers && givers.length > 0 && (
          <section style={{ marginTop: "1.75rem" }}>
            <h4 style={{ font: "600 1.0625rem/1.2 var(--font-heading)", margin: "0 0 0.5rem" }}>
              <Icon name="gift" size={15} style={{ verticalAlign: "-2px", marginRight: "0.375rem", color: "var(--cal-goal)" }} />
              Add a reward
            </h4>
            <span style={{ ...hint, marginTop: 0, marginBottom: "0.625rem" }}>A promise for when it is reached. Whoever gives it says yes; if that is you, it counts now.</span>
            <GoalAddReward goalId={goal.id} givers={givers} meId={meId} />
          </section>
        )}
      </div>
    </div>
  );
}
