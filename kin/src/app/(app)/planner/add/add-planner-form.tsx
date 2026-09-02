"use client";

import { useActionState, useState } from "react";
import { createActivityAction, createEventAction, createGoalAction, createTripAction } from "@/lib/actions/planner";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = { error: null };
const TYPES = ["activity", "event", "goal", "trip"] as const;
type PlannerType = (typeof TYPES)[number];

export function AddPlannerForm({ members, defaultType }: { members: Tables<"members">[]; defaultType: string }) {
  const [type, setType] = useState<PlannerType>(TYPES.includes(defaultType as PlannerType) ? (defaultType as PlannerType) : "activity");

  return (
    <div>
      <DetailHeader backHref="/planner" eyebrow="HUB 03 · NEW" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 32, margin: "0 0 14px" }}>Add to Planner</h3>
        <div className="seg" style={{ marginBottom: 18, marginTop: 0 }}>
          {TYPES.map((t) => (
            <button key={t} type="button" data-active={type === t} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
        {type === "activity" && <ActivityForm members={members} />}
        {type === "event" && <EventForm />}
        {type === "goal" && <GoalForm />}
        {type === "trip" && <TripForm members={members} />}
      </div>
    </div>
  );
}

function ActivityForm({ members }: { members: Tables<"members">[] }) {
  const [state, formAction] = useActionState(createActivityAction, initialState);
  const [wholeFamily, setWholeFamily] = useState(true);
  const [who, setWho] = useState<string[]>([]);

  return (
    <form action={formAction}>
      <input type="hidden" name="whole_family" value={wholeFamily ? "on" : ""} />
      {who.map((id) => (
        <input key={id} type="hidden" name="who" value={id} />
      ))}
      <ErrorText message={state.error} />
      <Field label="TITLE"><input className="input" name="title" placeholder="Nursery orientation" required style={{ minHeight: 44 }} /></Field>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <Field label="DATE" style={{ flex: 1.2 }}><input className="input" type="date" name="date" required style={{ minHeight: 44 }} /></Field>
        <Field label="FROM" style={{ flex: 1 }}><input className="input" type="time" name="from" defaultValue="08:30" style={{ minHeight: 44 }} /></Field>
        <Field label="TO" style={{ flex: 1 }}><input className="input" type="time" name="to" style={{ minHeight: 44 }} /></Field>
      </div>
      <Field label="REPEATS">
        <select className="input" name="repeat" style={{ minHeight: 44 }}>
          <option value="once">Once</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </Field>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", margin: "14px 0 6px" }}>Who it is for</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
        <button type="button" className="chip" data-active={wholeFamily} onClick={() => setWholeFamily(true)}>
          Whole family
        </button>
        {members.map((m) => {
          const active = !wholeFamily && who.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              className="chip"
              data-active={active}
              onClick={() => {
                setWholeFamily(false);
                setWho((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]));
              }}
            >
              {m.full_name.split(" ")[0]}
            </button>
          );
        })}
      </div>
      <Field label="LOCATION"><input className="input" name="location" placeholder="Little Acorns, San Juan" style={{ minHeight: 44 }} /></Field>
      <Field label="NOTES"><textarea className="input" name="notes" /></Field>
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE TO CALENDAR</SubmitButton>
    </form>
  );
}

function EventForm() {
  const [state, formAction] = useActionState(createEventAction, initialState);
  return (
    <form action={formAction}>
      <ErrorText message={state.error} />
      <Field label="TITLE"><input className="input" name="title" required style={{ minHeight: 44 }} /></Field>
      <Field label="DATE"><input className="input" type="date" name="date" required style={{ minHeight: 44 }} /></Field>
      <Field label="KIND">
        <select className="input" name="kind" style={{ minHeight: 44 }}>
          <option value="birthday">Birthday</option>
          <option value="anniversary">Anniversary</option>
          <option value="school">School event</option>
          <option value="health">Health</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="NOTE"><input className="input" name="sub_note" placeholder="Dinner at home" style={{ minHeight: 44 }} /></Field>
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE EVENT</SubmitButton>
    </form>
  );
}

function GoalForm() {
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
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE GOAL</SubmitButton>
    </form>
  );
}

function TripForm({ members }: { members: Tables<"members">[] }) {
  const [state, formAction] = useActionState(createTripAction, initialState);
  const [travellers, setTravellers] = useState<string[]>([]);
  return (
    <form action={formAction}>
      {travellers.map((id) => (
        <input key={id} type="hidden" name="travellers" value={id} />
      ))}
      <ErrorText message={state.error} />
      <Field label="TITLE"><input className="input" name="title" placeholder="Baguio, four days" required style={{ minHeight: 44 }} /></Field>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <Field label="START" style={{ flex: 1 }}><input className="input" type="date" name="start_date" required style={{ minHeight: 44 }} /></Field>
        <Field label="END" style={{ flex: 1 }}><input className="input" type="date" name="end_date" style={{ minHeight: 44 }} /></Field>
      </div>
      <Field label="BUDGET (₱)"><input className="input" type="number" name="budget_amount" style={{ minHeight: 44 }} /></Field>
      <div style={{ fontSize: 11.5, color: "var(--color-neutral-700)", margin: "14px 0 6px" }}>Travelling</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
        {members.map((m) => {
          const active = travellers.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              className="chip"
              data-active={active}
              onClick={() => setTravellers((p) => (active ? p.filter((x) => x !== m.id) : [...p, m.id]))}
            >
              {m.full_name.split(" ")[0]}
            </button>
          );
        })}
      </div>
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>SAVE TRIP</SubmitButton>
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
