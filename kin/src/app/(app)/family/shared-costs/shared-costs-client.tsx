"use client";

import { useActionState, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Blueprint } from "@/components/ui";
import { SubmitButton, ErrorText } from "@/components/form";
import { AmountInput } from "@/components/amount-input";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";
import { addPotEntryAction, createSharedPotAction, deletePotAction, deletePotEntryAction, setPotShareAction } from "@/lib/actions/shared-costs";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = { error: null };
const label = { display: "block", fontSize: "0.71875rem", color: "var(--color-neutral-600)", marginBottom: "0.1875rem", marginTop: "0.5rem" } as const;
const field = { minHeight: "2.5rem", fontSize: "0.8125rem" } as const;
const small = { minHeight: "2.25rem", fontSize: "0.8125rem", padding: "0 0.75rem" } as const;
const two = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" } as const;

export function NewPotForm({ linked }: { linked: { id: string; name: string }[] }) {
  const uid = useId();
  const [state, formAction] = useActionState(createSharedPotAction, initialState);
  return (
    <Blueprint style={{ padding: "0.875rem" }}>
      <form action={formAction}>
        <ErrorText message={state.error} />
        <label htmlFor={`${uid}-title`} style={label}>What it&apos;s for</label>
        <input id={`${uid}-title`} name="title" className="input" required maxLength={120} placeholder="Grandma's medicines and check-ups" style={field} />
        <label htmlFor={`${uid}-note`} style={label}>Note (optional)</label>
        <input id={`${uid}-note`} name="note" className="input" maxLength={500} placeholder="Maintenance, check-ups, the caregiver" style={field} />
        <fieldset style={{ border: 0, padding: 0, margin: "0.5rem 0 0" }}>
          <legend style={{ ...label, marginTop: 0 }}>Share with</legend>
          {linked.map((f) => (
            <label key={f.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", minHeight: "2.25rem" }}>
              <input type="checkbox" name="families" value={f.id} defaultChecked={linked.length === 1} />
              {f.name}
            </label>
          ))}
        </fieldset>
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.375rem 0 0.625rem" }}>
          Shares start equal; change them in the pot. Every household chosen must also be linked with each other.
        </p>
        <SubmitButton style={{ minHeight: "2.625rem", fontSize: "0.84375rem" }}>Start the pot</SubmitButton>
      </form>
    </Blueprint>
  );
}

export function AddEntryForm({ potId, today, others }: { potId: string; today: string; others: { familyId: string; name: string }[] }) {
  const [open, setOpen] = useState<null | "cost" | "payment">(null);
  const router = useRouter();
  const uid = useId();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await addPotEntryAction(potId, prev, fd);
    if (!r.error) {
      setOpen(null);
      router.refresh();
    }
    return r;
  }, initialState);

  if (!open) {
    return (
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <button type="button" className="btn btn-primary" style={{ ...small, flex: 1, gap: "0.25rem" }} onClick={() => setOpen("cost")}>
          <Icon name="plus" size={13} /> We paid a cost
        </button>
        <button type="button" className="btn btn-secondary" style={{ ...small, flex: 1 }} onClick={() => setOpen("payment")}>
          We paid them back
        </button>
      </div>
    );
  }
  return (
    <Blueprint style={{ padding: "0.875rem", marginBottom: "0.75rem" }}>
      <form action={formAction}>
        <input type="hidden" name="kind" value={open} />
        <ErrorText message={state.error} />
        <div style={two}>
          <div>
            <label htmlFor={`${uid}-amount`} style={label}>Amount</label>
            <AmountInput id={`${uid}-amount`} name="amount" required style={field} />
          </div>
          <div>
            <label htmlFor={`${uid}-date`} style={label}>When</label>
            <DateInput id={`${uid}-date`} name="spent_on" defaultValue={today} className="input" style={field} />
          </div>
        </div>
        {open === "payment" && (
          <>
            <label htmlFor={`${uid}-to`} style={label}>Paid to</label>
            <select id={`${uid}-to`} name="to_family_id" className="input" required defaultValue={others.length === 1 ? others[0].familyId : ""} style={field}>
              {others.length > 1 && <option value="">Choose a household</option>}
              {others.map((o) => (
                <option key={o.familyId} value={o.familyId}>
                  {o.name}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor={`${uid}-what`} style={label}>{open === "cost" ? "What for" : "Note (optional)"}</label>
        <input id={`${uid}-what`} name="description" className="input" maxLength={200} required={open === "cost"} placeholder={open === "cost" ? "Maintenance, October" : "Bank transfer"} style={field} />
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <SubmitButton style={{ ...small, flex: 1 }}>{open === "cost" ? "Add cost" : "Record payment"}</SubmitButton>
          <button type="button" className="btn btn-secondary" style={{ ...small, flex: 1 }} onClick={() => setOpen(null)}>
            Cancel
          </button>
        </div>
      </form>
    </Blueprint>
  );
}

export function RemoveEntryButton({ potId, entryId, what }: { potId: string; entryId: string; what: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        aria-label={`Take back ${what}`}
        disabled={pending}
        style={{ minHeight: "2rem", padding: "0 0.5rem" }}
        onClick={async () => {
          if (!(await confirm({ title: `Take back ${what}?`, confirmLabel: "Take it back", danger: true }))) return;
          start(async () => {
            const r = await deletePotEntryAction(potId, entryId);
            setError(r.error);
            if (!r.error) router.refresh();
          });
        }}
      >
        <Icon name="trash" size={13} />
      </button>
      <ErrorText message={error} />
    </>
  );
}

export function ShareEditor({ potId, households }: { potId: string; households: { familyId: string; name: string; share: number }[] }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => Object.fromEntries(households.map((h) => [h.familyId, String(h.share)])));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ ...small, marginTop: "0.5rem" }} onClick={() => setOpen(true)}>
        Change shares
      </button>
    );
  }
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <ErrorText message={error} />
      <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0 0 0.375rem" }}>Parts, not percent: 1 and 1 is half each; 2 and 1 is two thirds and one third.</p>
      {households.map((h) => (
        <label key={h.familyId} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", marginBottom: "0.375rem" }}>
          <span style={{ flex: 1, minWidth: 0 }}>{h.name}</span>
          <input
            className="input"
            inputMode="decimal"
            aria-label={`${h.name}'s share`}
            value={values[h.familyId]}
            onChange={(e) => setValues((v) => ({ ...v, [h.familyId]: e.target.value }))}
            style={{ ...field, width: "5rem" }}
          />
        </label>
      ))}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ ...small, flex: 1 }}
          onClick={() =>
            start(async () => {
              for (const h of households) {
                const next = Number(values[h.familyId]);
                if (next === h.share) continue;
                const r = await setPotShareAction(potId, h.familyId, next);
                if (r.error) {
                  setError(r.error);
                  return;
                }
              }
              setOpen(false);
              router.refresh();
            })
          }
        >
          {pending ? "…" : "Save shares"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ ...small, flex: 1 }} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function DeletePotButton({ potId, title }: { potId: string; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ marginTop: "1.25rem" }}>
      <ErrorText message={error} />
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={pending}
        style={small}
        onClick={async () => {
          if (!(await confirm({ title: `Delete “${title}”?`, description: "It goes for every household in it.", confirmLabel: "Delete", danger: true }))) return;
          start(async () => {
            const r = await deletePotAction(potId);
            if (r?.error) setError(r.error);
          });
        }}
      >
        Delete this pot
      </button>
    </div>
  );
}
