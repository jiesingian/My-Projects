"use client";

import { useActionState, useState } from "react";
import { addBillAction } from "@/lib/actions/household";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";

const initialState: ActionState = { error: null };

export function AddBillForm() {
  const [open, setOpen] = useState(false);
  const [state] = useActionState(addBillAction, initialState);

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 8 }} onClick={() => setOpen(true)}>
        + ADD BILL
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        const res = await addBillAction(state, fd);
        if (!res.error) setOpen(false);
      }}
      style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 16, marginTop: 8 }}
    >
      <ErrorText message={state.error} />
      <div className="field" style={{ marginBottom: 12 }}>
        <label>NAME</label>
        <input className="input" name="name" placeholder="Meralco" required style={{ minHeight: 42 }} />
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>AMOUNT (₱)</label>
          <input className="input" type="number" name="amount" required style={{ minHeight: 42 }} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>DUE DATE</label>
          <input className="input" type="date" name="due_date" style={{ minHeight: 42 }} />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>STATUS</label>
        <select className="input" name="status" style={{ minHeight: 42 }}>
          <option value="unpaid">Unpaid</option>
          <option value="autopay">Autopay</option>
          <option value="scheduled">Scheduled</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 12.5 }}>
          SAVE BILL
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 12.5 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
