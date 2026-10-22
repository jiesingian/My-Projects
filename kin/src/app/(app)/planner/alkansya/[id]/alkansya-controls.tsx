"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blueprint } from "@/components/ui";
import { SubmitButton, ErrorText } from "@/components/form";
import { AmountInput } from "@/components/amount-input";
import { confirm } from "@/components/confirm-sheet";
import {
  addInterestAction,
  addToJarAction,
  convertPointsAction,
  removeAlkansyaEntryAction,
  saveAlkansyaPlanAction,
  takeFromJarAction,
} from "@/lib/actions/alkansya";
import { JARS, JAR_LABEL, WEEKDAYS, pointsToPesos, type Split } from "@/lib/alkansya";
import { formatCurrency } from "@/lib/format";
import type { AlkansyaPlan } from "@/lib/queries/alkansya";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = { error: null };
const label = { display: "block", fontSize: "0.71875rem", color: "var(--color-neutral-600)", marginBottom: "0.1875rem" } as const;
const field = { minHeight: "2.5rem", fontSize: "0.8125rem" } as const;
const small = { minHeight: "2.25rem", fontSize: "0.8125rem", padding: "0 0.75rem" } as const;

type Panel = "plan" | "points" | "add" | "take" | null;

/** What a grown-up does with a child's alkansya. One panel open at a time,
 * behind a row of buttons, because most visits only read the jars. */
export function AlkansyaControls({
  memberId,
  plan,
  isNew,
  balances,
  spendablePoints,
  interestNow,
  currency,
}: {
  memberId: string;
  plan: AlkansyaPlan;
  isNew: boolean;
  balances: Split;
  spendablePoints: number;
  interestNow: number;
  currency: string;
}) {
  const [open, setOpen] = useState<Panel>(isNew ? "plan" : null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const toggle = (p: Panel) => setOpen((o) => (o === p ? null : p));
  const done = () => {
    setOpen(null);
    router.refresh();
  };

  const button = (p: Exclude<Panel, null>, text: string) => (
    <button type="button" className={open === p ? "btn btn-primary" : "btn btn-secondary"} aria-expanded={open === p} onClick={() => toggle(p)} style={small}>
      {text}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.625rem" }}>
        {button("plan", isNew ? "Set up" : "Baon and split")}
        {!isNew && plan.pesoPerPoint > 0 && button("points", "Change points")}
        {!isNew && button("add", "Add money")}
        {!isNew && button("take", "Spend or give")}
        {!isNew && plan.interestPct > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending || !(interestNow > 0)}
            style={small}
            onClick={async () => {
              if (!(await confirm({ title: `Add ${formatCurrency(interestNow, currency)} interest to ipon?`, description: `${plan.interestPct}% of what ipon holds now.`, confirmLabel: "Add it" }))) return;
              setError(null);
              startTransition(async () => {
                const r = await addInterestAction(memberId);
                if (r.error) setError(r.error);
                router.refresh();
              });
            }}
          >
            Add interest
          </button>
        )}
      </div>
      <ErrorText message={error} />

      {open === "plan" && <PlanForm memberId={memberId} plan={plan} onDone={done} />}
      {open === "points" && <PointsForm memberId={memberId} rate={plan.pesoPerPoint} spendable={spendablePoints} currency={currency} onDone={done} />}
      {open === "add" && <MoneyForm memberId={memberId} mode="add" balances={balances} currency={currency} onDone={done} />}
      {open === "take" && <MoneyForm memberId={memberId} mode="take" balances={balances} currency={currency} onDone={done} />}
    </div>
  );
}

function useSave(action: (prev: ActionState, fd: FormData) => Promise<ActionState>, onDone: () => void) {
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (!r.error) onDone();
    return r;
  }, initialState);
  return { state, formAction };
}

