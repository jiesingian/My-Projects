"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { ErrorText, SubmitButton } from "@/components/form";
import { createGameGoalAction, createStepsGoalAction, gameStepsAction, gameTapAction, gameUntapAction, setGameGoalActiveAction, startSampleGameAction, type GameGoalFormState } from "@/lib/actions/game";
import { DEFAULT_FAMILY_WEEK_STEPS, DEFAULT_GOAL_COINS, DEFAULT_GOAL_XP, DEFAULT_STEP_TARGET, GAME_CATEGORIES, GAME_CATEGORY_META, STEP_QUICK_ADDS } from "@/lib/game";

/** The "+" and "−" on a game goal. The database decides who may tap for
 * whom (20261020120000); this just shows the answer. */
export function GameTap({ goalId, title, canUndo }: { goalId: string; title: string; canUndo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: (id: string) => Promise<{ error: string | null }>) =>
    start(async () => {
      const r = await fn(goalId);
      setError(r.error);
      if (!r.error) router.refresh();
    });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
      {canUndo && (
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => run(gameUntapAction)} aria-label={`Take one back: ${title}`} style={{ minHeight: "2.25rem", minWidth: "2.25rem", padding: 0 }}>
          −
        </button>
      )}
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(gameTapAction)} aria-label={`Add one: ${title}`} style={{ minHeight: "2.75rem", minWidth: "2.75rem", padding: 0, borderRadius: 999 }}>
        <Icon name="plus" size={20} />
      </button>
      {error && (
        <span role="alert" style={{ fontSize: "0.75rem", color: "var(--cal-occasion)", maxWidth: "10rem" }}>
          {error}
        </span>
      )}
    </div>
  );
}

export function SampleGameButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await startSampleGameAction();
            setError(r.error);
            if (!r.error) router.refresh();
          })
        }
      >
        <Icon name="sparkle" size={17} /> {pending ? "Setting up…" : "Start with sample goals and rewards"}
      </button>
      <ErrorText message={error} />
    </>
  );
}

export function GameGoalPause({ goalId, active }: { goalId: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await setGameGoalActiveAction(goalId, !active);
          if (!r.error) router.refresh();
        })
      }
      style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" }}
    >
      {active ? "Pause" : "Resume"}
    </button>
  );
}

const initial: GameGoalFormState = { error: null };

/** A grown-up's form for a new game goal. Several people → one goal each,
 * so each can be changed on its own later. */
