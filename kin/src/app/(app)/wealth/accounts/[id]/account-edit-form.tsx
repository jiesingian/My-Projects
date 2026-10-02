"use client";

import { useActionState, useState } from "react";
import { updateAccountAction } from "@/lib/actions/wealth";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { AppLinksField } from "@/components/wealth-controls";
import { AccountNumberField } from "@/components/account-number";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = { error: null };

/** `canNumber` is whether this person may set the number (the account's
 * owner, or a grown-up on a joint account); without it the field is left
 * off and the number is untouched. */
export function AccountEditForm({ account, number, canNumber }: { account: Tables<"accounts">; number: string | null; canNumber: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateAccountAction.bind(null, account.id), initialState);
  const [accountType, setAccountType] = useState<AccountType>(account.account_type as AccountType);

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginTop: "0.875rem" }} onClick={() => setOpen(true)}>
        Edit account
      </button>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: "1rem", borderTop: "1px solid var(--color-divider)", paddingTop: "1rem" }}>
      <ErrorText message={state.error} />
      <Field label="Account name">
        <input className="input" name="name" required defaultValue={account.name} style={{ minHeight: "2.625rem" }} />
      </Field>
      <Field label="Type">
        <select
          className="input"
          name="account_type"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as AccountType)}
          style={{ minHeight: "2.625rem" }}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>
      <div style={{ marginBottom: "0.75rem" }}>
        <AppLinksField
          accountType={accountType}
          defaultInstitution={account.institution ?? ""}
          defaultAppUrl={account.linked_app_url ?? ""}
          defaultAppStoreUrl={account.app_store_url ?? ""}
          defaultPlayStoreUrl={account.play_store_url ?? ""}
        />
      </div>
      {canNumber && <AccountNumberField defaultValue={number ?? ""} />}
      <Field label="Note">
        <input className="input" name="sub_note" defaultValue={account.sub_note ?? ""} style={{ minHeight: "2.625rem" }} />
      </Field>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}>
          Save
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="field" style={{ marginBottom: "0.75rem", ...style }}>
      <label>
        {label}
        {children}
      </label>
    </div>
  );
}
