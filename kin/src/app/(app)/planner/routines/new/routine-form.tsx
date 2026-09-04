"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createRoutineAction, updateRoutineAction, type RoutineActionState } from "@/lib/actions/routines";
import { SubmitButton } from "@/components/form";
import { DetailHeader } from "@/components/hub-header";
import { Icon } from "@/components/icons";
import { ROUTINE_KINDS, ROUTINE_KIND_META, type RoutineKind } from "@/lib/routines";

const initialState: RoutineActionState = { error: null, field: null };
const WEEKDAYS = [
  { value: 0, label: "S", full: "Sunday" },
  { value: 1, label: "M", full: "Monday" },
  { value: 2, label: "T", full: "Tuesday" },
  { value: 3, label: "W", full: "Wednesday" },
  { value: 4, label: "T", full: "Thursday" },
  { value: 5, label: "F", full: "Friday" },
  { value: 6, label: "S", full: "Saturday" },
];

const REMINDERS = [
  { value: "", label: "None" },
  { value: "0", label: "At the time" },
  { value: "15", label: "15 min before" },
  { value: "30", label: "30 min before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "720", label: "12 hours before" },
  { value: "1440", label: "The day before" },
];

/** Starting points for the routines almost every household has, so setting
 * one up is a tap and an edit rather than a blank form. */
type Template = {
  id: string;
  label: string;
  kind: RoutineKind;
  title: string;
  freq: "daily" | "weekly" | "monthly";
  byweekday: number[];
  bymonthday?: number;
  time: string;
  reminder: string;
};

const TEMPLATES: Template[] = [
  { id: "grocery", label: "Weekly grocery", kind: "grocery", title: "Grocery run", freq: "weekly", byweekday: [6], time: "09:00", reminder: "60" },
  { id: "mass", label: "Sunday mass", kind: "worship", title: "Mass", freq: "weekly", byweekday: [0], time: "07:00", reminder: "30" },
  { id: "gym", label: "Gym days", kind: "fitness", title: "Gym", freq: "weekly", byweekday: [1, 3, 5], time: "06:00", reminder: "30" },
  { id: "swim", label: "Swimming lesson", kind: "lesson", title: "Swimming lesson", freq: "weekly", byweekday: [6], time: "10:00", reminder: "60" },
  { id: "pickleball", label: "Pickleball", kind: "sport", title: "Pickleball", freq: "weekly", byweekday: [2, 4], time: "17:30", reminder: "60" },
  { id: "clean", label: "House clean", kind: "chore", title: "House clean", freq: "weekly", byweekday: [0], time: "08:00", reminder: "" },
];

/** Wraps a field so a refusal can point straight at it: named for scrolling,
 * ringed and announced when it is the one at fault. */
function FieldBlock({
  name,
  invalid,
  children,
  style,
}: {
  name: string;
  invalid: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      data-field={name}
      className="field"
      style={{
        ...style,
        ...(invalid
          ? {
              boxShadow: "0 0 0 2px var(--cal-occasion)",
              borderRadius: 14,
              padding: 8,
              margin: "-8px -8px 6px",
            }
          : null),
      }}
    >
      {children}
    </div>
  );
}

type Member = { id: string; full_name: string };
type Account = { id: string; name: string; institution: string | null };

export type EditRoutine = {
  id: string;
  title: string;
  kind: string;
  freq: string;
  repeat_interval: number;
  byweekday: number[] | null;
  bymonthday: number | null;
  start_date: string;
  end_date: string | null;
  time_of_day: string | null;
  duration_minutes: number | null;
  reminder_minutes: number | null;
  location: string | null;
  notes: string | null;
  applies_to_whole_family: boolean;
  rotate_assignee: boolean;
  expected_cost: string | number | null;
  cost_account_id: string | null;
  expense_category: string | null;
  memberIds: string[];
};

export function RoutineForm({
  members,
  accounts,
  edit,
  today,
}: {
  members: Member[];
  accounts: Account[];
  edit?: EditRoutine | null;
  today: string;
}) {
  const action = edit ? updateRoutineAction.bind(null, edit.id) : createRoutineAction;
  const [state, formAction] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const bad = (name: string) => state.field === name;

  // A message the person cannot see is no message at all: bring the field it
  // is about into view, and focus it so the next keystroke lands there.
  useEffect(() => {
    if (!state.error || !state.field) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${state.field}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLElement>("input, select, textarea, button")?.focus({ preventScroll: true });
  }, [state]);

  const [kind, setKind] = useState<RoutineKind>((edit?.kind as RoutineKind) ?? "other");
  const [title, setTitle] = useState(edit?.title ?? "");
  const [freq, setFreq] = useState(edit?.freq ?? "weekly");
  const [byweekday, setByweekday] = useState<number[]>(edit?.byweekday ?? [1, 3, 5]);
  const [time, setTime] = useState(edit?.time_of_day?.slice(0, 5) ?? "");
  const [reminder, setReminder] = useState(edit?.reminder_minutes == null ? "" : String(edit.reminder_minutes));
  const [wholeFamily, setWholeFamily] = useState(edit?.applies_to_whole_family ?? false);
  const [who, setWho] = useState<string[]>(edit?.memberIds ?? []);
  const [rotate, setRotate] = useState(edit?.rotate_assignee ?? false);
  const [cost, setCost] = useState(edit?.expected_cost != null ? String(edit.expected_cost) : "");

  const applyTemplate = (t: Template) => {
    setKind(t.kind);
    setTitle(t.title);
    setFreq(t.freq);
    setByweekday(t.byweekday);
    setTime(t.time);
    setReminder(t.reminder);
  };

  const toggleDay = (d: number) => setByweekday((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  const toggleWho = (id: string) => setWho((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div>
      <DetailHeader backHref="/planner?seg=routines" eyebrow={edit ? "HUB 03 · EDIT ROUTINE" : "HUB 03 · NEW ROUTINE"} />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 14px" }}>{edit ? "Edit routine" : "Add a routine"}</h3>

        {!edit && (
          <>
            <div style={{ fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 8 }}>
              Start from
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" className="chip" onClick={() => applyTemplate(t)}>
                  <Icon name={ROUTINE_KIND_META[t.kind].icon} size={13} />
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}

        <form action={formAction} ref={formRef}>

          <FieldBlock name="title" invalid={bad("title")} style={{ marginBottom: 14 }}>
            <label>NAME</label>
            <input className="input" name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Grocery run" style={{ minHeight: 44 }} />
          </FieldBlock>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>KIND</label>
            <select className="input" name="kind" value={kind} onChange={(e) => setKind(e.target.value as RoutineKind)} style={{ minHeight: 44 }}>
              {ROUTINE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ROUTINE_KIND_META[k].label}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <label>REPEATS</label>
            <div className="seg" style={{ marginTop: 0 }}>
              {["daily", "weekly", "monthly"].map((f) => (
                <button key={f} type="button" data-active={freq === f} onClick={() => setFreq(f)}>
                  {f}
                </button>
              ))}
            </div>
            <input type="hidden" name="freq" value={freq} />
          </div>

          {freq === "weekly" && (
            <div data-field="byweekday" style={{ display: "flex", gap: 5, marginBottom: 14, ...(bad("byweekday") ? { boxShadow: "0 0 0 2px var(--cal-occasion)", borderRadius: 999, padding: 6, margin: "-6px -6px 8px" } : null) }}>
              {WEEKDAYS.map((d) => {
                const on = byweekday.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    aria-pressed={on}
                    aria-label={d.full}
                    style={{
                      flex: 1,
                      minHeight: 40,
                      borderRadius: 999,
                      border: 0,
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      fontWeight: on ? 600 : 500,
                      background: on ? "var(--color-accent-solid)" : "color-mix(in srgb, var(--color-text) 6%, transparent)",
                      color: on ? "#fff" : "var(--color-text)",
                    }}
                  >
                    {d.label}
                  </button>
                );
              })}
              {byweekday.map((d) => (
                <input key={d} type="hidden" name="byweekday" value={d} />
              ))}
            </div>
          )}

          {freq === "monthly" && (
            <FieldBlock name="bymonthday" invalid={bad("bymonthday")} style={{ marginBottom: 14 }}>
              <label>DAY OF THE MONTH</label>
              <input className="input" type="number" name="bymonthday" min={1} max={31} defaultValue={edit?.bymonthday ?? 1} style={{ minHeight: 44 }} />
              <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>A day past the end of a short month falls on its last day.</span>
            </FieldBlock>
          )}

          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>EVERY</label>
              <select className="input" name="repeat_interval" defaultValue={edit?.repeat_interval ?? 1} style={{ minHeight: 44 }}>
                {[1, 2, 3, 4, 6, 12].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? `1 ${freq === "daily" ? "day" : freq === "weekly" ? "week" : "month"}` : `${n} ${freq === "daily" ? "days" : freq === "weekly" ? "weeks" : "months"}`}
                  </option>
                ))}
              </select>
            </div>
            <FieldBlock name="time_of_day" invalid={bad("time_of_day")} style={{ flex: 1 }}>
              <label>TIME</label>
              <input className="input" type="time" name="time_of_day" value={time} onChange={(e) => setTime(e.target.value)} style={{ minHeight: 44 }} />
            </FieldBlock>
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <FieldBlock name="start_date" invalid={bad("start_date")} style={{ flex: 1 }}>
              <label>STARTS</label>
              <input className="input" type="date" name="start_date" required defaultValue={edit?.start_date ?? today} style={{ minHeight: 44 }} />
            </FieldBlock>
            <FieldBlock name="end_date" invalid={bad("end_date")} style={{ flex: 1 }}>
              <label>ENDS (OPTIONAL)</label>
              <input className="input" type="date" name="end_date" defaultValue={edit?.end_date ?? undefined} style={{ minHeight: 44 }} />
            </FieldBlock>
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>REMIND</label>
            <select className="input" name="reminder_minutes" value={reminder} onChange={(e) => setReminder(e.target.value)} style={{ minHeight: 44 }}>
              {REMINDERS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
              The alert comes from each person&rsquo;s own Google Calendar, so it reaches their phone. They need Google Calendar
              connected in Settings.
            </span>
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>WHERE (OPTIONAL)</label>
            <input className="input" name="location" defaultValue={edit?.location ?? undefined} placeholder="SM Marikina" style={{ minHeight: 44 }} />
          </div>

          <div style={{ fontSize: 13, color: "var(--color-neutral-700)", margin: "16px 0 6px" }}>Who it is for</div>
          <div data-field="members" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, ...(bad("members") ? { boxShadow: "0 0 0 2px var(--cal-occasion)", borderRadius: 999, padding: 6, margin: "0 -6px 12px" } : null) }}>
            <button type="button" className="chip" data-active={wholeFamily} onClick={() => setWholeFamily(true)}>
              Whole family
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="chip"
                data-active={!wholeFamily && who.includes(m.id)}
                onClick={() => {
                  setWholeFamily(false);
                  toggleWho(m.id);
                }}
              >
                {m.full_name.split(" ")[0]}
              </button>
            ))}
          </div>
          {wholeFamily && <input type="hidden" name="whole_family" value="on" />}
          {!wholeFamily && who.map((id) => <input key={id} type="hidden" name="members" value={id} />)}

          {!wholeFamily && who.length >= 2 && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" name="rotate" checked={rotate} onChange={(e) => setRotate(e.target.checked)} style={{ width: 20, height: 20 }} />
              <span style={{ fontSize: 14.5 }}>
                Take turns
                <span style={{ display: "block", fontSize: 12.5, color: "var(--color-neutral-600)" }}>
                  Each occurrence goes to the next person, in the order picked above.
                </span>
              </span>
            </label>
          )}

          <div style={{ fontSize: 13, color: "var(--color-neutral-700)", margin: "16px 0 6px" }}>What it usually costs (optional)</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
            <FieldBlock name="expected_cost" invalid={bad("expected_cost")} style={{ flex: 1 }}>
              <label>AMOUNT</label>
              <input className="input" type="number" name="expected_cost" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} style={{ minHeight: 44 }} />
            </FieldBlock>
            <FieldBlock name="cost_account_id" invalid={bad("cost_account_id")} style={{ flex: 1.3 }}>
              <label>FROM ACCOUNT</label>
              <select className="input" name="cost_account_id" defaultValue={edit?.cost_account_id ?? ""} style={{ minHeight: 44 }}>
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.institution ? ` · ${a.institution}` : ""}
                  </option>
                ))}
              </select>
            </FieldBlock>
          </div>
          <input type="hidden" name="expense_category" value={ROUTINE_KIND_META[kind].label} />
          <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "0 0 14px", lineHeight: 1.45 }}>
            Marking the routine done posts this to the ledger, so recurring spending shows in Wealth without entering it
            twice. Leave it blank if the routine costs nothing.
          </p>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>NOTES</label>
            <textarea className="input" name="notes" defaultValue={edit?.notes ?? undefined} />
          </div>

          {/* Beside the button that was just pressed, not at the top of a
              form the person has already scrolled past. */}
          {state.error && (
            <p
              role="alert"
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                margin: "0 0 12px",
                padding: "11px 13px",
                borderRadius: 12,
                background: "color-mix(in srgb, var(--cal-occasion) 12%, transparent)",
                color: "var(--color-text)",
                fontSize: 14,
                lineHeight: 1.4,
              }}
            >
              <Icon name="info" size={16} style={{ color: "var(--cal-occasion)", flex: "none", marginTop: 1 }} />
              {state.error}
            </p>
          )}

          <SubmitButton>{edit ? "SAVE ROUTINE" : "ADD ROUTINE"}</SubmitButton>
        </form>
      </div>
    </div>
  );
}
