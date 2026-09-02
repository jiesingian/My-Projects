"use client";

import { useActionState, useState, useTransition } from "react";
import { addAccountAction, setJointBudgetAction, setWealthTargetAction } from "@/lib/actions/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";

const initialState: ActionState = { error: null };

export function AddAccountForm({ isJoint }: { isJoint: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addAccountAction, initialState);

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 18 }} onClick={() => setOpen(true)}>
        + ADD ACCOUNT
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        const res = await addAccountAction(state, fd);
        if (!res.error) setOpen(false);
      }}
      style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}
    >
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <ErrorText message={state.error} />
      <div className="field" style={{ marginBottom: 12 }}>
        <label>ACCOUNT NAME</label>
        <input className="input" name="name" required style={{ minHeight: 42 }} />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>NOTE</label>
        <input className="input" name="sub_note" style={{ minHeight: 42 }} />
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label>BALANCE (₱)</label>
        <input className="input" type="number" name="balance" defaultValue={0} style={{ minHeight: 42 }} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 12.5 }}>
          SAVE ACCOUNT
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 12.5 }} onClick={() => setOpen(false)}>
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
        style={{ minHeight: 40, fontSize: 12 }}
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
        style={{ minHeight: 40, fontSize: 12 }}
        onClick={() => startTransition(() => setWealthTargetAction(memberId, familyId, month, year, value))}
      >
        {pending ? "…" : "SET TARGET"}
      </button>
    </div>
  );
}
