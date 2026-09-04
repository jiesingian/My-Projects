"use client";

import { useActionState, useState } from "react";
import { addManagedChildAction } from "@/lib/actions/family";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";

const initialState: ActionState = { error: null };

export function AddChildForm() {
  const [open, setOpen] = useState(false);
  const [state] = useActionState(addManagedChildAction, initialState);

  if (!open) {
    return (
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 14 }} onClick={() => setOpen(true)}>
          ADD CHILD
        </button>
      </div>
    );
  }

  return (
    <form
      action={async (fd) => {
        const res = await addManagedChildAction(state, fd);
        if (!res.error) setOpen(false);
      }}
      style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}
    >
      <ErrorText message={state.error} />
      <div className="field" style={{ marginBottom: 12 }}>
        <label>CHILD&apos;S NAME</label>
        <input className="input" name="full_name" required style={{ minHeight: 44 }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>DATE OF BIRTH</label>
          <input className="input" type="date" name="dob" required style={{ minHeight: 44 }} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>RELATIONSHIP</label>
          <input className="input" name="relationship" defaultValue="child" style={{ minHeight: 44 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 14 }}>
          SAVE CHILD
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 14 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </form>
  );
}
