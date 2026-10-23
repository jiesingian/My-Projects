"use client";

import { useCurrencySymbol } from "@/components/household-currency";
import { useActionState, useState } from "react";
import { addAssetAction, addLiabilityAction } from "@/lib/actions/wealth";
import { ASSET_ITEM_KINDS, ASSET_ITEM_KIND_HINTS, ASSET_ITEM_KIND_LABELS, ASSET_KINDS, ASSET_KIND_LABELS, LIABILITY_KINDS, LIABILITY_KIND_LABELS, type AssetItemKind } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DateInput } from "@/components/date-input";

const initialState: ActionState = { error: null };

export function AddHoldingForm({ defaultKind, assets = [] }: { defaultKind: string; assets?: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<"asset" | "liability">(defaultKind === "liability" ? "liability" : "asset");

  return (
    <div>
      <div className="seg" style={{ marginBottom: "1.125rem", marginTop: 0 }}>
        <button type="button" data-active={mode === "asset"} onClick={() => setMode("asset")}>
          Asset
        </button>
        <button type="button" data-active={mode === "liability"} onClick={() => setMode("liability")}>
          Liability
        </button>
      </div>
      {mode === "asset" ? <AssetForm /> : <LiabilityForm assets={assets} />}
    </div>
  );
}

type ItemRow = { key: number; name: string; kind: AssetItemKind; cost: string; acquired_on: string };

function AssetForm() {
  const sym = useCurrencySymbol();
  const [state, formAction] = useActionState(addAssetAction, initialState);
  const [isJoint, setIsJoint] = useState(true);
  const [kind, setKind] = useState("property");
  const [items, setItems] = useState<ItemRow[]>([]);
  const isPlace = kind === "property";
  // Rows left wholly blank are dropped; a half-filled one is sent and named in the error.
  const filled = items.filter((i) => i.name.trim() || i.cost.trim());
  const update = (key: number, patch: Partial<ItemRow>) => setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={formAction}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <input type="hidden" name="items" value={JSON.stringify(filled.map(({ key: _key, ...rest }) => rest))} />
      <ErrorText message={state.error} />
      <Field label="What is it">
        <input className="input" name="name" required placeholder="House in San Juan" style={{ minHeight: "2.75rem" }} />
      </Field>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Kind" style={{ flex: 1 }}>
          <select className="input" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} style={{ minHeight: "2.75rem" }}>
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>
                {ASSET_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={isPlace ? `The place itself (${sym})` : `Value (${sym})`} style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="value" required style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Owned since" style={{ flex: 1 }}>
          <DateInput className="input" name="acquired_on" style={{ minHeight: "2.75rem" }} />
        </Field>
        <Field label="Changes a year (%)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.1" min="-50" max="50" name="annual_change_pct" placeholder={isPlace ? "5, or -2 if it loses" : "Leave blank"} style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>

      <div style={{ margin: "0.25rem 0 1rem" }}>
        <div style={{ font: "600 0.9375rem/1.2 var(--font-heading)" }}>{isPlace ? "What's in it" : "Breakdown"}</div>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.25rem 0 0.625rem" }}>
          Optional. Furniture, appliances, a renovation, dues: each with its price and when it was bought. They add to the value above, and each ages on its own.
        </p>
        {items.map((row) => (
          <div key={row.key} style={{ padding: "0.625rem 0", borderTop: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input className="input" aria-label="What it is" placeholder="Aircon, sala set…" value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} style={{ flex: 2, minHeight: "2.5rem" }} />
              <select className="input" aria-label="Kind" value={row.kind} onChange={(e) => update(row.key, { kind: e.target.value as AssetItemKind })} style={{ flex: 1.4, minHeight: "2.5rem" }}>
                {ASSET_ITEM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_ITEM_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "flex-start" }}>
              <input className="input" aria-label={`Price (${sym})`} placeholder={`Price (${sym})`} type="number" step="0.01" min="0" inputMode="decimal" value={row.cost} onChange={(e) => update(row.key, { cost: e.target.value })} style={{ flex: 1, minHeight: "2.5rem" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <DateInput className="input" aria-label="Bought on" value={row.acquired_on} onChange={(e) => update(row.key, { acquired_on: e.target.value })} style={{ width: "100%", minHeight: "2.5rem" }} />
              </div>
              <button type="button" className="btn btn-secondary" aria-label="Remove this row" onClick={() => setItems((rows) => rows.filter((r) => r.key !== row.key))} style={{ minHeight: "2.5rem", padding: "0 0.625rem" }}>
                ✕
              </button>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>{ASSET_ITEM_KIND_HINTS[row.kind]}</div>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => setItems((rows) => [...rows, { key: Date.now() + rows.length, name: "", kind: "appliance", cost: "", acquired_on: "" }])}
          style={{ minHeight: "2.5rem", fontSize: "0.8125rem" }}
        >
          + Add a thing in it
        </button>
      </div>

      <JointToggle isJoint={isJoint} setIsJoint={setIsJoint} />
      <Field label="Note">
        <input className="input" name="note" placeholder="Title under both names" style={{ minHeight: "2.75rem" }} />
      </Field>
      <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>Save asset</SubmitButton>
    </form>
  );
}

function LiabilityForm({ assets }: { assets: { id: string; name: string }[] }) {
  const sym = useCurrencySymbol();
  const [state, formAction] = useActionState(addLiabilityAction, initialState);
  const [isJoint, setIsJoint] = useState(true);

  return (
    <form action={formAction}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <ErrorText message={state.error} />
      <Field label="What is owed">
        <input className="input" name="name" required placeholder="Home loan" style={{ minHeight: "2.75rem" }} />
      </Field>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Kind" style={{ flex: 1 }}>
          <select className="input" name="kind" defaultValue="mortgage" style={{ minHeight: "2.75rem" }}>
            {LIABILITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {LIABILITY_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Balance (${sym})`} style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="balance" required style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Lender" style={{ flex: 1 }}>
          <input className="input" name="lender" placeholder="BPI" style={{ minHeight: "2.75rem" }} />
        </Field>
        <Field label={`Per month (${sym})`} style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="monthly_payment" style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      {/* The schedule: each payment then shows on the calendar, with its
          amount, on its own day until the last one. All optional. */}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Next payment" style={{ flex: 1 }}>
          <DateInput className="input" name="next_payment_date" style={{ minHeight: "2.75rem" }} />
        </Field>
        <Field label="Payments left" style={{ flex: 1 }}>
          <input className="input" type="number" step="1" min="1" max="1200" inputMode="numeric" name="payments_remaining" placeholder="e.g. 120" style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>
      <Field label="Interest rate (% a year)">
        <input className="input" type="number" step="0.001" min="0" max="100" inputMode="decimal" name="interest_rate" placeholder="e.g. 6.5" style={{ minHeight: "2.75rem" }} />
      </Field>
      {/* The house a housing loan is on, the car a car loan bought: A&L
          then shows what is truly yours in it -- its value less this. */}
      {assets.length > 0 && (
        <Field label="What it paid for (optional)">
          <select className="input" name="asset_id" defaultValue="" style={{ minHeight: "2.75rem" }}>
            <option value="">Nothing in particular</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <JointToggle isJoint={isJoint} setIsJoint={setIsJoint} />
      <Field label="Note">
        <input className="input" name="note" style={{ minHeight: "2.75rem" }} />
      </Field>
      <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>Save liability</SubmitButton>
    </form>
  );
}

function JointToggle({ isJoint, setIsJoint }: { isJoint: boolean; setIsJoint: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: "0.4375rem", marginBottom: "1rem" }}>
      <button type="button" className="chip" data-active={isJoint} onClick={() => setIsJoint(true)}>
        Household
      </button>
      <button type="button" className="chip" data-active={!isJoint} onClick={() => setIsJoint(false)}>
        Mine
      </button>
    </div>
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
