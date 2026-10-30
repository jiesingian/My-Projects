"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormSheet } from "@/components/form-sheet";
import { AmountInput } from "@/components/amount-input";
import { DateInput } from "@/components/date-input";
import { confirm } from "@/components/confirm-sheet";
import { currencySymbol } from "@/lib/format";
import { autoSaveWealthGoalAction, makeWealthGoalAction, stopWealthGoalAction, updateWealthGoalAction } from "@/lib/actions/wealth-goals";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Tracks } from "@/lib/wealth-goals";

/** What the sheet needs of a goal already set (TrackedGoal, trimmed). */
export type GoalMark = {
  id: string;
  title: string;
  setTo: number;
  dueDate: string | null;
  watchOnTime: boolean;
  fraction: number;
  reached: boolean;
  over: boolean;
  caption: string;
  lines: string[];
  /** What a month gets it there; its auto-save, if set up; the next payday. */
  perMonth?: number | null;
  autoSave?: { amount: number; accountId: string | null; next: string | null } | null;
  payday?: string | null;
  paydayKnown?: boolean;
};

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
  accounts = [],
}: {
  tracks: Tracks;
  id?: string | null;
  category?: string | null;
  whose?: string | null;
  suggest: { title: string; amount: number; dueDate?: string | null; watchOnTime?: boolean };
  goal: GoalMark | null;
  currency: string;
  /** Accounts the auto-save can come out of (a fund's or a loan's). */
  accounts?: { id: string; name: string }[];
}) {
  const uid = useId();
  const router = useRouter();
  const words = WORDS[tracks];
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(suggest.title);
  const [amount, setAmount] = useState(goal ? goal.setTo : suggest.amount);
  const [dueDate, setDueDate] = useState(goal ? (goal.dueDate ?? "") : (suggest.dueDate ?? ""));
  const [onTime, setOnTime] = useState(goal ? goal.watchOnTime : !!suggest.watchOnTime);
  // The amount box takes its value once; "Set the next one" starts it over.
  const [fresh, setFresh] = useState(0);
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
              {/* Reached (29 October): the next one, from here -- a higher
                  balance or fund, or for a loan paid off, its payment saved. */}
              {goal.reached && (
                <div style={{ border: "1px solid color-mix(in srgb, var(--color-accent-700) 30%, transparent)", background: "color-mix(in srgb, var(--color-accent-700) 6%, transparent)", borderRadius: 10, padding: "0.625rem 0.75rem", display: "grid", gap: "0.375rem" }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>Reached 🎉 It&apos;s in the Journal.</div>
                  {tracks === "loan" ? (
                    <Link href={`/wealth/add?${new URLSearchParams({ title: `After ${goal.title}` })}`} className="btn btn-secondary" style={{ justifySelf: "start", minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                      Save what its payment freed up
                    </Link>
                  ) : tracks === "account" || tracks === "asset" ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setAmount(Math.ceil((goal.setTo * 1.5) / 10000) * 10000);
                        setDueDate("");
                        setFresh((n) => n + 1);
                      }}
                      style={{ justifySelf: "start", minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem" }}
                    >
                      Set the next one: {formatCurrency(Math.ceil((goal.setTo * 1.5) / 10000) * 10000, currency)}
                    </button>
                  ) : null}
                </div>
              )}
              {/* Auto-save (29 October): the month's amount as a monthly bill
                  on Today, into a fund or extra on a loan. */}
              {(tracks === "asset" || tracks === "loan" || tracks === "account") && !goal.reached && (goal.autoSave || goal.perMonth) ? <AutoSave goal={goal} tracks={tracks} accounts={tracks === "account" ? accounts.filter((x) => x.id !== id) : accounts} currency={currency} /> : null}
              {/* A balance: the month's amount moved there now. */}
              {tracks === "account" && id && goal.perMonth ? (
                <Link href={`/wealth/transact?mode=transfer&to=${id}&amount=${goal.perMonth}`} className="btn btn-secondary" style={{ justifySelf: "start", minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.75rem", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                  Move {formatCurrency(goal.perMonth, currency)} there now
                </Link>
              ) : null}
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
              <AmountInput key={fresh} id={`${uid}-amount`} ariaLabel={`${words.amount} (${sym})`} defaultValue={amount} onValueChange={setAmount} style={{ minHeight: "2.625rem" }} />
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

/** The month's amount as a monthly bill on Today (Jonathan, 29 October):
 * from which account, starting which day -- payday, as suggested. Set up,
 * it says so, and its amount or account can be changed here. */
function AutoSave({ goal, tracks, accounts, currency }: { goal: GoalMark; tracks: "asset" | "loan" | "account"; accounts: { id: string; name: string }[]; currency: string }) {
  const uid = useId();
  const router = useRouter();
  const set = goal.autoSave ?? null;
  const [editing, setEditing] = useState(!set);
  const [amount, setAmount] = useState(set?.amount ?? goal.perMonth ?? 0);
  const [accountId, setAccountId] = useState(set?.accountId ?? accounts[0]?.id ?? "");
  const [first, setFirst] = useState(set?.next ?? goal.payday ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const what = tracks === "asset" ? "into its fund" : tracks === "account" ? "moved into the account" : "extra on the loan";
  if (accounts.length === 0) return null;
  const save = () =>
    start(async () => {
      const res = await autoSaveWealthGoalAction(goal.id, { amount, accountId, firstDate: first });
      setError(res.error);
      if (res.error) return;
      setEditing(false);
      router.refresh();
    });
  return (
    <div style={{ border: "1px solid var(--color-divider)", borderRadius: 10, padding: "0.625rem 0.75rem", display: "grid", gap: "0.5rem" }}>
      <div style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Auto-save</div>
      {set && !editing ? (
        <>
          <p style={{ fontSize: "0.8125rem", margin: 0, lineHeight: 1.45 }}>
            {formatCurrency(set.amount, currency)} a month {what}
            {set.accountId && accounts.find((a) => a.id === set.accountId) ? ` from ${accounts.find((a) => a.id === set.accountId)!.name}` : ""}
            {set.next ? `, next on ${formatDate(set.next)}` : ""}. It&apos;s on Today like a bill: Pay puts it in.
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)} style={{ justifySelf: "start", minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem", color: "var(--color-accent-700)" }}>
            Change it
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: "0.78125rem", margin: 0, color: "var(--color-neutral-600)", lineHeight: 1.45 }}>
            {formatCurrency(goal.perMonth ?? amount, currency)} a month {what}, as a monthly bill on Today{goal.paydayKnown ? ", starting payday" : ""}. Pay puts it in.
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`${uid}-amt`}>A month ({currencySymbol(currency)})</label>
              <AmountInput id={`${uid}-amt`} ariaLabel={`A month (${currencySymbol(currency)})`} defaultValue={amount} onValueChange={setAmount} style={{ minHeight: "2.5rem" }} />
            </div>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`${uid}-first`}>First one</label>
              <DateInput id={`${uid}-first`} className="input" value={first} onChange={(e) => setFirst(e.target.value)} style={{ minHeight: "2.5rem" }} />
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-from`}>From</label>
            <select id={`${uid}-from`} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ minHeight: "2.5rem" }}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: 0 }}>
              {error}
            </p>
          )}
          <button type="button" className="btn btn-primary" disabled={pending || !(amount > 0) || !first || !accountId} onClick={save} style={{ minHeight: "2.25rem", fontSize: "0.8125rem" }}>
            {pending ? "…" : set ? "Save auto-save" : "Set up auto-save"}
          </button>
        </>
      )}
    </div>
  );
}
