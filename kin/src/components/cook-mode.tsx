"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { MAX_SERVINGS, MIN_SERVINGS, clampServings, findDurations, formatClock, scaleIngredient, type StepTimer } from "@/lib/cook";

type Ingredient = { name: string; qty: number | null; unit: string | null };

/** − 4 + : how many people this is for. Changing it rescales what is shown;
 * the saved recipe keeps its own `serves`. */
export function ServingsStepper({ servings, onChange, large = false }: { servings: number; onChange: (n: number) => void; large?: boolean }) {
  const size = large ? 48 : 38;
  return (
    <div className="kin-servings" role="group" aria-label="Servings">
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        style={{ width: size, height: size }}
        disabled={servings <= MIN_SERVINGS}
        onClick={() => onChange(clampServings(servings - 1))}
        aria-label="Fewer servings"
      >
        <span aria-hidden="true" style={{ fontSize: large ? "1.5rem" : "1.25rem", lineHeight: 1 }}>
          −
        </span>
      </button>
      <span
        aria-live="polite"
        style={{
          minWidth: large ? "5.5rem" : "4.75rem",
          textAlign: "center",
          fontSize: large ? "1.125rem" : "0.9375rem",
        }}
      >
        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{servings}</strong> {servings === 1 ? "serving" : "servings"}
      </span>
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        style={{ width: size, height: size }}
        disabled={servings >= MAX_SERVINGS}
        onClick={() => onChange(clampServings(servings + 1))}
        aria-label="More servings"
      >
        <Icon name="plus" size={large ? 20 : 16} />
      </button>
    </div>
  );
}

/** The ingredient list at the chosen servings. With `ticks`, each line can be
 * ticked off as it goes in the pot. */