function PlanForm({ memberId, plan, onDone }: { memberId: string; plan: AlkansyaPlan; onDone: () => void }) {
  const { state, formAction } = useSave(saveAlkansyaPlanAction, onDone);
  const uid = useId();

  return (
    <Blueprint style={{ padding: "0.875rem", marginBottom: "0.75rem" }}>
      <form action={formAction}>
        <input type="hidden" name="member_id" value={memberId} />
        <ErrorText message={state.error} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" }}>
          <span>
            <label htmlFor={`${uid}-weekly`} style={label}>Weekly baon</label>
            <AmountInput id={`${uid}-weekly`} name="weekly_amount" defaultValue={plan.weeklyAmount} style={field} />
          </span>
          <span>
            <label htmlFor={`${uid}-day`} style={label}>Given every</label>
            <select id={`${uid}-day`} name="pay_weekday" className="input" defaultValue={plan.payWeekday} style={field}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </span>
        </div>

        <div style={{ fontSize: "0.78125rem", fontWeight: 500, margin: "0.75rem 0 0.3125rem" }}>Split, in percent (adds up to 100)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.5rem" }}>
          {JARS.map((j) => (
            <span key={j}>
              <label htmlFor={`${uid}-${j}`} style={label}>{JAR_LABEL[j].name}</label>
              <input id={`${uid}-${j}`} className="input" name={`${j}_pct`} type="number" min="0" max="100" step="1" required defaultValue={plan.split[j]} style={field} />
            </span>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem", marginTop: "0.75rem" }}>
          <span>
            <label htmlFor={`${uid}-rate`} style={label}>One chore point is worth</label>
            <AmountInput id={`${uid}-rate`} name="peso_per_point" defaultValue={plan.pesoPerPoint} style={field} />
          </span>
          <span>
            <label htmlFor={`${uid}-interest`} style={label}>Interest on ipon, %</label>
            <input id={`${uid}-interest`} className="input" name="interest_pct" type="number" min="0" max="100" step="0.01" defaultValue={plan.interestPct} style={field} />
          </span>
        </div>
        <p style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)", margin: "0.375rem 0 0.625rem", lineHeight: 1.4 }}>
          Leave a point at 0 to keep points for rewards only. Interest is added when you press Add interest — monthly is usual.
        </p>
        <label htmlFor={`${uid}-active`} style={label}>Weekly baon</label>
        <select id={`${uid}-active`} name="active" className="input" defaultValue={plan.active ? "on" : "off"} style={{ ...field, marginBottom: "0.625rem" }}>
          <option value="on">Given every week</option>
          <option value="off">Paused — no baon until switched back on</option>
        </select>
        <SubmitButton style={small}>Save</SubmitButton>
      </form>
    </Blueprint>
  );
}

function PointsForm({ memberId, rate, spendable, currency, onDone }: { memberId: string; rate: number; spendable: number; currency: string; onDone: () => void }) {
  const { state, formAction } = useSave(convertPointsAction, onDone);
  const [points, setPoints] = useState(spendable);
  const uid = useId();

  return (
    <Blueprint style={{ padding: "0.875rem", marginBottom: "0.75rem" }}>
      <form action={formAction}>
        <input type="hidden" name="member_id" value={memberId} />
        <ErrorText message={state.error} />
        <label htmlFor={`${uid}-points`} style={label}>Points to change ({spendable} to spend)</label>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input id={`${uid}-points`} className="input" name="points" type="number" min="1" max={Math.max(1, spendable)} step="1" required value={points || ""} onChange={(e) => setPoints(Number(e.target.value))} style={{ ...field, width: 110 }} />
          <span style={{ fontSize: "0.84375rem" }}>= {formatCurrency(pointsToPesos(points || 0, rate), currency)}</span>
        </div>
        <p style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)", margin: "0.375rem 0 0.625rem" }}>
          Split across the jars the way the baon is. The points are spent, the same as asking for a reward.
        </p>
        {spendable < 1 ? (
          <p style={{ fontSize: "0.8125rem", margin: 0 }}>No points to change yet.</p>
        ) : (
          <SubmitButton style={small}>Change into pesos</SubmitButton>
        )}
      </form>
    </Blueprint>
  );
}

function MoneyForm({ memberId, mode, balances, currency, onDone }: { memberId: string; mode: "add" | "take"; balances: Split; currency: string; onDone: () => void }) {
  const { state, formAction } = useSave(mode === "add" ? addToJarAction : takeFromJarAction, onDone);
  const uid = useId();

  return (
    <Blueprint style={{ padding: "0.875rem", marginBottom: "0.75rem" }}>
      <form action={formAction}>
        <input type="hidden" name="member_id" value={memberId} />
        <ErrorText message={state.error} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" }}>
          <span>
            <label htmlFor={`${uid}-jar`} style={label}>{mode === "add" ? "Into" : "Out of"}</label>
            <select id={`${uid}-jar`} name="jar" className="input" defaultValue={mode === "add" ? "ipon" : "gastos"} style={field}>
              {JARS.map((j) => (
                <option key={j} value={j}>
                  {JAR_LABEL[j].name}
                  {mode === "take" ? ` (${formatCurrency(balances[j], currency)})` : ""}
                </option>
              ))}
            </select>
          </span>
          <span>
            <label htmlFor={`${uid}-amount`} style={label}>How much</label>
            <AmountInput id={`${uid}-amount`} name="amount" required style={field} />
          </span>
        </div>
        <label htmlFor={`${uid}-note`} style={{ ...label, marginTop: "0.5rem" }}>{mode === "add" ? "From (optional)" : "What for (optional)"}</label>
        <input id={`${uid}-note`} className="input" name="note" maxLength={200} placeholder={mode === "add" ? "Pamasko from Ninang" : "Snacks at school · Church"} style={field} />
        {mode === "take" && (
          <p style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)", margin: "0.375rem 0 0" }}>Out of bigay is giving; out of gastos or ipon is spending.</p>
        )}
        <div style={{ marginTop: "0.625rem" }}>
          <SubmitButton style={small}>{mode === "add" ? "Add" : "Take out"}</SubmitButton>
        </div>
      </form>
    </Blueprint>
  );
}

export function RemoveEntryButton({ entryId, memberId }: { entryId: string; memberId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pending}
        aria-label="Take this line off"
        style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.375rem", color: "var(--color-neutral-700)" }}
        onClick={async () => {
          if (!(await confirm({ title: "Take this line off?", description: "For a mistake. The jar goes back to what it was without it.", confirmLabel: "Take it off" }))) return;
          setError(null);
          startTransition(async () => {
            const r = await removeAlkansyaEntryAction(entryId, memberId);
            if (r.error) setError(r.error);
            router.refresh();
          });
        }}
      >
        ✕
      </button>
      {error && (
        <span role="alert" style={{ fontSize: "0.71875rem", color: "var(--cal-occasion-ink)", maxWidth: 140 }}>
          {error}
        </span>
      )}
    </>
  );
}
