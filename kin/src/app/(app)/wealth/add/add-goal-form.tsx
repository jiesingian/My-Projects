"use client";

import { useActionState, useState } from "react";
import { createGoalAction } from "@/lib/actions/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { formatCurrency } from "@/lib/format";
import type { PickableAccount } from "@/components/money-actions";

const initialState: ActionState = { error: null };

export function AddGoalForm({ accounts, currency }: { accounts: PickableAccount[]; currency: string }) {
  const [state, formAction] = useActionState(createGoalAction, initialState);
  const [isJoint, setIsJoint] = useState(true);

  return (
    <form action={formAction}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <ErrorText message={state.error} />
      <Field label="TITLE">
        <input className="input" name="title" placeholder="Emergency fund · six months" required style={{ minHeight: 44 }} />
      </Field>
      <Field label="NOTE">
        <input className="input" name="sub_note" placeholder="Six months of household costs" style={{ minHeight: 44 }} />
      </Field>
      <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
        <button type="button" className="chip" data-active={isJoint} onClick={() => setIsJoint(true)}>
          Joint
        </button>
        <button type="button" className="chip" data-active={!isJoint} onClick={() => setIsJoint(false)}>
          Mine
        </button>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="TARGET AMOUNT (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" name="target_amount" required style={{ minHeight: 44 }} />
        </Field>
        <Field label="TARGET DATE" style={{ flex: 1 }}>
          <input className="input" type="date" name="target_date" style={{ minHeight: 44 }} />
        </Field>
      </div>
      {accounts.length > 0 && (
        <Field label="SAVED IN (OPTIONAL)">
          <select className="input" name="linked_account_id" defaultValue="" style={{ minHeight: 44 }}>
            <option value="">No account yet</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatCurrency(a.balance, currency)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE GOAL</SubmitButton>
      <p style={{ fontSize: 11.5, color: "var(--color-neutral-600)", marginTop: 10 }}>
        A dated goal shows up on everyone&apos;s calendar, and money you put in comes out of a real account.
      </p>
    </form>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={{ marginBottom: 14, ...style }}>
      <label>{label}</label>
      {children}
    </div>
  );
}