export function ScaledIngredients({
  ingredients,
  serves,
  servings,
  ticked,
  onTick,
}: {
  ingredients: Ingredient[];
  serves: number;
  servings: number;
  ticked?: Set<number>;
  onTick?: (idx: number) => void;
}) {
  return (
    <ul className="kin-cook-ings" data-tickable={!!onTick}>
      {ingredients.map((ing, idx) => {
        const amount = scaleIngredient(ing, serves, servings).text;
        const done = ticked?.has(idx) ?? false;
        const body = (
          <>
            {onTick && (
              <span className="kin-cook-tick" data-on={done} aria-hidden="true">
                {done && <Icon name="check" size={14} />}
              </span>
            )}
            <span className="kin-cook-ing-name">{ing.name}</span>
            {amount && <span className="kin-cook-ing-amt">{amount}</span>}
          </>
        );
        return (
          <li key={idx} data-done={done}>
            {onTick ? (
              <button type="button" role="checkbox" aria-checked={done} onClick={() => onTick(idx)}>
                {body}
              </button>
            ) : (
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Keep the screen on while cooking: hands are in the bowl, not on the
 * phone. The lock drops whenever the page is hidden, so it is taken again on
 * return. Where the browser has no Wake Lock API this quietly does nothing. */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<Sentinel> };
    };
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    let gone = false;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      nav.wakeLock!.request("screen").then(
        (l) => {
          if (gone) void l.release().catch(() => {});
          else lock = l;
        },
        () => {},
      );
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => {});
    };
  }, []);
}

type Running = { id: string; label: string; endsAt: number; total: number };

/** Kitchen timers started from a step. They keep running while the cook
 * moves between steps, and count from a fixed end time so a phone that
 * throttled the tab still shows the right number when it comes back. */
function useTimers() {
  const [timers, setTimers] = useState<Running[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const rang = useRef(new Set<string>());

  useEffect(() => {
    if (timers.length === 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [timers.length]);

  useEffect(() => {
    for (const t of timers) {
      if (t.endsAt <= now && !rang.current.has(t.id)) {
        rang.current.add(t.id);
        navigator.vibrate?.([300, 150, 300, 150, 300]);
      }
    }
  }, [now, timers]);

  const start = useCallback((timer: StepTimer, step: number) => {
    const id = `${step}-${timer.seconds}-${Date.now()}`;
    setNow(Date.now());
    setTimers((prev) => [
      ...prev,
      {
        id,
        label: `Step ${step + 1} · ${timer.label}`,
        endsAt: Date.now() + timer.seconds * 1000,
        total: timer.seconds,
      },
    ]);
  }, []);
  const stop = useCallback((id: string) => setTimers((prev) => prev.filter((t) => t.id !== id)), []);

  return { timers, now, start, stop };
}

/** Cook mode: the recipe's steps one at a time, big enough to read from
 * across the counter, with the ingredients a tap away. */
export function CookMode({
  name,
  steps,
  ingredients,
  serves,
  servings,
  onServings,
  onClose,
}: {
  name: string;
  steps: string[];
  ingredients: Ingredient[];
  serves: number;
  servings: number;
  onServings: (n: number) => void;
  onClose: () => void;
}) {
  const headingId = useId();
  const [step, setStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [ticked, setTicked] = useState<Set<number>>(() => new Set());
  const { timers, now, start, stop } = useTimers();
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useWakeLock();

  const total = steps.length;
  const last = step >= total - 1;
  const next = useCallback(() => setStep((s) => Math.min(total - 1, s + 1)), [total]);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  // The page behind stays where it was, and doesn't scroll under a thumb.
  // Focus goes back to whatever opened cook mode when it closes.
  useEffect(() => {
    const before = document.body.style.overflow;
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      opener?.focus?.();
    };
  }, []);

  // Cook mode sits beside the recipe-book drawer, whose focus trap pulls
  // focus back into the drawer whenever it lands elsewhere. Focus moving
  // into or within cook mode is kept from reaching that trap (window capture
  // runs before its document listeners); every other focus event is left
  // alone.
  useEffect(() => {
    const inside = (node: EventTarget | null) => node instanceof Node && !!rootRef.current?.contains(node);
    const onFocusIn = (e: FocusEvent) => {
      if (inside(e.target)) e.stopPropagation();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (inside(e.relatedTarget)) e.stopPropagation();
    };
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("focusout", onFocusOut, true);
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("focusout", onFocusOut, true);
    };
  }, []);

  // Arrow keys and Escape for anyone cooking from a laptop or tablet keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (showIngredients) setShowIngredients(false);
        else onClose();
      } else if (!showIngredients && e.key === "ArrowRight") next();
      else if (!showIngredients && e.key === "ArrowLeft") back();
    };
    // Capture on window runs before the drawer's own Escape handler.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [showIngredients, next, back, onClose]);

  if (typeof document === "undefined") return null;

  const text = steps[step] ?? "";
  const durations = findDurations(text);

  return createPortal(
    <div ref={rootRef} className="kin-cook" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <header className="kin-cook-head">
        <button ref={closeRef} type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Leave cook mode">
          <Icon name="x" size={22} />
        </button>
        <div style={{ minWidth: 0, textAlign: "center" }}>
          <div id={headingId} className="kin-cook-title">
            {name}
          </div>
          <div className="kin-cook-count">
            Step {step + 1} of {total}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => setShowIngredients(true)}
          aria-label="Ingredients"
          aria-expanded={showIngredients}
        >
          <Icon name="basket" size={22} />
        </button>
      </header>

      <div className="kin-cook-progress" aria-hidden="true">
        <span style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>

      <main className="kin-cook-body" aria-live="polite">
        <p className="kin-cook-step">{text}</p>
        {durations.length > 0 && (
          <div className="kin-cook-timers">
            {durations.map((d, i) => (
              <button key={i} type="button" className="btn btn-secondary" onClick={() => start(d, step)}>
                <Icon name="clock" size={18} /> Start {d.label} timer
              </button>
            ))}
          </div>
        )}
      </main>

      {timers.length > 0 && (
        <div className="kin-cook-running" role="status">
          {timers.map((t) => {
            const left = (t.endsAt - now) / 1000;
            const done = left <= 0;
            return (
              <div key={t.id} className="kin-cook-timer" data-done={done}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="kin-cook-timer-label">{t.label}</span>
                  <span className="kin-cook-timer-clock">{done ? "Time's up" : formatClock(left)}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={() => stop(t.id)}
                  aria-label={done ? `Dismiss ${t.label}` : `Cancel ${t.label}`}
                >
                  <Icon name="x" size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <footer className="kin-cook-foot">
        <button type="button" className="btn btn-secondary" onClick={back} disabled={step === 0}>
          <Icon name="chevronLeft" size={18} /> Back
        </button>
        {last ? (
          <button type="button" className="btn btn-primary" onClick={onClose}>
            <Icon name="check" size={18} /> Done
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={next}>
            Next <Icon name="chevronLeft" size={18} style={{ transform: "rotate(180deg)" }} />
          </button>
        )}
      </footer>

      {showIngredients && (
        <div className="kin-cook-sheet" role="dialog" aria-label="Ingredients">
          <div className="kin-cook-sheet-head">
            <span className="kin-cook-title">Ingredients</span>
            <button type="button" className="btn btn-ghost" onClick={() => setShowIngredients(false)}>
              Back to step {step + 1}
            </button>
          </div>
          <div className="kin-cook-sheet-body">
            <div style={{ marginBottom: "0.5rem" }}>
              <ServingsStepper servings={servings} onChange={onServings} large />
            </div>
            <ScaledIngredients
              ingredients={ingredients}
              serves={serves}
              servings={servings}
              ticked={ticked}
              onTick={(idx) =>
                setTicked((prev) => {
                  const nextSet = new Set(prev);
                  if (nextSet.has(idx)) nextSet.delete(idx);
                  else nextSet.add(idx);
                  return nextSet;
                })
              }
            />
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