export function GameGoalForm({ people }: { people: { id: string; label: string }[] }) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Set<string>>(new Set());
  const [state, formAction] = useActionState(async (prev: GameGoalFormState, formData: FormData) => {
    const r = await createGameGoalAction(prev, formData);
    if (r.saved) {
      setOpen(false);
      setWho(new Set());
      router.refresh();
    }
    return r;
  }, initial);
  const family = who.has("family");
  const toggle = (id: string) =>
    setWho((prev) => {
      if (id === "family") return prev.has("family") ? new Set() : new Set(["family"]);
      const next = new Set([...prev].filter((x) => x !== "family"));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" onClick={() => setOpen(true)} style={{ gap: "0.375rem" }}>
        <Icon name="plus" size={17} /> New game goal
      </button>
    );
  }

  return (
    <form action={formAction} style={{ border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)", borderRadius: 14, padding: "0.875rem" }}>
      <div className="field" style={{ marginBottom: "0.75rem" }}>
        <label htmlFor={`${uid}-title`}>Name</label>
        <input id={`${uid}-title`} className="input" name="title" required maxLength={80} placeholder="Brush teeth" />
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.75rem" }}>
        <legend style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>Category</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
          {GAME_CATEGORIES.map((c, i) => (
            <label key={c} className="chip" style={{ cursor: "pointer" }}>
              <input type="radio" name="category" value={c} defaultChecked={i === 0} style={{ marginRight: "0.25rem" }} />
              {GAME_CATEGORY_META[c].emoji} {GAME_CATEGORY_META[c].label}
            </label>
          ))}
        </div>
      </fieldset>
      <div style={{ display: "flex", gap: "0.625rem", marginBottom: "0.75rem" }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${uid}-target`}>Target</label>
          <input id={`${uid}-target`} className="input" name="target" type="number" inputMode="numeric" min={1} max={1000} defaultValue={1} required />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${uid}-unit`}>Counting</label>
          <input id={`${uid}-unit`} className="input" name="unit" maxLength={24} placeholder="times" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`${uid}-period`}>Every</label>
          <select id={`${uid}-period`} className="input" name="period" defaultValue="day" style={{ minHeight: "2.75rem" }}>
            <option value="day">day</option>
            <option value="week">week</option>
          </select>
        </div>
      </div>
      {!family && (
        <div style={{ display: "flex", gap: "0.625rem", marginBottom: "0.75rem" }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${uid}-xp`}>XP each time</label>
            <input id={`${uid}-xp`} className="input" name="xp" type="number" inputMode="numeric" min={0} max={1000} defaultValue={DEFAULT_GOAL_XP} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${uid}-points`}>Coins each time</label>
            <input id={`${uid}-points`} className="input" name="points" type="number" inputMode="numeric" min={0} max={1000} defaultValue={DEFAULT_GOAL_COINS} />
          </div>
        </div>
      )}
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.75rem" }}>
        <legend style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>For</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
          {people.map((p) => (
            <label key={p.id} className="chip" data-active={who.has(p.id)} style={{ cursor: "pointer" }}>
              <input type="checkbox" name="who" value={p.id} checked={who.has(p.id)} onChange={() => toggle(p.id)} style={{ marginRight: "0.25rem" }} />
              {p.label}
            </label>
          ))}
          <label className="chip" data-active={family} style={{ cursor: "pointer" }}>
            <input type="checkbox" name="who" value="family" checked={family} onChange={() => toggle("family")} style={{ marginRight: "0.25rem" }} />
            Whole family (one shared goal)
          </label>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.375rem 0 0", lineHeight: 1.4 }}>
          {family ? "Everyone's taps add to one target. A shared goal earns no XP or coins." : "Each person gets their own copy, so you can give a child and a grown-up different targets."}
        </p>
      </fieldset>
      <ErrorText message={state.error} />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1 }}>
          Save
        </SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Today's steps on a steps game goal: the day's number, or +500 / +1,000
 * on top of what was typed. Half the XP and coins at 50%, the rest at 100%
 * (lib/actions/game gameStepsAction). */
export function GameSteps({ goalId, title }: { goalId: string; title: string }) {
  const uid = useId();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const n = Number(value.replace(/,/g, ""));
  const run = (amount: number, mode: "set" | "add") =>
    start(async () => {
      const r = await gameStepsAction(goalId, amount, mode);
      setError(r.error);
      if (!r.error) {
        setValue("");
        router.refresh();
      }
    });
  const small = { minHeight: "2.25rem", fontSize: "0.8125rem", padding: "0 0.625rem" };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem", marginTop: "0.5rem" }}>
      <label htmlFor={`${uid}-steps`} className="sr-only">
        Today&rsquo;s steps for {title}
      </label>
      <input
        id={`${uid}-steps`}
        className="input"
        type="number"
        inputMode="numeric"
        min={0}
        max={200000}
        step={1}
        placeholder="Today's steps"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: "8.5rem", minHeight: "2.25rem", fontSize: "1rem" }}
      />
      <button type="button" className="btn btn-primary" disabled={pending || !(n >= 0 && value !== "")} onClick={() => run(Math.round(n), "set")} style={small}>
        Save
      </button>
      {STEP_QUICK_ADDS.map((q) => (
        <button key={q} type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(q, "add")} aria-label={`Add ${q.toLocaleString("en-PH")} steps: ${title}`} style={small}>
          +{q.toLocaleString("en-PH")}
        </button>
      ))}
      {error && (
        <span role="alert" style={{ fontSize: "0.75rem", color: "var(--cal-occasion)", flexBasis: "100%" }}>
          {error}
        </span>
      )}
    </div>
  );
}

