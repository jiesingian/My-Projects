"use client";

import { useActionState, useState } from "react";
import { createGoalAction } from "@/lib/actions/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { currencySymbol } from "@/lib/format";
import type { PickableAccount } from "@/components/money-actions";
import { AccountOptions } from "@/components/account-options";
import { DateInput } from "@/components/date-input";
import { SINKING_FUND_PRESETS } from "@/lib/sinking-fund";
import { monthlyNeeded } from "@/lib/goal-plan";
import { formatCurrency } from "@/lib/format";

const initialState: ActionState = { error: null };

export function AddGoalForm({ accounts, currency, today, kids: children = [] }: { accounts: PickableAccount[]; currency: string; today: string; kids?: { id: string; label: string }[] }) {
  const [state, formAction] = useActionState(createGoalAction, initialState);
  // "joint", "me", or a child's member id (26 October).
  const [whose, setWhose] = useState("joint");
  const isJoint = whose === "joint";
  const [yearly, setYearly] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  // The same goal as a ring on Planner (26 October): on unless unticked.
  const [onPlanner, setOnPlanner] = useState(true);
  // Start and end, and what that asks of each month (26 October).
  const [target, setTarget] = useState("");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const plan = monthlyNeeded(Number(target), start || today, end);
  // Up to two sources, each with what it gives a month (26 October).
  const [from1, setFrom1] = useState("");
  const [from2, setFrom2] = useState("");
  const [amount1, setAmount1] = useState("");
  const [amount2, setAmount2] = useState("");
  const [secondSource, setSecondSource] = useState(false);
  const sourcesGive = (from1 ? Number(amount1) || 0 : 0) + (secondSource && from2 ? Number(amount2) || 0 : 0);

  return (
    <form action={formAction}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <input type="hidden" name="owner" value={isJoint ? "" : whose} />
      <input type="hidden" name="repeats_yearly" value={yearly ? "on" : ""} />
      <input type="hidden" name="track_on_planner" value={onPlanner ? "on" : ""} />
      <ErrorText message={state.error} />
      <div style={{ display: "flex", gap: "0.4375rem", marginBottom: "0.5rem" }}>
        <button type="button" className="chip" data-active={!yearly} onClick={() => setYearly(false)}>
          Once
        </button>
        <button type="button" className="chip" data-active={yearly} onClick={() => setYearly(true)}>
          Every year
        </button>
      </div>
      {yearly && (
        <>
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.5rem" }}>
            A sinking fund for a cost that comes back every year. Kin works out what to set aside each payday to have it by the date.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.875rem" }}>
            {SINKING_FUND_PRESETS.map((p) => (
              <button
                key={p.title}
                type="button"
                className="chip"
                data-active={title === p.title}
                onClick={() => {
                  setTitle(p.title);
                  setNote(p.note);
                }}
              >
                {p.title}
              </button>
            ))}
          </div>
        </>
      )}
      <Field label="Title">
        <input className="input" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={yearly ? "Tuition · school year 2027–28" : "Emergency fund · six months"} required style={{ minHeight: "2.75rem" }} />
      </Field>
      <Field label="Note">
        <input className="input" name="sub_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Six months of household costs" style={{ minHeight: "2.75rem" }} />
      </Field>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4375rem", marginBottom: "1rem" }}>
        <button type="button" className="chip" data-active={isJoint} onClick={() => setWhose("joint")}>
          Joint
        </button>
        {children.map((c) => (
          <button key={c.id} type="button" className="chip" data-active={whose === c.id} onClick={() => setWhose(c.id)}>
            {c.label}
          </button>
        ))}
        <button type="button" className="chip" data-active={whose === "me"} onClick={() => setWhose("me")}>
          Mine
        </button>
      </div>
      {children.some((c) => c.id === whose) && (
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "-0.5rem 0 1rem" }}>
          {children.find((c) => c.id === whose)!.label}&rsquo;s goal: the grown-ups and {children.find((c) => c.id === whose)!.label} see it; any grown-up can change it.
        </p>
      )}
      <Field label={`Target amount (${currencySymbol(currency)})`}>
        <input className="input" type="number" step="0.01" min="0" name="target_amount" required value={target} onChange={(e) => setTarget(e.target.value)} style={{ minHeight: "2.75rem" }} />
      </Field>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Start date" style={{ flex: 1 }}>
          <DateInput className="input" name="start_date" value={start} onChange={(e) => setStart(e.target.value)} style={{ minHeight: "2.75rem" }} />
        </Field>
        <Field label={yearly ? "Next due" : "Target end date"} style={{ flex: 1 }}>
          <DateInput className="input" name="target_date" required={yearly} value={end} onChange={(e) => setEnd(e.target.value)} min={start || undefined} style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      {plan && (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "-0.375rem 0 1rem" }}>
          Set aside {formatCurrency(plan.perMonth, currency)} a month for {plan.months} month{plan.months === 1 ? "" : "s"} to make it.
        </p>
      )}
      {accounts.length > 0 && (
        <>
          <SourceRow
            label="From account (optional)"
            name="from_account_id"
            amountName="from_amount"
            account={from1}
            onAccount={setFrom1}
            amount={amount1}
            onAmount={setAmount1}
            accounts={accounts}
            currency={currency}
            emptyLabel="Choose each time"
          />
          {secondSource ? (
            <SourceRow
              label="Second From account"
              name="from_account_2_id"
              amountName="from_2_amount"
              account={from2}
              onAccount={setFrom2}
              amount={amount2}
              onAmount={setAmount2}
              accounts={accounts.filter((a) => a.id !== from1)}
              currency={currency}
              emptyLabel="None"
            />
          ) : (
            from1 && (
              <button type="button" className="btn btn-ghost" style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.25rem", margin: "-0.25rem 0 0.75rem", color: "var(--color-switch-on)" }} onClick={() => setSecondSource(true)}>
                + Add another From account
              </button>
            )
          )}
          {plan && sourcesGive > 0 && (
            <p style={{ fontSize: "0.8125rem", margin: "-0.25rem 0 0.875rem", color: sourcesGive >= plan.perMonth ? "var(--color-neutral-700)" : "var(--color-accent-700)" }}>
              {sourcesGive >= plan.perMonth
                ? `Your sources give ${formatCurrency(sourcesGive, currency)} a month: enough.`
                : `Your sources give ${formatCurrency(sourcesGive, currency)} a month: ${formatCurrency(plan.perMonth - sourcesGive, currency)} short.`}
            </p>
          )}
          <Field label="To account (optional)">
            <select className="input" name="linked_account_id" defaultValue="" style={{ minHeight: "2.75rem" }}>
              <option value="">No account yet</option>
              <AccountOptions accounts={accounts} currency={currency} />
            </select>
          </Field>
          <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "-0.375rem 0 1rem" }}>
            From is where Put money in starts. With a To account, the money moves From → To, and the To account holds what the goal has saved.
          </p>
        </>
      )}
      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.8125rem", margin: "0 0 1rem", cursor: "pointer" }}>
        <input type="checkbox" checked={onPlanner} onChange={(e) => setOnPlanner(e.target.checked)} style={{ marginTop: "0.125rem" }} />
        <span>
          Also a goal ring on Planner
          <span style={{ display: "block", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>The same goal, entered once: the ring fills from what is set aside here. Deleting the goal removes its ring.</span>
        </span>
      </label>
      <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>Save goal</SubmitButton>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>
        A dated goal shows up on {isJoint ? "everyone\u2019s calendar" : whose === "me" ? "your calendar" : "the grown-ups\u2019 calendars and theirs"}, and money you put in comes out of a real account.
      </p>
    </form>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={{ marginBottom: "0.875rem", ...style }}>
      <label>
        {label}
        {children}
      </label>
    </div>
  );
}

/** One source of a goal's money: the account, and what it gives a month. */
function SourceRow({
  label,
  name,
  amountName,
  account,
  onAccount,
  amount,
  onAmount,
  accounts,
  currency,
  emptyLabel,
}: {
  label: string;
  name: string;
  amountName: string;
  account: string;
  onAccount: (v: string) => void;
  amount: string;
  onAmount: (v: string) => void;
  accounts: PickableAccount[];
  currency: string;
  emptyLabel: string;
}) {
  return (
    <div style={{ display: "flex", gap: "0.75rem" }}>
      <Field label={label} style={{ flex: 2 }}>
        <select className="input" name={name} value={account} onChange={(e) => onAccount(e.target.value)} style={{ minHeight: "2.75rem" }}>
          <option value="">{emptyLabel}</option>
          <AccountOptions accounts={accounts} currency={currency} />
        </select>
      </Field>
      <Field label={`A month (${currencySymbol(currency)}, optional)`} style={{ flex: 1 }}>
        <input className="input" type="number" step="0.01" min="0" name={amountName} value={amount} disabled={!account} onChange={(e) => onAmount(e.target.value)} style={{ minHeight: "2.75rem" }} />
      </Field>
    </div>
  );
}
