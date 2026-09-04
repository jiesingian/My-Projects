"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { addMealPlanAction } from "@/lib/actions/household";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";

const initialState: ActionState = { error: null };

export default function NewMealPage() {
  const [state, formAction] = useActionState(addMealPlanAction, initialState);
  // The day the calendar was on when Add was tapped, if it sent one.
  const defaultDate = useSearchParams().get("date") ?? undefined;

  return (
    <div>
      <DetailHeader backHref="/household?seg=meals" eyebrow="HUB 04 · NEW MEAL" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 16px" }}>Add a meal</h3>
        <form action={formAction}>
          <ErrorText message={state.error} />
          <div className="field" style={{ marginBottom: 14 }}>
            <label>DATE</label>
            <input className="input" type="date" name="date" required defaultValue={defaultDate} style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>DISH</label>
            <input className="input" name="dish" placeholder="Chicken adobo · rice · pechay" required style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>NOTE</label>
            <input className="input" name="note" placeholder="Family · 30 min" style={{ minHeight: 44 }} />
          </div>
          <div className="field" style={{ marginBottom: 18 }}>
            <label>INGREDIENTS (comma-separated)</label>
            <textarea className="input" name="ingredients" placeholder="Chicken thighs, rice, pechay, soy sauce" />
          </div>
          <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE MEAL</SubmitButton>
        </form>
      </div>
    </div>
  );
}
