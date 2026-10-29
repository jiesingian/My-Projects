"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormSheet } from "@/components/form-sheet";
import { AmountInput } from "@/components/amount-input";
import { DateInput } from "@/components/date-input";
import { confirm } from "@/components/confirm-sheet";
import { currencySymbol } from "@/lib/format";
import { makeWealthGoalAction, stopWealthGoalAction, updateWealthGoalAction } from "@/lib/actions/wealth-goals";
import type { Tracks } from "@/lib/wealth-goals";

/** What the sheet needs of a goal already set (TrackedGoal, trimmed). */
export type GoalMark = { id: string; title: string; setTo: number; dueDate: string | null; watchOnTime: boolean; fraction: number; reached: boolean; over: boolean; caption: string; lines: string[] };

const WORDS: Record<Tracks, { what: string; amount: string; hint: string; dateLabel: string }> = {
  account: { what: "Save it up to a balance", amount: "Balance to reach", hint: "Fills as the account's balance grows.", dateLabel: "By (optional)" },
  loan: { what: "Pay it down by a date", amount: "Owe this much (0 = paid off)", hint: "Fills as the balance goes down. Kin works out whether the payments get there in time.", dateLabel: "By" },
  income: { what: "Bring in so much a month", amount: "A month from it", hint: "Fills with what comes in from it each month.", dateLabel: "By (optional)" },
  expense: { what: "Keep it under a limit a month", amount: "Limit a month", hint: "It's this category's budget too. Fills as you spend; red past the limit.", dateLabel: "Until (optional)" },
  asset: { what: "Save up to replace or upgrade it", amount: "Fund to reach", hint: "A savings fund on Wealth, the same as any other; put money in from Goals.", dateLabel: "By (optional)" },
};

/** 🎯 on a Wealth entry (Jonathan, 29 October): "Make it a goal" when it
 * isn't one, and when it is, the mark that says so -- with how far along --
 * that opens where it stands, its number and date to change, and a way to
 * stop it. The goal lives on Planner's Goals too. */
export function WealthGoalButton({
  tracks,
  id = null,
  category = null,
  whose = null,
  suggest,
  goal,
  currency,
}: {
  tracks: Tracks;
  id?: string | null;
  category?: string | null;
  whose?: string | null;
  suggest: { title: string; amount: number; dueDate?: string | null; watchOnTime?: boolean };
  goal: GoalMark | null;
  currency: string;
}) {
  const uid = useId();
  const router = useRouter();
  const words = WORDS[tracks];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(suggest.title);
  const [amount, setAmount] = useState(goal ? goal.setTo : suggest.amount);
  const [dueDate, setDueDate] = useState(goal ? (goal.dueDate ?? "") : (suggest.dueDate ?? ""));
  const [onTime, setOnTime] = useState(goal ? goal.watchOnTime : !!suggest.watchOnTime);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sym = currencySymbol(currency);
  const pct = goal ? Math.round(goal.fraction * 100) : 0;

  const save = () =>
    start(async () => {
      const res = goal
        ? await updateWealthGoalAction(goal.id, { amount, dueDate: dueDate || null, watchOnTime: onTime })
        : await makeWealthGoalAction({ tracks, id, category, whose, title, amount, dueDate: dueDate || null, watchOnTime: onTime });
      setError(res.error);
      if (res.error) return;
      setOpen(false);
      router.refresh();
    });
  const stop = async () => {
    if (!goal) return;
    if (!(await confirm({ title: `Stop "${goal.title}"?`, description: "It goes from Planner. Nothing on Wealth changes" + (tracks === "asset" ? "; what's in its fund stays there." : "."), confirmLabel: "Stop the goal", danger: true }))) return;
    start(async () => {
      const res = await stopWealthGoalAction(goal.id);
      setError(res.error);
      if (res.error) return;
      setOpen(false);
      router.refresh();
    });
  };

  const colour = goal?.over ? "var(--cal-occasion)" : "var(--color-accent-700)";
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // On an account's row, which is a link: this isn't following it.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={goal ? `Goal: ${goal.title}, ${goal.over ? "over the limit" : `${pct}%`}` : "Make it a goal"}
        className={goal ? undefined : "btn btn-ghost"}
        style={
          goal
            ? { display: "inline-flex", alignItems: "center", gap: "0.3125rem", minHeight: "1.75rem", padding: "0 0.5625rem", borderRadius: 999, border: `1px solid color-mix(in srgb, ${colour} 40%, transparent)`, background: `color-mix(in srgb, ${colour} 10%, transparent)`, color: colour, font: "600 0.75rem/1 var(--font-numeric)", cursor: "pointer" }
            : { minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem", color: "var(--color-accent-700)" }
        }
      >
        <span aria-hidden="true">🎯</span>
        {goal ? (goal.over ? "Over" : goal.reached ? "Reached" : `${pct}%`) : "Make it a goal"}
      </button>
      {/* A portal, but inside the row's link in React's tree: nothing in it
          may bubble up and follow it. */}
      <span onClick={(e) => e.stopPropagation()}>
      <FormSheet open={open} onClose={() => setOpen(false)} title={goal ? goal.title : words.what}>
        <div style={{ display: "grid", gap: "0.625rem", alignContent: "start", textAlign: "left" }}>
          {goal && (
            <>
              <div style={{ height: 8, borderRadius: 999, background: "color-mix(in srgb, var(--color-text) 8%, transparent)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: colour }} />
              </div>
              <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{goal.caption}</div>
              {goal.lines.map((l) => (
                <p key={l} style={{ fontSize: "0.8125rem", margin: 0, lineHeight: 1.45, color: "var(--color-neutral-700)" }}>
                  {l}
                </p>
              ))}
              <Link href="/planner?seg=goals" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-accent-700)", textDecoration: "none" }}>
                See it on Planner ›
              </Link>
              <div style={{ borderTop: "1px solid var(--color-divider)", margin: "0.25rem 0 0" }} />
            </>
          )}
          {!goal && (
            <>
              <p style={{ fontSize: "0.8125rem", margin: 0, color: "var(--color-neutral-600)", lineHeight: 1.45 }}>{words.hint} It shows on Planner&apos;s Goals, and here with 🎯.</p>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor={`${uid}-title`}>Name</label>
                <input id={`${uid}-title`} className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} style={{ minHeight: "2.625rem" }} />
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`${uid}-amount`}>
                {words.amount} ({sym})
              </label>
              <AmountInput id={`${uid}-amount`} ariaLabel={`${words.amount} (${sym})`} defaultValue={amount} onValueChange={setAmount} style={{ minHeight: "2.625rem" }} />
            </div>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`${uid}-date`}>{words.dateLabel}</label>
              <DateInput id={`${uid}-date`} className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ minHeight: "2.625rem" }} />
            </div>
          </div>
          {tracks === "income" && (
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.8125rem", lineHeight: 1.4 }}>
              <input type="checkbox" checked={onTime} onChange={(e) => setOnTime(e.target.checked)} style={{ marginTop: "0.1875rem" }} />
              <span>Watch that it comes on its day and in full: a late or short one (deductions) is flagged.</span>
            </label>
          )}
          {error && (
            <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: 0 }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-primary" disabled={pending} onClick={save} style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}>
              {pending ? "…" : goal ? "Save" : "🎯 Make it a goal"}
            </button>
            {goal ? (
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={stop} style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}>
                Stop the goal
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </FormSheet>
      </span>
    </>
  );
}
