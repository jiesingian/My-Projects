"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blueprint, Tag } from "@/components/ui";
import { SubmitButton, ErrorText } from "@/components/form";
import { AmountInput } from "@/components/amount-input";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";
import { ShareMessage } from "@/components/share-message";
import {
  addPaluwaganAction,
  addUtangAction,
  addUtangPaymentAction,
  deleteUtangAction,
  removeUtangPaymentAction,
  setUtangOptionsAction,
} from "@/lib/actions/utang";
import { FREQUENCY_LABEL, VISIBILITY_CHOICES, instalmentPlan, type PaluwaganFrequency } from "@/lib/utang";
import { formatCurrency } from "@/lib/format";
import type { UtangView } from "@/lib/queries/utang";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = { error: null };
const label = { display: "block", fontSize: "0.71875rem", color: "var(--color-neutral-600)", marginBottom: "0.1875rem", marginTop: "0.5rem" } as const;
const field = { minHeight: "2.5rem", fontSize: "0.8125rem" } as const;
const small = { minHeight: "2.25rem", fontSize: "0.8125rem", padding: "0 0.75rem" } as const;
const two = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" } as const;

function Visibility({ id }: { id: string }) {
  return (
    <>
      <label htmlFor={id} style={label}>Who sees it</label>
      <select id={id} name="visibility" className="input" defaultValue="household" style={field}>
        {VISIBILITY_CHOICES.map((v) => (
          <option key={v.value} value={v.value}>{v.label}</option>
        ))}
      </select>
    </>
  );
}

function Opener({ open, onToggle, text }: { open: boolean; onToggle: () => void; text: string }) {
  return (
    <button type="button" className="btn btn-secondary" aria-expanded={open} onClick={onToggle} style={{ ...small, gap: "0.25rem", marginBottom: "0.625rem" }}>
      <Icon name={open ? "x" : "plus"} size={13} /> {open ? "Cancel" : text}
    </button>
  );
}

