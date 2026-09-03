"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createActivityAction,
  updateActivityAction,
  deleteActivityAction,
  createEventAction,
  updateEventAction,
  deleteEventAction,
  createGoalAction,
  createTripAction,
} from "@/lib/actions/planner";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";

const initialState: ActionState = { error: null };
const TYPES = ["activity", "event", "goal", "trip"] as const;
type PlannerType = (typeof TYPES)[number];

type EditActivity = Tables<"activities"> & { who: string[] };
type EditEvent = Tables<"events">;

export function AddPlannerForm({
  members,
  defaultType,
  editActivity,
  editEvent,
}: {
  members: Tables<"members">[];
  defaultType: string;
  editActivity?: EditActivity | null;
  editEvent?: EditEvent | null;
}) {
  const isEditing = !!editActivity || !!editEvent;
  const [type, setType] = useState<PlannerType>(TYPES.includes(defaultType as PlannerType) ? (defaultType as PlannerType) : "activity");

  return (
    <div>
      <DetailHeader backHref="/planner" eyebrow="HUB 03 · NEW" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 32, margin: "0 0 14px" }}>{isEditing ? "Edit" : "Add to"} Planner</h3>
        {!isEditing && (
          <div className="seg" style={{ marginBottom: 18, marginTop: 0 }}>
            {TYPES.map((t) => (
              <button key={t} type="button" data-active={type === t} onClick={() => setType(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        {type === "activity" && <ActivityForm members={members} editActivity={editActivity ?? undefined} />}
        {type === "event" && <EventForm editEvent={editEvent ?? undefined} />}
        {!isEditing && type === "goal" && <GoalForm />}
        {!isEditing && type === "trip" && <TripForm members={members} />}
      </div>
    </div>
  );
}

function ActivityForm({ members, editActivity }: { members: Tables<"members">[]; editActivity?: EditActivity }) {
  const action = editActivity ? updateActivityAction.bind(null, editActivity.id) : createActivityAction;
  const [state, formAction] = useActionState(action, initialState);
  const [wholeFamily, setWholeFamily] = useState(editActivity?.applies_to_whole_family ?? true);
  const [who, setWho] = useState<string[]>(editActivity?.who ?? []);
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const startDate = editActivity ? editActivity.start_at.slice(0, 10) : undefined;
  const startTime = editActivity ? editActivity.start_at.slice(11, 16) : undefined;
  const endTime = editActivity?.end_at ? editActivity.end_at.slice(11, 16) : undefined;

  return (
    <form action={formAction}>
      <input type="hidden" name="whole_family" value={wholeFamily ? "on" : ""} />
      {who.map((id) => (
        <input key={id} type="hidden" name="who" value={id} />
      ))}
      <ErrorText message={state.error} />
      <Field label="TITLE"><input className="input" name="title" placeholder="Nursery orientation" required defaultValue={editActivity?.title} style={{ minHeight: 44 }} /></Field>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <Field label="DATE" style={{ flex: 1.2 }}><input className="input" type="date" name="date" required defaultValue={startDate} style={{ minHeight: 44 }} /></Field>
        <Field label="FROM" style={{ flex: 1 }}><input className="input" type="time" name="from" defaultValue={startTime ?? "08:30"} style={{ minHeight: 44 }} /></Field>
        <Field label="TO" style={{ flex: 1 }}><input className="input" type="time" name="to" defaultValue={endTime} style={{ minHeight: 44 }} /></Field>
      </div>
      <Field label="REPEATS">
        <select className="input" name="repeat" defaultValue={editActivity?.repeat ?? "once"} style={{ minHeight: 44 }}>
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
      <Field label="LOCATION"><input className="input" name="location" placeholder="Little Acorns, San Juan" defaultValue={editActivity?.location ?? undefined} style={{ minHeight: 44 }} /></Field>
      <Field label="NOTES"><textarea className="input" name="notes" defaultValue={editActivity?.notes ?? undefined} /></Field>
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>{editActivity ? "SAVE CHANGES" : "SAVE TO CALENDAR"}</SubmitButton>
      {editActivity && (
        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={deleting}
          style={{ minHeight: 44, fontSize: 13, marginTop: 10, color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
          onClick={async () => {
            if (!window.confirm("Delete this activity? This can't be undone.")) return;
            setDeleting(true);
            await deleteActivityAction(editActivity.id);
            router.push("/planner?seg=calendar");
          }}
        >
          {deleting ? "DELETING…" : "DELETE ACTIVITY"}
        </button>
      )}
    </form>
  );
}

function EventForm({ editEvent }: { editEvent?: EditEvent }) {
  const action = editEvent ? updateEventAction.bind(null, editEvent.id) : createEventAction;
  const [state, formAction] = useActionState(action, initialState);
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  return (
    <form action={formAction}>
      <ErrorText message={state.error} />
      <Field label="TITLE"><input className="input" name="title" required defaultValue={editEvent?.title} style={{ minHeight: 44 }} /></Field>
      <Field label="DATE"><input className="input" type="date" name="date" required defaultValue={editEvent?.event_date} style={{ minHeight: 44 }} /></Field>
      <Field label="KIND">
        <select className="input" name="kind" defaultValue={editEvent?.kind ?? "birthday"} style={{ minHeight: 44 }}>
          <option value="birthday">Birthday</option>
          <option value="anniversary">Anniversary</option>
          <option value="school">School event</option>
          <option value="health">Health</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="NOTE"><input className="input" name="sub_note" placeholder="Dinner at home" defaultValue={editEvent?.sub_note ?? undefined} style={{ minHeight: 44 }} /></Field>
      <SubmitButton style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em" }}>{editEvent ? "SAVE CHANGES" : "SAVE EVENT"}</SubmitButton>
      {editEvent && (
        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={deleting}
          style={{ minHeight: 44, fontSize: 13, marginTop: 10, color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
          onClick={async () => {
            if (!window.confirm("Delete this event? This can't be undone.")) return;
            setDeleting(true);
            await deleteEventAction(editEvent.id);
            router.push("/planner?seg=events");
          }}
        >
          {deleting ? "DELETING…" : "DELETE EVENT"}
        </button>
      )}
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
