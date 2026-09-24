"use client";

import { useActionState, useId } from "react";
import { useSearchParams } from "next/navigation";
import { addMealPlanAction } from "@/lib/actions/household";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import { MEAL_SLOTS, MEAL_SLOT_LABEL } from "@/lib/recipes";
import { DateInput } from "@/components/date-input";

const initialState: ActionState = { error: null };

export default function NewMealPage() {
  const uid = useId();
  const [state, formAction] = useActionState(addMealPlanAction, initialState);
  // The day the calendar was on when Add was tapped, if it sent one.
  const defaultDate = useSearchParams().get("date") ?? undefined;

  return (
    <div>
      <DetailHeader backHref="/household?seg=meals" eyebrow="HUB 04 · NEW MEAL" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <h3 style={{ fontSize: "1.875rem", margin: "0 0 16px" }}>Add a meal</h3>
        <form action={formAction}>
          <ErrorText message={state.error} />
          <div className="field" style={{ marginBottom: "0.875rem" }}>
            <label htmlFor={`${uid}-date`}>Date</label>
            <DateInput id={`${uid}-date`} aria-label="Date" className="input" name="date" required defaultValue={defaultDate} style={{ minHeight: "2.75rem" }} />
          </div>
          <div className="field" style={{ marginBottom: "0.875rem" }}>
            <label htmlFor={`${uid}-slot`}>Part of the day</label>
            <select id={`${uid}-slot`} aria-label="Part Of The Day" className="input" name="slot" defaultValue="dinner" style={{ minHeight: "2.75rem" }}>
              {MEAL_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {MEAL_SLOT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: "0.875rem" }}>
            <label htmlFor={`${uid}-dish`}>Dish</label>
            <input id={`${uid}-dish`} aria-label="Dish" className="input" name="dish" placeholder="Chicken adobo · rice · pechay" required maxLength={150} style={{ minHeight: "2.75rem" }} />
          </div>
          <div className="field" style={{ marginBottom: "0.875rem" }}>
            <label htmlFor={`${uid}-note`}>Note</label>
            <input id={`${uid}-note`} aria-label="Note" className="input" name="note" placeholder="Family · 30 min" maxLength={300} style={{ minHeight: "2.75rem" }} />
          </div>
          <div className="field" style={{ marginBottom: "1.125rem" }}>
            <label htmlFor={`${uid}-ingredients`}>INGREDIENTS (comma-separated)</label>
            <textarea id={`${uid}-ingredients`} aria-label="INGREDIENTS (comma-separated)" className="input" name="ingredients" placeholder="Chicken thighs, rice, pechay, soy sauce" maxLength={2000} />
          </div>
          <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>Save meal</SubmitButton>
        </form>
      </div>
    </div>
  );
}
