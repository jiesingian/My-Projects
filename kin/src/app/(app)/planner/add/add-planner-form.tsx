"use client";

import { FlyerScanner } from "@/components/flyer-scanner";
import { InviteCard } from "@/components/invite-card";
import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createActivityAction,
  updateActivityAction,
  deleteActivityAction,
  createEventAction,
  updateEventAction,
  deleteEventAction,
} from "@/lib/actions/planner";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import type { Tables } from "@/lib/database.types";
import { familyClock, familyDay } from "@/lib/time";
import { DateInput } from "@/components/date-input";
import { confirm } from "@/components/confirm-sheet";
import { AmountInput } from "@/components/amount-input";
import { CURRENCIES } from "@/lib/household-prefs";

const initialState: ActionState = { error: null };
// "task" is what the app calls a one-off; the table behind it is still
// `activities`, which is why the edit props below keep that word. Renaming
// the table is a migration for its own day -- this is the word people read.
const TYPES = ["task", "event"] as const;
type PlannerType = (typeof TYPES)[number];

type EditActivity = Tables<"activities"> & { who: string[] };
type EditEvent = Tables<"events">;

/** Words carried in from somewhere else -- today, a chat message someone
 * chose to turn into a task or an event. Only ever a starting point: every
 * field stays editable and nothing is saved until Save is pressed. */
export type PlannerPrefill = { title?: string; notes?: string };

