"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toast } from "@/components/toast";
import { confirm } from "@/components/confirm-sheet";
import { visibilityOptions } from "@/lib/visibility";
import { dosesFor, FEVER_C, type Dose, type Medicine } from "@/lib/health-plan";
import { alertLine, canBeTold, DEFAULT_MISSED_DELAY, delayWords, MISSED_DELAYS } from "@/lib/missed-dose";
import { isGrownUp } from "@/lib/roles";
import { amountWords, daysLeft, daysLeftWords, guessFromDose, isSupplyUnit, needsRefill, SUPPLY_UNITS, type SupplyUnit } from "@/lib/medicine-supply";
import { doseName, type GuideDose } from "@/lib/vaccine-schedule";
import { ageInMonths, growthPercentile, percentileLabel, valueAtPercentile, type Sex } from "@/lib/growth";
import {
  addIllnessLogAction,
  addMedicineAction,
  deleteIllnessLogAction,
  deleteMedicineAction,
  setDoseTakenAction,
  setMemberSexAction,
  setMissedDoseAlertAction,
  setMedicineSupplyAction,
  addToMedicineSupplyAction,
  stopMedicineSupplyAction,
  stopMedicineAction,
} from "@/lib/actions/health-care";
import { markVaccineGivenAction } from "@/lib/actions/health";

/** The Health tab's medicines, illness log and growth chart (26 September).
 * Times and days are the family's (Asia/Manila), worked out on the server and
 * passed in, so the server's render and the browser's agree. */

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error: string | null }>, ok?: string) =>
    start(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
      else {
        if (ok) toast.success(ok);
        router.refresh();
      }
    });
  return { pending, run };
}

