"use client";

import { useActionState, useState } from "react";
import { updateAccountAction } from "@/lib/actions/wealth";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = { error: null };

export function AccountEditForm({ account }: { account: Tables<"accounts"> }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateAccountAction.bind(null, account.id), initialState);

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 40, fontSize: 13.5, marginTop: 14 }} onClick={() => setOpen(true)}>
        EDIT ACCOUNT
      </button>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: 16, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
      <ErrorText message={state.error} />
      <Field label="ACCOUNT NAME">
        <input className="input" name="name" required defaultValue={account.name} style={{ minHeight: 42 }} />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="TYPE" style={{ flex: 1 }}>
          <select className="input" name="account_type" defaultValue={account.account_type} style={{ minHeight: 42 }}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="BANK / WALLET" style={{ flex: 1 }}>
          <input className="input" name="institution" defaultValue={account.institution ?? ""} style={{ minHeight: 42 }} />
        </Field>
      </div>
      <Field label="LINKED APP LINK">
        <input className="input" name="linked_app_url" defaultValue={account.linked_app_url ?? ""} placeholder="gcash:// or https://…" style={{ minHeight: 42 }} />
      </Field>
      <Field label="NOTE">
        <input className="input" name="sub_note" defaultValue={account.sub_note ?? ""} style={{ minHeight: 42 }} />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 14 }}>
          SAVE
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 14 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={{ marginBottom: 12, ...style }}>
      <label>{label}</label>
      {children}
    </div>
  );
}