export function AddPlannerForm({
  members,
  defaultType,
  defaultDate,
  editActivity,
  editEvent,
  prefill,
  householdCurrency,
  scanReady,
}: {
  members: Tables<"members">[];
  defaultType: string;
  /** The day the calendar was sitting on when Add was tapped. */
  defaultDate?: string;
  editActivity?: EditActivity | null;
  editEvent?: (EditEvent & { memberIds: string[] }) | null;
  prefill?: PlannerPrefill;
  /** What a new budget is in unless someone picks otherwise. */
  householdCurrency: string;
  /** False until the scanner's key is set; the card says so instead. */
  scanReady: boolean;
}) {
  const isEditing = !!editActivity || !!editEvent;
  const [type, setType] = useState<PlannerType>(TYPES.includes(defaultType as PlannerType) ? (defaultType as PlannerType) : "task");
  const editing = editActivity ? "task" : editEvent ? "event" : null;

  return (
    <div>
      <DetailHeader backHref="/planner" eyebrow="Planner" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <h3 style={{ fontSize: "2rem", margin: "0 0 14px" }}>{isEditing ? "Edit" : "Add to"} Planner</h3>
        {!isEditing && <FlyerScanner ready={scanReady} />}
        {!isEditing && (
          <div className="seg" style={{ marginBottom: "1.125rem", marginTop: 0 }}>
            {TYPES.map((t) => (
              <button key={t} type="button" data-active={type === t} onClick={() => setType(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        {(editing === null || editing === "task") && type === "task" && <ActivityForm members={members} defaultDate={defaultDate} editActivity={editActivity ?? undefined} prefill={prefill} />}
        {(editing === null || editing === "event") && type === "event" && <EventForm members={members} defaultDate={defaultDate} editEvent={editEvent ?? undefined} prefill={prefill} householdCurrency={householdCurrency} />}
      </div>
    </div>
  );
}

function ActivityForm({ members, defaultDate, editActivity, prefill }: { members: Tables<"members">[]; defaultDate?: string; editActivity?: EditActivity; prefill?: PlannerPrefill }) {
  const action = editActivity ? updateActivityAction.bind(null, editActivity.id) : createActivityAction;
  const [state, formAction, saving] = useActionState(action, initialState);
  const [wholeFamily, setWholeFamily] = useState(editActivity?.applies_to_whole_family ?? true);
  const [who, setWho] = useState<string[]>(editActivity?.who ?? []);
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // start_at is an instant, and Postgres hands it over in UTC. Slicing the
  // characters out of that string reads the clock in London, not the one in
  // the kitchen: an activity typed as 18:00 came back to the form as 10:00.
  // That is not merely a wrong label -- this form rewrites the whole row on
  // save, parsing date and time in the household's zone, so opening an
  // activity and changing only its title used to walk it eight hours earlier,
  // every time, silently.
  const startDate = editActivity ? familyDay(new Date(editActivity.start_at)) : undefined;
  const startTime = editActivity ? familyClock(new Date(editActivity.start_at)) : undefined;
  const endTime = editActivity?.end_at ? familyClock(new Date(editActivity.end_at)) : undefined;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // The same reset EventForm steps around: a refused save -- an end time
        // before the start -- used to clear the title, date, times and notes.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="whole_family" value={wholeFamily ? "on" : ""} />
      {who.map((id) => (
        <input key={id} type="hidden" name="who" value={id} />
      ))}
      <ErrorText message={state.error} />
      <Field label="Title"><input className="input" name="title" placeholder="Nursery orientation" required maxLength={150} defaultValue={editActivity?.title ?? prefill?.title} style={{ minHeight: "2.75rem" }} /></Field>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.875rem" }}>
        <Field label="Date" style={{ flex: 1.2 }}><DateInput className="input" name="date" required defaultValue={startDate ?? defaultDate} style={{ minHeight: "2.75rem" }} /></Field>
        <Field label="From" style={{ flex: 1 }}><input className="input" type="time" name="from" defaultValue={startTime ?? "08:30"} style={{ minHeight: "2.75rem" }} /></Field>
        <Field label="TO" style={{ flex: 1 }}><input className="input" type="time" name="to" defaultValue={endTime} style={{ minHeight: "2.75rem" }} /></Field>
      </div>
      <Field label="Repeats">
        <select className="input" name="repeat" defaultValue={editActivity?.repeat ?? "once"} style={{ minHeight: "2.75rem" }}>
          <option value="once">Once</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </Field>
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "14px 0 6px" }}>Who it is for</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4375rem", marginBottom: "1rem" }}>
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
      <Field label="Location"><input className="input" name="location" placeholder="Little Acorns, San Juan" maxLength={200} defaultValue={editActivity?.location ?? undefined} style={{ minHeight: "2.75rem" }} /></Field>
      <Field label="Notes"><textarea className="input" name="notes" maxLength={1000} defaultValue={editActivity?.notes ?? prefill?.notes} /></Field>
      <SubmitButton pending={saving} style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>{editActivity ? "Save changes" : "Save to calendar"}</SubmitButton>
      {editActivity && (
        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={deleting}
          style={{ minHeight: "2.75rem", fontSize: "0.8125rem", marginTop: "0.625rem", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
          onClick={async () => {
            if (!(await confirm({ title: "Delete this task?", description: "This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
            setDeleting(true);
            const result = await deleteActivityAction(editActivity.id);
            setDeleting(false);
            if (result.error) {
              setDeleteError(result.error);
              return;
            }
            router.push("/planner?seg=calendar");
          }}
        >
          {deleting ? "Deleting…" : "Delete task"}
        </button>
      )}
      <ErrorText message={deleteError} />
    </form>
  );
}

/** Whole family, or these people. Activities already asked this; events and
 * travel now ask it the same way, so who a record concerns is one idea
 * across the Planner rather than three. */
function WhoPicker({
  members,
  label,
  fieldName,
  wholeFamily,
  setWholeFamily,
  chosen,
  setChosen,
}: {
  members: Tables<"members">[];
  label: string;
  fieldName: string;
  wholeFamily: boolean;
  setWholeFamily: (v: boolean) => void;
  chosen: string[];
  setChosen: (fn: (prev: string[]) => string[]) => void;
}) {
  return (
    <>
      {wholeFamily && <input type="hidden" name="whole_family" value="on" />}
      {!wholeFamily && chosen.map((id) => <input key={id} type="hidden" name={fieldName} value={id} />)}
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "14px 0 6px" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "1rem" }}>
        <button type="button" className="chip" data-active={wholeFamily} onClick={() => setWholeFamily(true)}>
          Whole family
        </button>
        {members.map((m) => {
          const active = !wholeFamily && chosen.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              className="chip"
              data-active={active}
              onClick={() => {
                setWholeFamily(false);
                setChosen((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]));
              }}
            >
              {m.full_name.split(" ")[0]}
            </button>
          );
        })}
      </div>
    </>
  );
}

function EventForm({
  members,
  defaultDate,
  editEvent,
  prefill,
  householdCurrency,
}: {
  members: Tables<"members">[];
  defaultDate?: string;
  editEvent?: EditEvent & { memberIds?: string[] };
  prefill?: PlannerPrefill;
  householdCurrency: string;
}) {
  const action = editEvent ? updateEventAction.bind(null, editEvent.id) : createEventAction;
  const [state, formAction, saving] = useActionState(action, initialState);
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [wholeFamily, setWholeFamily] = useState(editEvent?.applies_to_whole_family ?? true);
  const [who, setWho] = useState<string[]>(editEvent?.memberIds ?? []);
  // An existing budget keeps the currency it was entered in; a new one starts
  // in the household's. A household whose own currency predates the list
  // still gets it offered, rather than the picker silently showing PHP.
  const budgetCurrency = editEvent?.budget_currency ?? householdCurrency;
  const currencyOptions: { code: string; label: string }[] = CURRENCIES.some((c) => c.code === budgetCurrency)
    ? [...CURRENCIES]
    : [{ code: budgetCurrency, label: budgetCurrency }, ...CURRENCIES];

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // React resets a form once its action has run, whether it succeeded or
        // not -- so a refused invitation link, or an end date before the start,
        // wiped every field and the whole event had to be typed again.
        // Submitting through the transition here keeps what was entered; the
        // action attribute stays for a submit before the page has hydrated.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <ErrorText message={state.error} />
      <Field label="Title"><input className="input" name="title" required maxLength={150} defaultValue={editEvent?.title ?? prefill?.title} style={{ minHeight: "2.75rem" }} /></Field>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <Field label="Date" style={{ flex: 1 }}>
          <DateInput className="input" name="date" required defaultValue={editEvent?.event_date ?? defaultDate} style={{ minHeight: "2.75rem" }} />
        </Field>
        {/* Optional, and what makes travel an event rather than its own
            table: a birthday is a day, a trip is a run of them. */}
        <Field label="Ends (optional)" style={{ flex: 1 }}>
          <DateInput className="input" name="end_date" defaultValue={editEvent?.end_date ?? undefined} style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      <Field label="Kind">
        <select className="input" name="kind" defaultValue={editEvent?.kind ?? "birthday"} style={{ minHeight: "2.75rem" }}>
          <option value="birthday">Birthday</option>
          <option value="anniversary">Anniversary</option>
          <option value="school">School event</option>
          <option value="health">Health</option>
          <option value="travel">Travel</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Note"><input className="input" name="sub_note" placeholder="Dinner at home" maxLength={200} defaultValue={editEvent?.sub_note ?? prefill?.notes} style={{ minHeight: "2.75rem" }} /></Field>
      {/* type="text" rather than "url": a link copied from an address bar often
          arrives without https://, which "url" refuses with a browser message
          of its own. The action adds it and says plainly if it's not a link. */}
      <Field label="Invitation link (optional)">
        <input
          className="input"
          name="invite_url"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={2048}
          placeholder="Paste the invitation's link — Evite, Facebook, a wedding site"
          defaultValue={editEvent?.invite_url ?? undefined}
          style={{ minHeight: "2.75rem" }}
        />
      </Field>
      {/* The preview card lives here now; the Planner list shows the title as
          the link instead, so its rows line up. */}
      {editEvent?.id && editEvent.invite_url && <InviteCard eventId={editEvent.id} url={editEvent.invite_url} />}
      <Field label="Budget (optional)">
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <select
            className="input"
            name="budget_currency"
            aria-label="Budget currency"
            defaultValue={budgetCurrency}
            style={{ minHeight: "2.75rem", width: "8rem", flex: "none" }}
          >
            {currencyOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <AmountInput
            name="budget_amount"
            ariaLabel="Budget amount"
            placeholder="For a trip, or anything with a cost"
            defaultValue={editEvent?.budget_amount}
            style={{ minHeight: "2.75rem", flex: 1, minWidth: 0 }}
          />
        </div>
      </Field>
      <WhoPicker
        members={members}
        label="Who it is for"
        fieldName="who"
        wholeFamily={wholeFamily}
        setWholeFamily={setWholeFamily}
        chosen={who}
        setChosen={setWho}
      />
      <SubmitButton pending={saving} style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>{editEvent ? "Save changes" : "Save event"}</SubmitButton>
      {editEvent && (
        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={deleting}
          style={{ minHeight: "2.75rem", fontSize: "0.8125rem", marginTop: "0.625rem", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
          onClick={async () => {
            if (!(await confirm({ title: "Delete this event?", description: "This can't be undone.", confirmLabel: "Delete", danger: true }))) return;
            setDeleting(true);
            const result = await deleteEventAction(editEvent.id);
            setDeleting(false);
            if (result.error) {
              setDeleteError(result.error);
              return;
            }
            router.push("/planner?seg=events");
          }}
        >
          {deleting ? "Deleting…" : "Delete event"}
        </button>
      )}
      <ErrorText message={deleteError} />
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
