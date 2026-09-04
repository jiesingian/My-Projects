"use client";

import { useActionState, useState } from "react";
import { createGoalAction } from "@/lib/actions/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";

const initialState: ActionState = { error: null };

export function AddGoalForm() {
  const [state, formAction] = useActionState(createGoalAction, initialState);
  const [isJoint, setIsJoint] = useState(true);
  return (
    <form action={formAction}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <ErrorText message={state.error} />
      <Field label="TITLE"><input className="input" name="title" placeholder="Emergency fund · six months" required style={{ minHeight: 44 }} /></Field>
      <Field label="NOTE"><input className="input" name="sub_note" style={{ minHeight: 44 }} /></Field>
      <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
        <button type="button" className="chip" data-active={isJoint} onClick={() => setIsJoint(true)}>Joint</button>
        <button type="button" className="chip" data-active={!isJoint} onClick={() => setIsJoint(false)}>Mine</button>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <Field label="TARGET AMOUNT (₱)" style={{ flex: 1 }}><input className="input" type="number" name="target_amount" style={{ minHeight: 44 }} /></Field>
        <Field label="OR UNIT (e.g. km)" style={{ flex: 1 }}><input className="input" name="target_unit" style={{ minHeight: 44 }} /></Field>
      </div>
      <Field label="TARGET DATE (OPTIONAL)"><input className="input" type="date" name="target_date" style={{ minHeight: 44 }} /></Field>
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE GOAL</SubmitButton>
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
