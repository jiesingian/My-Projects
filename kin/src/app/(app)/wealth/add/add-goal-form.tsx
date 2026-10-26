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

const initialState: ActionState = { error: null };

export function AddGoalForm({ accounts, currency, kids: children = [] }: { accounts: PickableAccount[]; currency: string; kids?: { id: string; label: string }[] }) {
  const [state, formAction] = useActionState(createGoalAction, initialState);
  // "joint", "me", or a child's member id (26 October).
  const [whose, setWhose] = useState("joint");
  const isJoint = whose === "joint";
  const [yearly, setYearly] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");

  return (
    <form action={formAction}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <input type="hidden" name="owner" value={isJoint ? "" : whose} />
      <input type="hidden" name="repeats_yearly" value={yearly ? "on" : ""} />
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
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label={`Target amount (${currencySymbol(currency)})`} style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="target_amount" required style={{ minHeight: "2.75rem" }} />
        </Field>
        <Field label={yearly ? "Next due" : "Target date"} style={{ flex: 1 }}>
          <DateInput className="input" name="target_date" required={yearly} style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      {accounts.length > 0 && (
        <Field label="Saved in (optional)">
          <select className="input" name="linked_account_id" defaultValue="" style={{ minHeight: "2.75rem" }}>
            <option value="">No account yet</option>
            <AccountOptions accounts={accounts} currency={currency} />
          </select>
        </Field>
      )}
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
