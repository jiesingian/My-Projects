"use client";

import { useActionState, useState } from "react";
import { addAssetAction, addLiabilityAction } from "@/lib/actions/wealth";
import { ASSET_KINDS, ASSET_KIND_LABELS, LIABILITY_KINDS, LIABILITY_KIND_LABELS } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";

const initialState: ActionState = { error: null };

export function AddHoldingForm({ defaultKind }: { defaultKind: string }) {
  const [mode, setMode] = useState<"asset" | "liability">(defaultKind === "liability" ? "liability" : "asset");

  return (
    <div>
      <div className="seg" style={{ marginBottom: 18, marginTop: 0 }}>
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
      <Field label="WHAT IS IT">
        <input className="input" name="name" required placeholder="House in San Juan" style={{ minHeight: 44 }} />
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="KIND" style={{ flex: 1 }}>
          <select className="input" name="kind" defaultValue="property" style={{ minHeight: 44 }}>
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>
                {ASSET_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="VALUE (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" name="value" required style={{ minHeight: 44 }} />
        </Field>
      </div>
      <Field label="OWNED SINCE">
        <input className="input" type="date" name="acquired_on" style={{ minHeight: 44 }} />
      </Field>
      <JointToggle isJoint={isJoint} setIsJoint={setIsJoint} />
      <Field label="NOTE">
        <input className="input" name="note" placeholder="Title under both names" style={{ minHeight: 44 }} />
      </Field>
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE ASSET</SubmitButton>
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
      <Field label="WHAT IS OWED">
        <input className="input" name="name" required placeholder="Home loan" style={{ minHeight: 44 }} />
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="KIND" style={{ flex: 1 }}>
          <select className="input" name="kind" defaultValue="mortgage" style={{ minHeight: 44 }}>
            {LIABILITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {LIABILITY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="BALANCE (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" name="balance" required style={{ minHeight: 44 }} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="LENDER" style={{ flex: 1 }}>
          <input className="input" name="lender" placeholder="BPI" style={{ minHeight: 44 }} />
        </Field>
        <Field label="PER MONTH (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" name="monthly_payment" style={{ minHeight: 44 }} />
        </Field>
      </div>
      <JointToggle isJoint={isJoint} setIsJoint={setIsJoint} />
      <Field label="NOTE">
        <input className="input" name="note" style={{ minHeight: 44 }} />
      </Field>
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE LIABILITY</SubmitButton>
    </form>
  );
}

function JointToggle({ isJoint, setIsJoint }: { isJoint: boolean; setIsJoint: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
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
    <div className="field" style={{ marginBottom: 14, ...style }}>
      <label>{label}</label>
      {children}
    </div>
  );
}