export function AddUtangForm({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"lent" | "borrowed">("lent");
  const [inInstalments, setInInstalments] = useState(false);
  const router = useRouter();
  const uid = useId();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await addUtangAction(prev, fd);
    if (!r.error) {
      setOpen(false);
      router.refresh();
    }
    return r;
  }, initialState);

  if (!open) return <Opener open={false} onToggle={() => setOpen(true)} text="Record an IOU" />;
  return (
    <>
      <Opener open onToggle={() => setOpen(false)} text="" />
      <Blueprint style={{ padding: "0.875rem", marginBottom: "0.75rem" }}>
        <form action={formAction}>
          <ErrorText message={state.error} />
          <div role="radiogroup" aria-label="Lent or borrowed" style={{ display: "flex", gap: "0.375rem" }}>
            {(["lent", "borrowed"] as const).map((d) => (
              <label key={d} className={direction === d ? "btn btn-primary" : "btn btn-secondary"} style={{ ...small, flex: 1 }}>
                <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => setDirection(d)} style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} />
                {d === "lent" ? "We lent" : "We borrowed"}
              </label>
            ))}
          </div>
          <label htmlFor={`${uid}-who`} style={label}>{direction === "lent" ? "Lent to" : "Borrowed from"}</label>
          <input id={`${uid}-who`} className="input" name="person_name" required maxLength={120} placeholder="Aunt Baby" style={field} />
          <div style={two}>
            <span>
              <label htmlFor={`${uid}-amount`} style={label}>How much</label>
              <AmountInput id={`${uid}-amount`} name="amount" required style={field} />
            </span>
            <span>
              <label htmlFor={`${uid}-start`} style={label}>When</label>
              <DateInput id={`${uid}-start`} name="started_on" defaultValue={today} className="input" style={field} />
            </span>
          </div>
          <label style={{ display: "flex", gap: "0.375rem", alignItems: "center", fontSize: "0.8125rem", marginTop: "0.625rem" }}>
            <input type="checkbox" name="in_instalments" value="on" checked={inInstalments} onChange={(e) => setInInstalments(e.target.checked)} />
            <span>Paid back in instalments</span>
          </label>
          {inInstalments ? (
            <>
              <div style={two}>
                <span>
                  <label htmlFor={`${uid}-count`} style={label}>How many</label>
                  <input id={`${uid}-count`} className="input" type="number" name="instalments" required min={2} max={120} step={1} defaultValue={6} style={field} />
                </span>
                <span>
                  <label htmlFor={`${uid}-freq`} style={label}>How often</label>
                  <select id={`${uid}-freq`} name="instalment_frequency" className="input" defaultValue="monthly" style={field}>
                    {(Object.keys(FREQUENCY_LABEL) as PaluwaganFrequency[]).map((f) => (
                      <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
                    ))}
                  </select>
                </span>
              </div>
              <label htmlFor={`${uid}-first`} style={label}>First one due</label>
              <DateInput id={`${uid}-first`} name="first_due_on" required className="input" style={field} />
            </>
          ) : (
            <>
              <label htmlFor={`${uid}-due`} style={label}>To be paid back by (optional)</label>
              <DateInput id={`${uid}-due`} name="due_on" className="input" style={field} />
            </>
          )}
          <label htmlFor={`${uid}-note`} style={label}>Note (optional)</label>
          <input id={`${uid}-note`} className="input" name="note" maxLength={500} placeholder="For the hospital bill" style={field} />
          <Visibility id={`${uid}-vis`} />
          {direction === "lent" && (
            <label style={{ display: "flex", gap: "0.375rem", alignItems: "flex-start", fontSize: "0.8125rem", marginTop: "0.625rem" }}>
              <input type="checkbox" name="remind" value="on" style={{ marginTop: "0.1875rem" }} />
              <span>Prepare a gentle reminder I can send myself. Kin never messages anyone.</span>
            </label>
          )}
          <div style={{ marginTop: "0.75rem" }}>
            <SubmitButton style={small}>Save</SubmitButton>
          </div>
        </form>
      </Blueprint>
    </>
  );
}