/** A grown-up's form for steps: a daily goal per person with their own
 * target (6,000 for a child, 8,000 for a grown-up to start), or the
 * family's weekly total. */
export function StepsGoalForm({ people }: { people: { id: string; label: string; child: boolean }[] }) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Set<string>>(new Set());
  const [state, formAction] = useActionState(async (prev: GameGoalFormState, formData: FormData) => {
    const r = await createStepsGoalAction(prev, formData);
    if (r.saved) {
      setOpen(false);
      setWho(new Set());
      router.refresh();
    }
    return r;
  }, initial);
  const family = who.has("family");
  const toggle = (id: string) =>
    setWho((prev) => {
      if (id === "family") return prev.has("family") ? new Set() : new Set(["family"]);
      const next = new Set([...prev].filter((x) => x !== "family"));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" onClick={() => setOpen(true)} style={{ gap: "0.375rem" }}>
        🏃 New steps goal
      </button>
    );
  }

  return (
    <form action={formAction} style={{ border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)", borderRadius: 14, padding: "0.875rem" }}>
      <div className="field" style={{ marginBottom: "0.75rem" }}>
        <label htmlFor={`${uid}-title`}>Name</label>
        <input id={`${uid}-title`} className="input" name="title" maxLength={80} defaultValue={family ? "Family steps this week" : "Steps"} key={family ? "f" : "p"} />
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.75rem" }}>
        <legend style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>For</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
          {people.map((p) => (
            <label key={p.id} className="chip" data-active={who.has(p.id)} style={{ cursor: "pointer" }}>
              <input type="checkbox" name="who" value={p.id} checked={who.has(p.id)} onChange={() => toggle(p.id)} style={{ marginRight: "0.25rem" }} />
              {p.label}
            </label>
          ))}
          <label className="chip" data-active={family} style={{ cursor: "pointer" }}>
            <input type="checkbox" name="who" value="family" checked={family} onChange={() => toggle("family")} style={{ marginRight: "0.25rem" }} />
            Whole family, each week
          </label>
        </div>
      </fieldset>
      {family ? (
        <div className="field" style={{ marginBottom: "0.75rem" }}>
          <label htmlFor={`${uid}-family`}>Family steps a week</label>
          <input id={`${uid}-family`} className="input" name="family_target" type="number" inputMode="numeric" min={100} max={5000000} defaultValue={DEFAULT_FAMILY_WEEK_STEPS} required />
          <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.375rem 0 0", lineHeight: 1.4 }}>
            Everyone&rsquo;s daily steps add up. When the week reaches it, everyone playing gets +50 XP and +25 coins.
          </p>
        </div>
      ) : (
        <>
          {people
            .filter((p) => who.has(p.id))
            .map((p) => (
              <div key={p.id} className="field" style={{ marginBottom: "0.5rem" }}>
                <label htmlFor={`${uid}-t-${p.id}`}>{p.label}&rsquo;s steps a day</label>
                <input id={`${uid}-t-${p.id}`} className="input" name={`target_${p.id}`} type="number" inputMode="numeric" min={100} max={100000} defaultValue={p.child ? DEFAULT_STEP_TARGET.child : DEFAULT_STEP_TARGET.grownUp} required />
              </div>
            ))}
          <div style={{ display: "flex", gap: "0.625rem", margin: "0.25rem 0 0.75rem" }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-xp`}>XP a day</label>
              <input id={`${uid}-xp`} className="input" name="xp" type="number" inputMode="numeric" min={0} max={1000} defaultValue={DEFAULT_GOAL_XP} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-points`}>Coins a day</label>
              <input id={`${uid}-points`} className="input" name="points" type="number" inputMode="numeric" min={0} max={1000} defaultValue={DEFAULT_GOAL_COINS} />
            </div>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem", lineHeight: 1.4 }}>Half the XP and coins at 50% of the target, the rest at 100%.</p>
        </>
      )}
      <ErrorText message={state.error} />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1 }}>
          Save
        </SubmitButton>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
