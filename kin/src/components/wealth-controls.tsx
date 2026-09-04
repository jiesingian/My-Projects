"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAccountAction,
  setJointBudgetAction,
  setWealthTargetAction,
  setAllocationAction,
  addBillAction,
} from "@/lib/actions/wealth";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, EXPENSE_CATEGORIES } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";

const initialState: ActionState = { error: null };

export function AddAccountForm({ isJoint }: { isJoint: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addAccountAction, initialState);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 18 }}
        onClick={() => setOpen(true)}
      >
        + ADD ACCOUNT
      </button>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <ErrorText message={state.error} />
      <Labelled label="ACCOUNT NAME">
        <input className="input" name="name" required placeholder="Everyday savings" style={{ minHeight: 42 }} />
      </Labelled>
      <div style={{ display: "flex", gap: 10 }}>
        <Labelled label="TYPE" style={{ flex: 1 }}>
          <select className="input" name="account_type" defaultValue="bank" style={{ minHeight: 42 }}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="BANK / WALLET" style={{ flex: 1 }}>
          <input className="input" name="institution" placeholder="BPI" style={{ minHeight: 42 }} />
        </Labelled>
      </div>
      <Labelled label="OPENING BALANCE (₱)">
        <input className="input" type="number" step="0.01" name="opening_balance" defaultValue={0} style={{ minHeight: 42 }} />
      </Labelled>
      <Labelled label="LINKED APP LINK">
        <input className="input" name="linked_app_url" placeholder="gcash:// or https://…" style={{ minHeight: 42 }} />
      </Labelled>
      <p style={{ fontSize: 13, color: "var(--color-neutral-600)", margin: "-4px 0 12px" }}>
        Kin opens this when you start a payment or transfer here, so you can finish it in your own banking app.
      </p>
      <Labelled label="NOTE">
        <input className="input" name="sub_note" placeholder="Salary account" style={{ minHeight: 42 }} />
      </Labelled>
      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 14 }}>
          SAVE ACCOUNT
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 14 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

export function AddBillForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addBillAction, initialState);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 18 }}
        onClick={() => setOpen(true)}
      >
        + ADD BILL
      </button>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
      <ErrorText message={state.error} />
      <Labelled label="BILL NAME">
        <input className="input" name="name" required placeholder="Meralco" style={{ minHeight: 42 }} />
      </Labelled>
      <div style={{ display: "flex", gap: 10 }}>
        <Labelled label="AMOUNT (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" name="amount" required style={{ minHeight: 42 }} />
        </Labelled>
        <Labelled label="DUE" style={{ flex: 1 }}>
          <input className="input" type="date" name="due_date" style={{ minHeight: 42 }} />
        </Labelled>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Labelled label="CATEGORY" style={{ flex: 1 }}>
          <select className="input" name="category" defaultValue="Utilities" style={{ minHeight: 42 }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="REPEATS" style={{ flex: 1 }}>
          <select className="input" name="recurrence" defaultValue="monthly" style={{ minHeight: 42 }}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="once">One-off</option>
          </select>
        </Labelled>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 14 }}>
          SAVE BILL
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 14 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

export function SetBudgetControl({ familyId, month, year, current }: { familyId: string; month: number; year: number; current: number }) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input className="input" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ minHeight: 40 }} />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ minHeight: 40, fontSize: 13.5, whiteSpace: "nowrap" }}
        onClick={() => startTransition(() => setJointBudgetAction(familyId, month, year, value))}
      >
        {pending ? "…" : "SET BUDGET"}
      </button>
    </div>
  );
}

export function SetTargetControl({ memberId, familyId, month, year, current }: { memberId: string; familyId: string; month: number; year: number; current: number }) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input className="input" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ minHeight: 40 }} />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ minHeight: 40, fontSize: 13.5, whiteSpace: "nowrap" }}
        onClick={() => startTransition(() => setWealthTargetAction(memberId, familyId, month, year, value))}
      >
        {pending ? "…" : "SET TARGET"}
      </button>
    </div>
  );
}

/** Sets what the household intends to spend per category this month — the
 * bars above it fill with what was actually spent. */
export function AllocationEditor({ budgeted }: { budgeted: string[] }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES.find((c) => !budgeted.includes(c)) ?? EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 40, fontSize: 13.5, marginBottom: 18 }} onClick={() => setOpen(true)}>
        SET A CATEGORY BUDGET
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: 40, flex: 1 }}>
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ minHeight: 40, width: 96 }} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        style={{ minHeight: 40, fontSize: 13.5 }}
        onClick={() =>
          startTransition(async () => {
            await setAllocationAction({ category, amount });
            setOpen(false);
            router.refresh();
          })
        }
      >
        {pending ? "…" : "SET"}
      </button>
    </div>
  );
}

function Labelled({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={{ marginBottom: 12, ...style }}>
      <label>{label}</label>
      {children}
    </div>
  );
}
