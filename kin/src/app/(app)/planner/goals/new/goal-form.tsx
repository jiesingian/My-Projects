"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createGoalAction, type GoalFormState } from "@/lib/actions/goals";
import { SubmitButton } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import { Icon } from "@/components/icons";
import { PlusNote } from "@/components/plus";
import { DateInput } from "@/components/date-input";
import { GOAL_KINDS, GOAL_KIND_META, GOAL_PERIODS, PERIOD_LABEL, REWARD_TERMS, type GoalKind, type GoalPeriod } from "@/lib/goals";

const initialState: GoalFormState = { error: null };

const eyebrow = { fontSize: "0.75rem", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)", margin: "0 0 0.5rem" } as const;
const hint = { display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.25rem", lineHeight: 1.45 } as const;

/** Suggested targets, so the first number on screen is a sensible one. */
const DEFAULT_TARGET: Record<GoalKind, string> = { money: "10000", water: "8", steps: "8000", weight: "", gym: "3", custom: "10" };

export function GoalForm({
  people,
  meId,
  savings,
  plus,
  currency,
  today,
}: {
  people: { id: string; label: string }[];
  meId: string;
  savings: { id: string; title: string }[];
  plus: boolean;
  currency: string;
  today: string;
}) {
  const [state, formAction] = useActionState(createGoalAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();

  const [kind, setKind] = useState<GoalKind>("water");
  const [owner, setOwner] = useState<string>(meId);
  const [period, setPeriod] = useState<GoalPeriod>(GOAL_KIND_META.water.defaultPeriod);
  const [target, setTarget] = useState(DEFAULT_TARGET.water);
  const [reward, setReward] = useState("");
  const [giver, setGiver] = useState("");
  const meta = GOAL_KIND_META[kind];

  useEffect(() => {
    if (!state.error || !state.field) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${state.field}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLElement>("input, select, textarea, button")?.focus({ preventScroll: true });
  }, [state]);

  const pickKind = (k: GoalKind) => {
    setKind(k);
    setPeriod(GOAL_KIND_META[k].defaultPeriod);
    setTarget(DEFAULT_TARGET[k]);
    // A weight is one person's; a household cannot own it.
    if (!GOAL_KIND_META[k].household && owner === "household") setOwner(meId);
  };

  const pickOwner = (id: string) => {
    setOwner(id);
    // Nobody gives themselves a reward.
    if (giver === id) setGiver("");
  };

  const unitLabel = kind === "money" ? currency : kind === "custom" ? "" : meta.unit;
  const ownerLabel = owner === "household" ? "the whole household" : owner === meId ? "you" : (people.find((p) => p.id === owner)?.label ?? "them");

  return (
    <div>
      <DetailHeader backHref="/planner?seg=goals" eyebrow="Planner" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h3 style={{ fontSize: "1.875rem", margin: "0 0 14px" }}>Set a goal</h3>

        <form action={formAction} ref={formRef}>
          <div data-field="kind" style={{ marginBottom: "1rem" }}>
            <p style={eyebrow}>What kind</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
              {GOAL_KINDS.map((k) => {
                const m = GOAL_KIND_META[k];
                const locked = m.plus && !plus;
                return (
                  <button
                    key={k}
                    type="button"
                    className="chip"
                    data-active={kind === k}
                    aria-pressed={kind === k}
                    disabled={locked}
                    onClick={() => pickKind(k)}
                    style={locked ? { opacity: 0.45 } : undefined}
                  >
                    <Icon name={m.icon} size={13} />
                    {m.label}
                    {locked && <span className="kin-plus-badge" style={{ marginLeft: "0.125rem" }}>PLUS</span>}
                  </button>
                );
              })}
            </div>
            <input type="hidden" name="kind" value={kind} />
            <span style={hint}>{meta.hint}</span>
          </div>

          {!plus && (
            <div style={{ marginBottom: "1rem" }}>
              <PlusNote area="A steps or weight goal" detail="It fills from vitals and Apple Health. Money, water, gym and anything-you-count goals are free." />
            </div>
          )}

          <div data-field="owner" style={{ marginBottom: "1rem" }}>
            <p style={eyebrow}>Whose goal</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
              {meta.household && (
                <button type="button" className="chip" data-active={owner === "household"} aria-pressed={owner === "household"} onClick={() => pickOwner("household")}>
                  <Icon name="house" size={13} />
                  Whole household
                </button>
              )}
              {people.map((p) => (
                <button key={p.id} type="button" className="chip" data-active={owner === p.id} aria-pressed={owner === p.id} onClick={() => pickOwner(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <input type="hidden" name="owner" value={owner} />
          </div>

          <div className="field" data-field="title" style={{ marginBottom: "0.875rem" }}>
            <label htmlFor={`${uid}-title`}>Name</label>
            <input
              id={`${uid}-title`}
              className="input"
              name="title"
              required
              maxLength={80}
              placeholder={kind === "water" ? "Eight glasses a day" : kind === "gym" ? "Gym three times a week" : kind === "money" ? "Emergency fund" : kind === "steps" ? "10,000 steps" : kind === "weight" ? "Back to 70 kg" : "Read 12 books"}
              style={{ minHeight: "2.75rem" }}
            />
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.875rem" }}>
            <div className="field" data-field="target" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-target`}>{kind === "weight" ? "Target weight" : "Target"}</label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  id={`${uid}-target`}
                  className="input"
                  type="number"
                  inputMode="decimal"
                  name="target"
                  required
                  min="0"
                  step="any"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  style={{ minHeight: "2.75rem", flex: 1, minWidth: 0 }}
                />
                {unitLabel && <span style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)" }}>{unitLabel}</span>}
              </div>
            </div>
            {kind !== "weight" && (
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

          {kind === "custom" && (
            <div className="field" data-field="unit" style={{ marginBottom: "0.875rem" }}>
              <label htmlFor={`${uid}-unit`}>Counting what (optional)</label>
              <input id={`${uid}-unit`} className="input" name="unit" maxLength={24} placeholder="books" style={{ minHeight: "2.75rem" }} />
            </div>
          )}

          {kind === "money" && savings.length > 0 && (
            <div className="field" data-field="savings_goal_id" style={{ marginBottom: "0.875rem" }}>
              <label htmlFor={`${uid}-savings`}>Fill from a savings goal (optional)</label>
              <select id={`${uid}-savings`} className="input" name="savings_goal_id" defaultValue="" style={{ minHeight: "2.75rem" }}>
                <option value="">No — I&rsquo;ll add to it here</option>
                {savings.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              <span style={hint}>Linked, the ring follows the savings goal&rsquo;s balance on Wealth.</span>
            </div>
          )}

          <div className="field" data-field="due_date" style={{ marginBottom: "1.125rem" }}>
            <label htmlFor={`${uid}-due`}>By when (optional)</label>
            <DateInput id={`${uid}-due`} className="input" name="due_date" min={today} style={{ minHeight: "2.75rem" }} />
          </div>

          <div className="field" data-field="reward" style={{ marginBottom: "1.125rem" }}>
            <label htmlFor={`${uid}-reward`}>
              <Icon name="gift" size={13} style={{ verticalAlign: "-2px", marginRight: "0.25rem" }} />
              Reward (optional)
            </label>
            <input
              id={`${uid}-reward`}
              className="input"
              name="reward"
              maxLength={120}
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="₱500, a hug, a massage, a day out"
              style={{ minHeight: "2.75rem" }}
            />
            <span style={hint}>For {ownerLabel}, when the goal is reached. It&rsquo;s a promise, so whoever gives it says yes. {REWARD_TERMS}</span>
          </div>

          {reward.trim() && (
            <div data-field="giver" style={{ marginBottom: "1.125rem" }}>
              <p style={eyebrow}>Who gives it</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                {people
                  .filter((p) => p.id !== owner)
                  .map((p) => (
                    <button key={p.id} type="button" className="chip" data-active={giver === p.id} aria-pressed={giver === p.id} onClick={() => setGiver(p.id)}>
                      {p.label}
                    </button>
                  ))}
              </div>
              <input type="hidden" name="giver" value={giver} />
              <span style={hint}>
                {!giver
                  ? "A parent, another adult or a child — anyone but the person it is for."
                  : giver === meId
                    ? "You are promising it, so it counts straight away."
                    : `${people.find((p) => p.id === giver)?.label ?? "They"} will be asked, and can say yes, change it, or say not this one.`}
              </span>
            </div>
          )}

          {state.error && (
            <p
              role="alert"
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-start",
                margin: "0 0 12px",
                padding: "0.6875rem 0.8125rem",
                borderRadius: 12,
                background: "color-mix(in srgb, var(--cal-occasion) 12%, transparent)",
                color: "var(--color-text)",
                fontSize: "0.875rem",
                lineHeight: 1.4,
              }}
            >
              <Icon name="info" size={16} style={{ color: "var(--cal-occasion)", flex: "none", marginTop: "0.0625rem" }} />
              {state.error}
            </p>
          )}

          <SubmitButton>Set goal</SubmitButton>
        </form>
      </div>
    </div>
  );
}