function VisibilitySelect({ role, value, onChange }: { role: string; value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Who can see this" style={{ minHeight: "2.75rem" }}>
      {visibilityOptions(role).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── medicines ────────────────────────────────────────────────────────────────

export function MedicinesPanel({
  memberId,
  firstName,
  medicines,
  doses,
  missedAlerts,
  supply,
  grownUps,
  today,
  now,
  role,
}: {
  memberId: string;
  firstName: string;
  medicines: (Medicine & { notes: string | null; visibility: string; created_by: string | null })[];
  doses: Dose[];
  missedAlerts: MissedAlert[];
  supply: Supply[];
  grownUps: GrownUp[];
  today: string;
  now: string;
  role: string;
}) {
  const { pending, run } = useAct();
  const [adding, setAdding] = useState(medicines.length === 0);
  const due = dosesFor(medicines, doses, today, now);
  const current = medicines.filter((m) => m.end_date === null || m.end_date >= today);
  const finished = medicines.filter((m) => m.end_date !== null && m.end_date < today);

  return (
    <div className="kin-care">
      {due.length > 0 && (
        <>
          <div className="kin-eyebrow">TODAY</div>
          <div className="kin-care-doses">
            {due.map((d) => (
              <button
                key={`${d.medicineId}-${d.time}`}
                type="button"
                className="kin-care-dose"
                data-taken={d.taken || undefined}
                data-late={d.late || undefined}
                aria-pressed={d.taken}
                disabled={pending}
                onClick={() => run(() => setDoseTakenAction({ medicineId: d.medicineId, memberId, day: today, time: d.time, taken: !d.taken }))}
              >
                <span className="kin-care-dose-tick" aria-hidden="true">
                  {d.taken && <Icon name="check" size="0.875rem" />}
                </span>
                <span className="kin-care-dose-time">{d.time}</span>
                <span className="kin-care-dose-name">
                  {d.name}
                  {d.dose ? ` · ${d.dose}` : ""}
                </span>
                <span className="kin-care-dose-state">{d.taken ? "Taken" : d.late ? "Late" : "Due"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="kin-eyebrow" style={{ marginTop: due.length ? "1.25rem" : 0 }}>
        {current.length ? "TAKING NOW" : "MEDICINES"}
      </div>
      {current.length === 0 && <p className="kin-care-empty">Nothing {firstName} takes regularly. Add a medicine to get a tick for each dose.</p>}
      {current.map((m) => (
        <div key={m.id} className="kin-care-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="kin-care-row-title">
              {m.name}
              {m.dose ? <span className="kin-care-muted"> · {m.dose}</span> : null}
            </div>
            <div className="kin-care-muted">
              {m.times.length ? m.times.join(", ") : "As needed"}
              {m.end_date ? ` · until ${m.end_date}` : ""}
              {m.notes ? ` · ${m.notes}` : ""}
            </div>
            <SupplyLine medicine={m} memberId={memberId} supply={supply.find((x) => x.medicine_id === m.id) ?? null} canChange={isGrownUp(role)} />
            {m.times.length > 0 && (
              <MissedDoseAlert
                medicine={m}
                memberId={memberId}
                alert={missedAlerts.find((a) => a.medicine_id === m.id) ?? null}
                grownUps={grownUps}
                canChange={isGrownUp(role)}
              />
            )}
          </div>
          {/* Added today: most likely a mistake, so it can go entirely. */}
          {m.start_date >= today ? (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={async () => (await confirm({ title: `Remove ${m.name}?`, description: "It was added today. It is removed completely, with any doses ticked today.", confirmLabel: "Remove", danger: true })) && run(() => deleteMedicineAction(m.id, memberId))}>
              Remove
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={async () => (await confirm({ title: `Stop ${m.name}?`, description: "It moves to Finished, and the doses already ticked stay on record.", confirmLabel: "Stop" })) && run(() => stopMedicineAction(m.id, memberId))}>
              Stop
            </button>
          )}
        </div>
      ))}

      {adding ? (
        <MedicineForm memberId={memberId} role={role} today={today} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: "0.75rem" }} onClick={() => setAdding(true)}>
          <Icon name="plus" size="0.9375rem" /> Add a medicine
        </button>
      )}

      {finished.length > 0 && (
        <details className="kin-fold" style={{ marginTop: "1rem" }}>
          <summary>Finished ({finished.length})</summary>
          {finished.map((m) => (
            <div key={m.id} className="kin-care-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="kin-care-row-title">{m.name}</div>
                <div className="kin-care-muted">
                  {m.start_date} to {m.end_date}
                </div>
              </div>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={async () => (await confirm({ title: `Delete ${m.name}?`, description: "Its doses go with it. This can't be undone.", confirmLabel: "Delete", danger: true })) && run(() => deleteMedicineAction(m.id, memberId))}>
                Delete
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

export type MissedAlert = { medicine_id: string; notify_member_id: string; delay_minutes: number };
export type GrownUp = { id: string; firstName: string; role: string; hasLogin: boolean };

/** "Tell someone if a dose is missed" (20261014200000). Who is told is
 * written on the card for everyone who can see the medicine, so it never
 * feels like hidden watching; only a grown-up can change it. */
function MissedDoseAlert({
  medicine,
  memberId,
  alert,
  grownUps,
  canChange,
}: {
  medicine: Medicine & { visibility: string; created_by: string | null };
  memberId: string;
  alert: MissedAlert | null;
  grownUps: GrownUp[];
  canChange: boolean;
}) {
  const { pending, run } = useAct();
  const choices = grownUps.filter((g) => canBeTold(g, medicine));
  const [open, setOpen] = useState(false);
  // The person named may since have lost their login, stopped being a
  // grown-up or lost sight of the medicine; the job then tells nobody, and
  // the card says so rather than name them.
  const told = alert ? choices.find((g) => g.id === alert.notify_member_id) : undefined;
  const [who, setWho] = useState(told?.id ?? choices[0]?.id ?? "");
  const [delay, setDelay] = useState<number>(alert?.delay_minutes ?? DEFAULT_MISSED_DELAY);

  if (!open) {
    if (!alert && !canChange) return null;
    return (
      <div className="kin-care-muted" style={{ marginTop: "0.25rem" }}>
        {alert ? <span>{told ? `${alertLine(told.firstName, alert.delay_minutes)}.` : "Nobody can be told about a missed dose now: choose someone else."} </span> : null}
        {canChange && (
          <button type="button" className="kin-care-link" onClick={() => setOpen(true)}>
            {alert ? "Change" : "Tell someone if a dose is missed"}
          </button>
        )}
      </div>
    );
  }
  if (choices.length === 0) {
    return (
      <div className="kin-care-muted" style={{ marginTop: "0.25rem" }}>
        Nobody else can be told yet: it needs a grown-up with their own Kin login who can see this medicine.{" "}
        <button type="button" className="kin-care-link" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    );
  }
  return (
    <form
      className="kin-care-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await setMissedDoseAlertAction({ medicineId: medicine.id, memberId, notifyMemberId: who, delayMinutes: delay });
          if (!r.error) setOpen(false);
          return r;
        }, "Saved");
      }}
    >
      <label className="kin-care-label">
        Who to tell
        <select className="input" value={who} onChange={(e) => setWho(e.target.value)} style={{ minHeight: "2.75rem" }}>
          {choices.map((g) => (
            <option key={g.id} value={g.id}>
              {g.firstName}
            </option>
          ))}
        </select>
      </label>
      <label className="kin-care-label">
        If a dose isn&apos;t ticked after
        <select className="input" value={delay} onChange={(e) => setDelay(Number(e.target.value))} style={{ minHeight: "2.75rem" }}>
          {MISSED_DELAYS.map((d) => (
            <option key={d} value={d}>
              {delayWords(d).replace(/^./, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </label>
      <p className="kin-care-muted" style={{ margin: 0 }}>
        They get one notification per missed dose. Everyone who can see this medicine sees who is told.
      </p>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        {alert ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1 }}
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await setMissedDoseAlertAction({ medicineId: medicine.id, memberId, notifyMemberId: null, delayMinutes: delay });
                if (!r.error) setOpen(false);
                return r;
              }, "Turned off")
            }
          >
            Turn off
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={pending || !who}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export type Supply = { medicine_id: string; counted: number; unit: string; per_dose: number; onHand: number | null };

/** Pills left (20261014201000). What is left is worked out by the database
 * from the doses ticked since the count; this says it in days. Refilled
 * starts again from a new count, or adds a box to what is left. */
function SupplyLine({ medicine, memberId, supply, canChange }: { medicine: Medicine & { visibility: string }; memberId: string; supply: Supply | null; canChange: boolean }) {
  const { pending, run } = useAct();
  const guess = guessFromDose(medicine.dose);
  const unit: SupplyUnit = supply && isSupplyUnit(supply.unit) ? supply.unit : guess.unit;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ counted: "", unit: unit as string, perDose: String(supply?.per_dose ?? guess.perDose) });
  const box = unit === "ml" ? 60 : 30;

  if (!open) {
    if (!supply && !canChange) return null;
    const days = supply && supply.onHand !== null ? daysLeft(supply.onHand, supply.per_dose, medicine.times.length) : null;
    const words = daysLeftWords(days);
    return (
      <div className="kin-care-muted" style={{ marginTop: "0.25rem" }}>
        {supply && supply.onHand === null && <span>Kin couldn&apos;t work out what&apos;s left just now. </span>}
        {supply && supply.onHand !== null && (
          <span data-low={needsRefill(days) || undefined} className="kin-care-supply">
            {words ? `${words} · ` : ""}
            {amountWords(supply.onHand, unit)}
            {words ? "" : " left"}.{" "}
          </span>
        )}
        {canChange && (
          <button type="button" className="kin-care-link" onClick={() => setOpen(true)}>
            {supply ? "Refilled" : "Track how many are left"}
          </button>
        )}
      </div>
    );
  }
  return (
    <form
      className="kin-care-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await setMedicineSupplyAction({ medicineId: medicine.id, memberId, ...f });
          if (!r.error) {
            setOpen(false);
            setF({ ...f, counted: "" });
          }
          return r;
        }, "Saved");
      }}
    >
      {/* Wraps: the card's column is narrow on a small phone. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <label className="kin-care-label" style={{ minWidth: "6rem" }}>
          {supply ? "New count on hand" : "On hand now"}
          <input className="input" inputMode="decimal" placeholder="e.g. 30" value={f.counted} onChange={(e) => setF({ ...f, counted: e.target.value })} required />
        </label>
        <label className="kin-care-label" style={{ minWidth: "6rem" }}>
          Counted in
          <select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} style={{ minHeight: "2.75rem" }}>
            {SUPPLY_UNITS.map((u) => (
              <option key={u} value={u}>
                {u === "ml" ? "ml" : `${u}s`}
              </option>
            ))}
          </select>
        </label>
        <label className="kin-care-label" style={{ minWidth: "6rem" }}>
          Per dose
          <input className="input" inputMode="decimal" value={f.perDose} onChange={(e) => setF({ ...f, perDose: e.target.value })} />
        </label>
      </div>
      <p className="kin-care-muted" style={{ margin: 0 }}>
        Each dose ticked Taken comes off what&apos;s left.{" "}
        {medicine.visibility === "family"
          ? "At 7 days left it goes on the To-Buy list."
          : "At 7 days left the grown-ups who can see it are told. It isn't shown to everyone, so it stays off the To-Buy list."}
      </p>
      {supply && (
        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await addToMedicineSupplyAction(medicine.id, memberId, box);
              if (!r.error) setOpen(false);
              return r;
            }, `Added ${amountWords(box, unit)}`)
          }
        >
          <Icon name="plus" size="0.9375rem" /> Add a box of {amountWords(box, unit)} to what&apos;s left
        </button>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {supply ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: "1 1 100%" }}
            disabled={pending}
            onClick={async () => (await confirm({ title: "Stop counting what's left?", description: "Kin stops working out the days left and won't put it on the list.", confirmLabel: "Stop counting" })) && run(() => stopMedicineSupplyAction(medicine.id, memberId))}
          >
            Stop counting
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function MedicineForm({ memberId, role, today, onDone }: { memberId: string; role: string; today: string; onDone: () => void }) {
  const { pending, run } = useAct();
  const [f, setF] = useState({ name: "", dose: "", times: "", startDate: today, endDate: "", notes: "", visibility: "family" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="kin-care-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await addMedicineAction({ memberId, ...f });
          if (!r.error) onDone();
          return r;
        }, "Medicine added");
      }}
    >
      <input className="input" placeholder="Medicine, e.g. Amoxicillin" value={f.name} onChange={set("name")} maxLength={120} aria-label="Medicine" required />
      <input className="input" placeholder="Dose, e.g. 5 ml" value={f.dose} onChange={set("dose")} maxLength={120} aria-label="Dose" />
      <input className="input" placeholder="Times, e.g. 8am, 8pm (blank if as needed)" value={f.times} onChange={set("times")} aria-label="Times" />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <label className="kin-care-label">
          From
          <input className="input" type="date" value={f.startDate} onChange={set("startDate")} />
        </label>
        <label className="kin-care-label">
          Until (optional)
          <input className="input" type="date" value={f.endDate} onChange={set("endDate")} />
        </label>
      </div>
      <input className="input" placeholder="Notes, e.g. after meals" value={f.notes} onChange={set("notes")} maxLength={1000} aria-label="Notes" />
      <VisibilitySelect role={role} value={f.visibility} onChange={(v) => setF({ ...f, visibility: v })} />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={pending}>
          {pending ? "Saving…" : "Add"}
        </button>
      </div>
    </form>
  );
}

// ── the illness log ──────────────────────────────────────────────────────────

export type IllnessLog = { id: string; logged_at: string; temperature_c: number | null; symptoms: string | null; given: string | null; note: string | null; when: string };

export function IllnessPanel({ memberId, firstName, logs, role }: { memberId: string; firstName: string; logs: IllnessLog[]; role: string }) {
  const { pending, run } = useAct();
  const [f, setF] = useState({ temperature: "", symptoms: "", given: "", note: "", visibility: "family" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const temps = logs.filter((l) => l.temperature_c !== null).slice(0, 12).reverse();
  const hi = Math.max(40, ...temps.map((t) => Number(t.temperature_c)));
  const lo = Math.min(36, ...temps.map((t) => Number(t.temperature_c)));

  return (
    <div className="kin-care">
      <p className="kin-care-empty" style={{ marginTop: 0 }}>
        When {firstName} is unwell: a temperature, what you noticed, what you gave and when. It is what the doctor asks for.
      </p>
      <form
        className="kin-care-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await addIllnessLogAction({ memberId, ...f });
            if (!r.error) setF({ temperature: "", symptoms: "", given: "", note: "", visibility: f.visibility });
            return r;
          }, "Logged");
        }}
      >
        <input className="input" inputMode="decimal" placeholder="Temperature °C, e.g. 38.4" value={f.temperature} onChange={set("temperature")} aria-label="Temperature in °C" />
        <input className="input" placeholder="Symptoms, e.g. cough, runny nose" value={f.symptoms} onChange={set("symptoms")} maxLength={300} aria-label="Symptoms" />
        <input className="input" placeholder="Given, e.g. paracetamol 5 ml" value={f.given} onChange={set("given")} maxLength={300} aria-label="Medicine given" />
        <input className="input" placeholder="Note" value={f.note} onChange={set("note")} maxLength={1000} aria-label="Note" />
        <VisibilitySelect role={role} value={f.visibility} onChange={(v) => setF({ ...f, visibility: v })} />
        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Saving…" : "Log it"}
        </button>
      </form>

      {temps.length > 1 && (
        <div className="kin-care-temps" role="img" aria-label={`Temperatures: ${temps.map((t) => `${t.temperature_c}°C`).join(", ")}`}>
          {temps.map((t) => (
            <div key={t.id} className="kin-care-temp" data-fever={Number(t.temperature_c) >= FEVER_C || undefined}>
              <span style={{ height: `${Math.max(8, ((Number(t.temperature_c) - lo) / (hi - lo || 1)) * 100)}%` }} />
              <small>{Number(t.temperature_c).toFixed(1)}</small>
            </div>
          ))}
        </div>
      )}

      {logs.map((l) => (
        <div key={l.id} className="kin-care-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="kin-care-row-title">
              {l.temperature_c !== null && (
                <span className="kin-care-temp-tag" data-fever={Number(l.temperature_c) >= FEVER_C || undefined}>
                  {Number(l.temperature_c).toFixed(1)}°C
                </span>
              )}{" "}
              {l.symptoms}
            </div>
            <div className="kin-care-muted">
              {l.when}
              {l.given ? ` · gave ${l.given}` : ""}
              {l.note ? ` · ${l.note}` : ""}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Delete this entry" disabled={pending} onClick={async () => (await confirm({ title: "Delete this entry?", confirmLabel: "Delete", danger: true })) && run(() => deleteIllnessLogAction(l.id, memberId))}>
            <Icon name="trash" size="1rem" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── growth ───────────────────────────────────────────────────────────────────

export type GrowthPoint = { date: string; value: number };

/** Weight or length against the WHO 3rd, 50th and 97th percentile lines,
 * for a child under five. */
export function GrowthPanel({ memberId, firstName, dob, sex, weights, lengths }: { memberId: string; firstName: string; dob: string; sex: Sex | null; weights: GrowthPoint[]; lengths: GrowthPoint[] }) {
  const { pending, run } = useAct();
  if (!sex) {
    return (
      <div className="kin-care-growth">
        <div className="kin-eyebrow">GROWTH</div>
        <p className="kin-care-empty">The WHO growth charts are different for girls and boys. Which is {firstName}?</p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} disabled={pending} onClick={() => run(() => setMemberSexAction(memberId, "female"))}>
            Girl
          </button>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} disabled={pending} onClick={() => run(() => setMemberSexAction(memberId, "male"))}>
            Boy
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="kin-care-growth">
      <div className="kin-eyebrow">GROWTH · WHO STANDARD</div>
      <GrowthChart title="Weight" unit="kg" kind="weight" dob={dob} sex={sex} points={weights} firstName={firstName} />
      <GrowthChart title="Length / height" unit="cm" kind="length" dob={dob} sex={sex} points={lengths} firstName={firstName} />
    </div>
  );
}

function GrowthChart({ title, unit, kind, dob, sex, points, firstName }: { title: string; unit: string; kind: "weight" | "length"; dob: string; sex: Sex; points: GrowthPoint[]; firstName: string }) {
  const placed = points.map((p) => ({ ...p, months: ageInMonths(dob, p.date) })).filter((p) => p.months >= 0 && p.months <= 60);
  const lastMonth = Math.min(60, Math.max(12, Math.ceil((placed.at(-1)?.months ?? 0) + 3)));
  const lines = [-1.881, 0, 1.881].map((z) => Array.from({ length: lastMonth + 1 }, (_, m) => ({ m, v: valueAtPercentile(kind, m, sex, z) ?? 0 })));
  const vmax = Math.max(...lines[2].map((p) => p.v), ...placed.map((p) => p.value)) * 1.04;
  const vmin = Math.min(...lines[0].map((p) => p.v), ...placed.map((p) => p.value)) * 0.96;
  const W = 320, H = 150;
  const x = (m: number) => (m / lastMonth) * W;
  const y = (v: number) => H - ((v - vmin) / (vmax - vmin)) * H;
  const latest = placed.at(-1);
  const pct = latest ? growthPercentile(kind, latest.value, latest.months, sex) : null;
  return (
    <div className="kin-care-chart">
      <div className="kin-care-chart-head">
        <span>{title}</span>
        <span className="kin-care-muted">
          {latest && pct !== null ? `${latest.value} ${unit} · ${percentileLabel(pct)} percentile` : `No ${kind} recorded yet`}
        </span>
      </div>
      <svg viewBox={`-6 -6 ${W + 12} ${H + 22}`} role="img" aria-label={`${firstName}'s ${title.toLowerCase()} against the WHO 3rd, 50th and 97th percentiles`}>
        {lines.map((line, i) => (
          <polyline key={i} fill="none" stroke="currentColor" strokeOpacity={i === 1 ? 0.45 : 0.2} strokeWidth={i === 1 ? 1.5 : 1} strokeDasharray={i === 1 ? undefined : "4 4"} points={line.map((p) => `${x(p.m)},${y(p.v)}`).join(" ")} />
        ))}
        {placed.length > 1 && <polyline fill="none" stroke="var(--color-accent)" strokeWidth={2} points={placed.map((p) => `${x(p.months)},${y(p.value)}`).join(" ")} />}
        {placed.map((p) => (
          <circle key={p.date} cx={x(p.months)} cy={y(p.value)} r={3.5} fill="var(--color-accent)" />
        ))}
        {[0, Math.round(lastMonth / 2), lastMonth].map((m) => (
          <text key={m} x={x(m)} y={H + 16} fontSize="10" fill="currentColor" fillOpacity={0.55} textAnchor={m === 0 ? "start" : m === lastMonth ? "end" : "middle"}>
            {m === 0 ? "birth" : `${m} mo`}
          </text>
        ))}
      </svg>
      <div className="kin-care-muted" style={{ fontSize: "0.75rem" }}>
        Middle line: the 50th percentile. Dashed: the 3rd and 97th. Most healthy children stay between them.
      </div>
    </div>
  );
}

const GUIDE_TAG: Record<GuideDose["status"], string> = { done: "Done", due: "Due", overdue: "Past due", upcoming: "Later" };

/** A child's vaccine guide (lib/vaccine-schedule.ts), worked out on the
 * server against the vaccinations this viewer can see. "Mark as given" is on
 * each vaccine's first dose not yet recorded: recorded doses count in date
 * order, so marking a later one first would tick the wrong one. */
export function VaccineGuidePanel({ memberId, firstName, guide, today, role }: { memberId: string; firstName: string; guide: (GuideDose & { dueWords: string; givenWords: string | null })[]; today: string; role: string }) {
  const [showLater, setShowLater] = useState(false);
  const firstOpen = new Set<string>();
  const seen = new Set<string>();
  for (const d of guide) {
    if (d.status !== "done" && !seen.has(d.vaccine.name)) firstOpen.add(d.key);
    if (d.status !== "done") seen.add(d.vaccine.name);
  }
  const now = guide.filter((d) => d.status !== "upcoming");
  const later = guide.filter((d) => d.status === "upcoming");
  return (
    <div>
      <p className="kin-care-muted" style={{ margin: "0 0 0.75rem" }}>
        A guide to the usual Philippine schedule (DOH and the Philippine Pediatric Society), not medical advice. {firstName}&apos;s paediatrician decides
        what and when. Flu shots are yearly from 6 months. Vaccinations recorded under Conditions count here.
      </p>
      {now.map((d) => (
        <GuideRow key={d.key} d={d} memberId={memberId} canMark={isGrownUp(role) && firstOpen.has(d.key)} today={today} role={role} />
      ))}
      {now.length === 0 && <p className="kin-care-empty">Nothing due yet.</p>}
      {later.length > 0 && (
        <>
          <button type="button" className="kin-care-link" style={{ margin: "0.75rem 0" }} onClick={() => setShowLater(!showLater)}>
            {showLater ? "Hide what comes later" : `Coming later (${later.length})`}
          </button>
          {showLater && later.map((d) => <GuideRow key={d.key} d={d} memberId={memberId} canMark={isGrownUp(role) && firstOpen.has(d.key)} today={today} role={role} />)}
        </>
      )}
    </div>
  );
}

function GuideRow({ d, memberId, canMark, today, role }: { d: GuideDose & { dueWords: string; givenWords: string | null }; memberId: string; canMark: boolean; today: string; role: string }) {
  const { pending, run } = useAct();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [visibility, setVisibility] = useState("family");
  return (
    <div className="kin-care-row" data-status={d.status}>
      <div style={{ flex: 1 }}>
        <div className="kin-care-row-title">
          {doseName(d)}
          <span className="kin-care-muted"> · {d.vaccine.what}</span>
        </div>
        <div className="kin-care-muted">
          {d.status === "done" ? `Given ${d.givenWords}` : `${d.label} · ${d.dueWords}`}
          {d.vaccine.source === "PPS" ? " · PPS recommended" : " · DOH (free at health centres)"}
        </div>
        {canMark && !open && (d.status === "due" || d.status === "overdue") && (
          <button type="button" className="kin-care-link" onClick={() => setOpen(true)}>
            Mark as given
          </button>
        )}
        {canMark && !open && d.status === "upcoming" && (
          <button type="button" className="kin-care-link" onClick={() => setOpen(true)}>
            Given early? Mark it
          </button>
        )}
        {open && (
          <form
            className="kin-care-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const r = await markVaccineGivenAction({ memberId, vaccine: d.vaccine.name, n: d.n, date, visibility });
                if (!r.error) setOpen(false);
                return r;
              }, "Recorded");
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <label className="kin-care-label" style={{ minWidth: "8rem" }}>
                Given on
                <input className="input" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label className="kin-care-label" style={{ minWidth: "8rem" }}>
                Who can see it
                <VisibilitySelect role={role} value={visibility} onChange={setVisibility} />
              </label>
            </div>
            <p className="kin-care-muted" style={{ margin: 0 }}>
              Recorded under {d.vaccine.name} in Conditions. If {d.vaccine.name} is already there, who can see it stays as it is.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={pending}>
                Save
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
      <span className="kin-care-guide-tag" data-status={d.status}>
        {GUIDE_TAG[d.status]}
      </span>
    </div>
  );
}
