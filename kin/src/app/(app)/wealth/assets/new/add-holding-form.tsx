"use client";

import { useActionState, useState } from "react";
import { addAssetAction, addLiabilityAction } from "@/lib/actions/wealth";
import { ASSET_KINDS, ASSET_KIND_LABELS, LIABILITY_KINDS, LIABILITY_KIND_LABELS } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DateInput } from "@/components/date-input";

const initialState: ActionState = { error: null };

export function AddHoldingForm({ defaultKind }: { defaultKind: string }) {
  const [mode, setMode] = useState<"asset" | "liability">(defaultKind === "liability" ? "liability" : "asset");

  return (
    <div>
      <div className="seg" style={{ marginBottom: "1.125rem", marginTop: 0 }}>
        <button type="button" data-active={mode === "asset"} onClick={() => setMode("asset")}>
          Asset
        </button>
        <button type="button" data-active={mode === "liability"} onClick={() => setMode("liability")}>
          Liability
        </button>
      </div>
      {mode === "asset" ? <AssetForm /> : <LiabilityForm />}
    </div>
  );
}

function AssetForm() {
  const [state, formAction] = useActionState(addAssetAction, initialState);
  const [isJoint, setIsJoint] = useState(true);

  return (
    <form action={formAction}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <ErrorText message={state.error} />
      <Field label="What is it">
        <input className="input" name="name" required placeholder="House in San Juan" style={{ minHeight: "2.75rem" }} />
      </Field>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Kind" style={{ flex: 1 }}>
          <select className="input" name="kind" defaultValue="property" style={{ minHeight: "2.75rem" }}>
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>
                {ASSET_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Value (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="value" required style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      <Field label="Owned since">
        <DateInput className="input" name="acquired_on" style={{ minHeight: "2.75rem" }} />
      </Field>
      <JointToggle isJoint={isJoint} setIsJoint={setIsJoint} />
      <Field label="Note">
        <input className="input" name="note" placeholder="Title under both names" style={{ minHeight: "2.75rem" }} />
      </Field>
      <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>Save asset</SubmitButton>
    </form>
  );
}

function LiabilityForm() {
  const [state, formAction] = useActionState(addLiabilityAction, initialState);
  const [isJoint, setIsJoint] = useState(true);

  return (
    <form action={formAction}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <ErrorText message={state.error} />
      <Field label="What is owed">
        <input className="input" name="name" required placeholder="Home loan" style={{ minHeight: "2.75rem" }} />
      </Field>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Kind" style={{ flex: 1 }}>
          <select className="input" name="kind" defaultValue="mortgage" style={{ minHeight: "2.75rem" }}>
            {LIABILITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {LIABILITY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Balance (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="balance" required style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Lender" style={{ flex: 1 }}>
          <input className="input" name="lender" placeholder="BPI" style={{ minHeight: "2.75rem" }} />
        </Field>
        <Field label="Per month (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="monthly_payment" style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      <JointToggle isJoint={isJoint} setIsJoint={setIsJoint} />
      <Field label="Note">
        <input className="input" name="note" style={{ minHeight: "2.75rem" }} />
      </Field>
      <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>Save liability</SubmitButton>
    </form>
  );
}

function JointToggle({ isJoint, setIsJoint }: { isJoint: boolean; setIsJoint: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: "0.4375rem", marginBottom: "1rem" }}>
      <button type="button" className="chip" data-active={isJoint} onClick={() => setIsJoint(true)}>
        Household
      </button>
      <button type="button" className="chip" data-active={!isJoint} onClick={() => setIsJoint(false)}>
        Mine
      </button>
    </div>
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
