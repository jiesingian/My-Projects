"use client";

import { useActionState, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { FormSheet } from "@/components/form-sheet";
import { ErrorText, SubmitButton } from "@/components/form";
import { markFamilyTreatAction, createGameGoalAction, createStepsGoalAction, gameStepsAction, gameTapAction, gameUntapAction, removeGameGoalAction, setGameGoalActiveAction, startFreshFromGoalsAction, updateGameGoalAction, type GameGoalFormState } from "@/lib/actions/game";
import { confirm } from "@/components/confirm-sheet";
import { goalsATargetCanHelp } from "@/lib/goals";
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
        <span role="alert" style={{ fontSize: "0.75rem", color: "var(--cal-occasion-ink)", maxWidth: "10rem" }}>
          {error}
        </span>
      )}
    </div>
  );
}

/** Start fresh from my goals (Janine, 21 October): removes every target
 * that helps no goal -- the starter pack's, the sample game's -- and, if
 * ticked, the starter rewards. Asks first; what they earned stays earned. */
export function StartFreshButton({ count }: { count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [withRewards, setWithRewards] = useState(true);
  const [result, setResult] = useState<{ error: string | null; text?: string }>({ error: null });
  return (
    <div style={{ border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)", borderRadius: 14, padding: "0.875rem" }}>
      <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>Start fresh from your goals</div>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.25rem 0 0.5rem", lineHeight: 1.45 }}>
        {count} target{count === 1 ? "" : "s"} help{count === 1 ? "s" : ""} no goal — the starter pack&rsquo;s and the sample&rsquo;s. Remove them, then add your own from each goal. XP, coins and badges already earned stay.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: 44, fontSize: "0.8125rem" }}>
        <input type="checkbox" checked={withRewards} onChange={(e) => setWithRewards(e.target.checked)} />
        Also take the starter rewards off the Shop
      </label>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={pending}
        style={{ color: "var(--cal-occasion-ink)" }}
        onClick={async () => {
          if (!(await confirm({ title: `Remove ${count} target${count === 1 ? "" : "s"}?`, description: "They leave every list. What they earned stays earned.", confirmLabel: "Remove" }))) return;
          start(async () => {
            const r = await startFreshFromGoalsAction(withRewards);
            setResult(r.error ? { error: r.error } : { error: null, text: `Removed ${r.targets} target${r.targets === 1 ? "" : "s"}${withRewards ? ` and ${r.rewards} reward${r.rewards === 1 ? "" : "s"}` : ""}.` });
            if (!r.error) router.refresh();
          });
        }}
      >
        {pending ? "Removing…" : `Remove ${count} target${count === 1 ? "" : "s"}`}
      </button>
      <ErrorText message={result.error} />
      {result.text && (
        <p role="status" style={{ fontSize: "0.8125rem", margin: "0.375rem 0 0" }}>
          {result.text}
        </p>
      )}
    </div>
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

/** A goal on Planner → Goals a target can help (20261021030000). */
export type HelpsGoal = { id: string; title: string; ownerId: string | null };
/** Opened from a goal: the form starts open, for that goal's person. */
export type TargetPreset = { goalId: string; who: string };

/** "Helps with": the goals this target may help, given who it is for -- that
 * person's own, or the whole household's. Every target comes from a goal
 * (Janine, 21 October), so it is required; with none to choose, it says
 * where to set one. */
function HelpsPicker({ goals, who, defaultValue }: { goals: HelpsGoal[]; who: string[]; defaultValue?: string | null }) {
  const uid = useId();
  const fits = goalsATargetCanHelp(goals, who);
  if (who.length === 0) return null;
  if (fits.length === 0) {
    return (
      <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, margin: "0 0 0.75rem", padding: "0.5rem 0.625rem", borderRadius: 10, background: "color-mix(in srgb, var(--cal-goal) 12%, transparent)" }}>
        Every target helps a goal. Set a goal for {who.length > 1 ? "the whole family" : "this person"} first on{" "}
        <Link scroll={false} href="/planner/goals/new" style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>
          Goals → Set a goal
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="field" style={{ marginBottom: "0.75rem" }}>
      <label htmlFor={`${uid}-helps`}>Helps with goal</label>
      <select id={`${uid}-helps`} className="input" name="helps" required defaultValue={defaultValue && fits.some((g) => g.id === defaultValue) ? defaultValue : fits.length === 1 ? fits[0].id : ""} key={fits.map((g) => g.id).join()} style={{ minHeight: "2.75rem" }}>
        <option value="" disabled>
          Choose a goal
        </option>
        {fits.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A grown-up's form for a new game goal. Several people → one goal each,
 * so each can be changed on its own later. */
export function GameGoalForm({ people, goals = [], preset }: { people: { id: string; label: string }[]; goals?: HelpsGoal[]; preset?: TargetPreset }) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(!!preset);
  const [who, setWho] = useState<Set<string>>(new Set(preset ? [preset.who] : []));
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


  return (
    <>
      <button type="button" className="btn btn-secondary btn-block" onClick={() => setOpen(true)} style={{ gap: "0.375rem" }}>
        <Icon name="plus" size={17} /> New target
      </button>
      {/* Opens over the page (Jonathan, 26 October). */}
      <FormSheet open={open} onClose={() => setOpen(false)} title="New target">
        <form action={formAction}>
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
          <HelpsPicker goals={goals} who={[...who]} defaultValue={preset?.goalId} />
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
      </FormSheet>
    </>
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
        <span role="alert" style={{ fontSize: "0.75rem", color: "var(--cal-occasion-ink)", flexBasis: "100%" }}>
          {error}
        </span>
      )}
    </div>
  );
}

/** A grown-up's form for steps: a daily goal per person with their own
 * target (6,000 for a child, 8,000 for a grown-up to start), or the
 * family's weekly total. */
export function StepsGoalForm({ people, goals = [], preset }: { people: { id: string; label: string; child: boolean }[]; goals?: HelpsGoal[]; preset?: TargetPreset }) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<Set<string>>(new Set(preset ? [preset.who] : []));
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


  return (
    <>
      <button type="button" className="btn btn-secondary btn-block" onClick={() => setOpen(true)} style={{ gap: "0.375rem" }}>
        🏃 New steps target
      </button>
      {/* Opens over the page (Jonathan, 26 October). */}
      <FormSheet open={open} onClose={() => setOpen(false)} title="New steps target">
        <form action={formAction}>
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
          <HelpsPicker goals={goals} who={[...who]} defaultValue={preset?.goalId} />
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
      </FormSheet>
    </>
  );
}

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/** Edit or remove a game goal, from Set up. A new target makes a new goal
 * (what was earned on the old one stays); everything else changes in place. */