export function UtangRow({ u, currency, today, reminder }: { u: UtangView; currency: string; today: string; reminder: string | null }) {
  const [paying, setPaying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const uid = useId();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await addUtangPaymentAction(prev, fd);
    if (!r.error) {
      setPaying(false);
      router.refresh();
    }
    return r;
  }, initialState);

  const run = (fn: () => Promise<ActionState>) => {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      router.refresh();
    });
  };
  const plan = u.instalments && u.instalmentFrequency && u.firstDueOn ? instalmentPlan(u.amount, u.instalments, u.instalmentFrequency, u.firstDueOn, u.paid, today) : null;
  const [showPlan, setShowPlan] = useState(false);
  // With instalments, past due as soon as one of them is; otherwise by the
  // "by" date.
  const overdue = !u.settled && (plan ? plan.some((i) => i.status === "overdue") : u.dueOn !== null && u.dueOn < today);
  const next = plan?.find((i) => i.status !== "paid") ?? null;
  const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

  return (
    <Blueprint style={{ padding: "0.8125rem", marginBottom: "0.5625rem", opacity: u.settled ? 0.75 : 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ font: "600 1rem/1.2 var(--font-heading)", display: "block" }}>
            {u.direction === "lent" ? `${u.personName} owes us` : `We owe ${u.personName}`}
          </span>
          <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
            {formatCurrency(u.amount, currency)} on {day(u.startedOn)}
            {plan && u.instalmentFrequency
              ? ` · ${u.instalments} × ${FREQUENCY_LABEL[u.instalmentFrequency].toLowerCase()}`
              : u.dueOn
                ? ` · by ${day(u.dueOn)}`
                : ""}
            {u.note ? ` · ${u.note}` : ""}
          </span>
          {plan && !u.settled && next && (
            <span style={{ display: "block", fontSize: "0.78125rem", marginTop: "0.125rem" }}>
              {plan.filter((i) => i.status === "paid").length} of {plan.length} paid · next {formatCurrency(next.amount, currency)} on {day(next.due)}
            </span>
          )}
        </span>
        <span style={{ textAlign: "right", flex: "none" }}>
          <span style={{ display: "block", fontFamily: "var(--font-numeric)", fontWeight: 600, color: u.settled ? "var(--color-accent-700)" : undefined }}>
            {u.settled ? "Settled" : formatCurrency(u.left, currency)}
          </span>
          {!u.settled && u.paid > 0 && <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>{formatCurrency(u.paid, currency)} paid</span>}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem", marginTop: "0.5rem" }}>
        {u.isPrivate && <Tag variant="outline">JUST ME</Tag>}
        {overdue && <Tag variant="accent">PAST DUE</Tag>}
        {!u.settled && (
          <button type="button" className="btn btn-secondary" style={{ ...small, minHeight: "1.875rem" }} onClick={() => setPaying((p) => !p)} aria-expanded={paying}>
            {paying ? "Cancel" : "Record a payment"}
          </button>
        )}
        {plan && (
          <button type="button" className="btn btn-ghost" style={{ ...small, minHeight: "1.875rem" }} onClick={() => setShowPlan((s) => !s)} aria-expanded={showPlan}>
            Instalments
          </button>
        )}
        {u.payments.length > 0 && (
          <button type="button" className="btn btn-ghost" style={{ ...small, minHeight: "1.875rem" }} onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
            {u.payments.length} payment{u.payments.length === 1 ? "" : "s"}
          </button>
        )}
        <span style={{ marginLeft: "auto", display: "flex", gap: "0.25rem" }}>
          {u.direction === "lent" && !u.settled && (
            <button type="button" className="btn btn-ghost" disabled={pending} style={{ ...small, minHeight: "1.875rem" }} onClick={() => run(() => setUtangOptionsAction(u.id, { remind: !u.remind }))}>
              {u.remind ? "No reminder" : "Prepare a reminder"}
            </button>
          )}
          {u.mine && (
            <button type="button" className="btn btn-ghost" disabled={pending} style={{ ...small, minHeight: "1.875rem" }} onClick={() => run(() => setUtangOptionsAction(u.id, { isPrivate: !u.isPrivate }))}>
              {u.isPrivate ? "Show grown-ups" : "Just me"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            style={{ ...small, minHeight: "1.875rem", color: "var(--color-neutral-700)" }}
            onClick={async () => {
              if (!(await confirm({ title: "Remove this IOU?", description: "Its payments go with it.", confirmLabel: "Remove" }))) return;
              run(() => deleteUtangAction(u.id));
            }}
          >
            Remove
          </button>
        </span>
      </div>
      {error && <div role="alert" style={{ fontSize: "0.75rem", color: "var(--cal-occasion-ink)", marginTop: "0.25rem" }}>{error}</div>}

      {paying && (
        <form action={formAction} style={{ marginTop: "0.5rem" }}>
          <input type="hidden" name="utang_id" value={u.id} />
          <ErrorText message={state.error} />
          <div style={two}>
            <span>
              <label htmlFor={`${uid}-pay`} style={label}>Paid ({formatCurrency(u.left, currency)} left)</label>
              <AmountInput id={`${uid}-pay`} name="amount" required style={field} />
            </span>
            <span>
              <label htmlFor={`${uid}-on`} style={label}>On</label>
              <DateInput id={`${uid}-on`} name="paid_on" defaultValue={today} className="input" style={field} />
            </span>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <SubmitButton style={small}>Save payment</SubmitButton>
          </div>
        </form>
      )}

      {showPlan && plan && (
        <ol aria-label="Instalments" style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }}>
          {plan.map((i) => (
            <li key={i.n} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", padding: "0.25rem 0" }}>
              <span style={{ width: "1.5rem", color: "var(--color-neutral-600)" }}>{i.n}.</span>
              <span>{day(i.due)}</span>
              {i.status === "overdue" && <Tag variant="accent">OVERDUE</Tag>}
              {i.status === "part" && <Tag variant="outline">PART PAID</Tag>}
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", color: i.status === "paid" ? "var(--color-accent-700)" : undefined }}>
                {i.status === "paid" ? "✓ " : ""}
                {formatCurrency(i.amount, currency)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {showHistory && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }}>
          {u.payments.map((p) => (
            <li key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", padding: "0.25rem 0" }}>
              <span>{day(p.paidOn)}</span>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)" }}>{formatCurrency(p.amount, currency)}</span>
              <button type="button" className="btn btn-ghost" aria-label="Remove this payment" disabled={pending} style={{ minHeight: "1.5rem", padding: "0 0.375rem", fontSize: "0.75rem" }} onClick={() => run(() => removeUtangPaymentAction(p.id))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {reminder && <ShareMessage text={reminder} title={`Reminder for ${u.personName}`} />}
    </Blueprint>
  );
}

export function AddPaluwaganForm({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const uid = useId();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await addPaluwaganAction(prev, fd);
    if (!r.error && r.id) router.push(`/wealth/paluwagan/${r.id}`);
    return r;
  }, initialState);

  if (!open) return <Opener open={false} onToggle={() => setOpen(true)} text="Add a savings circle" />;
  return (
    <>
      <Opener open onToggle={() => setOpen(false)} text="" />
      <Blueprint style={{ padding: "0.875rem", marginBottom: "0.75rem" }}>
        <form action={formAction}>
          <ErrorText message={state.error} />
          <label htmlFor={`${uid}-name`} style={{ ...label, marginTop: 0 }}>Name</label>
          <input id={`${uid}-name`} className="input" name="name" required maxLength={80} placeholder="Office savings circle" style={field} />
          <div style={two}>
            <span>
              <label htmlFor={`${uid}-hulog`} style={label}>Contribution per member, each round</label>
              <AmountInput id={`${uid}-hulog`} name="contribution" required style={field} />
            </span>
            <span>
              <label htmlFor={`${uid}-freq`} style={label}>How often</label>
              <select id={`${uid}-freq`} name="frequency" className="input" defaultValue="monthly" style={field}>
                {(Object.keys(FREQUENCY_LABEL) as PaluwaganFrequency[]).map((f) => (
                  <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
                ))}
              </select>
            </span>
          </div>
          <label htmlFor={`${uid}-start`} style={label}>First round</label>
          <DateInput id={`${uid}-start`} name="starts_on" defaultValue={today} className="input" style={field} required />
          <label htmlFor={`${uid}-members`} style={label}>The other members, one per line, in turn order</label>
          <textarea id={`${uid}-members`} className="input" name="members" rows={5} required placeholder={"Joy\nBen\nAunt Linda"} style={{ ...field, padding: "0.5rem 0.625rem" }} />
          <label htmlFor={`${uid}-us`} style={label}>Our turn (0 if we only keep the record)</label>
          <input id={`${uid}-us`} className="input" name="us_turn" type="number" min="0" max="100" defaultValue={1} style={field} />
          <Visibility id={`${uid}-vis`} />
          <label style={{ display: "flex", gap: "0.375rem", alignItems: "flex-start", fontSize: "0.8125rem", marginTop: "0.625rem" }}>
            <input type="checkbox" name="remind" value="on" style={{ marginTop: "0.1875rem" }} />
            <span>Prepare a gentle reminder for anyone whose contribution is not in. Kin never messages anyone.</span>
          </label>
          <div style={{ marginTop: "0.75rem" }}>
            <SubmitButton style={small}>Save</SubmitButton>
          </div>
        </form>
      </Blueprint>
    </>
  );
}
