"use client";

import { useActionState, useState } from "react";
import { updateAccountAction } from "@/lib/actions/wealth";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { AppLinksField } from "@/components/wealth-controls";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = { error: null };

export function AccountEditForm({ account }: { account: Tables<"accounts"> }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateAccountAction.bind(null, account.id), initialState);
  const [accountType, setAccountType] = useState<AccountType>(account.account_type as AccountType);

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
      <Field label="TYPE">
        <select
          className="input"
          name="account_type"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as AccountType)}
          style={{ minHeight: 42 }}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <div style={{ marginBottom: 12 }}>
        <AppLinksField
          accountType={accountType}
          defaultInstitution={account.institution ?? ""}
          defaultAppUrl={account.linked_app_url ?? ""}
          defaultAppStoreUrl={account.app_store_url ?? ""}
          defaultPlayStoreUrl={account.play_store_url ?? ""}
        />
      </div>
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
      <label>
        {label}
        {children}
      </label>
    </div>
  );
}