export function GameGoalEdit({
  goal,
  goals = [],
}: {
  goal: { id: string; title: string; category: string; period: "day" | "week"; target: number; xp: number; points: number; days: number[] | null; emoji: string | null; owned: boolean; ownerId: string | null; helpsGoalId: string | null };
  goals?: HelpsGoal[];
}) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      const r = await fn();
      setError(r.error);
      if (!r.error) {
        setOpen(false);
        router.refresh();
      }
    });
  const small = { minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" };
  return (
    <>
      <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={small}>
        Edit
      </button>
      {open && (
        <form
          action={(fd) => run(() => updateGameGoalAction(goal.id, fd))}
          style={{ flexBasis: "100%", border: "1px solid color-mix(in srgb, var(--color-text) 12%, transparent)", borderRadius: 12, padding: "0.75rem", marginTop: "0.375rem" }}
        >
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-title`}>Name</label>
            <input id={`${uid}-title`} className="input" name="title" defaultValue={goal.title} maxLength={80} required />
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-target`}>Target</label>
              <input id={`${uid}-target`} className="input" name="target" type="number" step="any" min={0.5} defaultValue={goal.target} />
            </div>
            {goal.owned && (
              <>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${uid}-xp`}>XP</label>
                  <input id={`${uid}-xp`} className="input" name="xp" type="number" min={0} max={1000} defaultValue={goal.xp} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`${uid}-points`}>Coins</label>
                  <input id={`${uid}-points`} className="input" name="points" type="number" min={0} max={1000} defaultValue={goal.points} />
                </div>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor={`${uid}-cat`}>Category</label>
              <select id={`${uid}-cat`} className="input" name="category" defaultValue={goal.category} style={{ minHeight: "2.75rem" }}>
                {GAME_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {GAME_CATEGORY_META[c].emoji} {GAME_CATEGORY_META[c].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor={`${uid}-emoji`}>Picture</label>
              <input id={`${uid}-emoji`} className="input" name="emoji" defaultValue={goal.emoji ?? ""} maxLength={16} placeholder="🌳" />
            </div>
          </div>
          {goal.period === "day" && (
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.5rem" }}>
              <legend style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.25rem" }}>Which days</legend>
              <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                {WEEKDAY_LETTERS.map((l, i) => (
                  <label key={i} className="chip" style={{ cursor: "pointer", minWidth: "2.25rem", justifyContent: "center" }}>
                    <input type="checkbox" name="days" value={i + 1} defaultChecked={!goal.days || goal.days.includes(i + 1)} style={{ marginRight: "0.125rem" }} />
                    <span aria-label={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}>{l}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <HelpsPicker goals={goals} who={[goal.ownerId ?? "family"]} defaultValue={goal.helpsGoalId} />
          <p style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)", margin: "0 0 0.5rem", lineHeight: 1.4 }}>A new target starts a fresh goal; what the old one earned stays earned.</p>
          {error && <ErrorText message={error} />}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="submit" className="btn btn-primary" disabled={pending} style={{ flex: 1 }}>
              Save
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={async () => {
                if (!(await confirm({ title: `Remove "${goal.title}"?`, description: "It leaves every list. What it earned stays earned.", confirmLabel: "Remove" }))) return;
                run(() => removeGameGoalAction(goal.id));
              }}
              style={{ color: "var(--cal-occasion-ink)" }}
            >
              Remove
            </button>
          </div>
        </form>
      )}
    </>
  );
}

/** A grown-up marks the family-week treat as enjoyed, once. */
export function FamilyTreatUsed({ week }: { week: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await markFamilyTreatAction(week);
            setError(r.error);
            if (!r.error) router.refresh();
          })
        }
        style={{ minHeight: "2.25rem", fontSize: "0.8125rem", marginTop: "0.5rem" }}
      >
        We had it
      </button>
      <ErrorText message={error} />
    </>
  );
}

