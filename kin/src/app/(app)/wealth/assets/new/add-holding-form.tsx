"use client";

import { useCurrencySymbol } from "@/components/household-currency";
import { useActionState, useState } from "react";
import { addAssetAction, addLiabilityAction } from "@/lib/actions/wealth";
import Link from "next/link";
import { ASSET_ITEM_KINDS, ASSET_ITEM_KIND_HINTS, ASSET_ITEM_KIND_LABELS, ASSET_KINDS, ASSET_KIND_CHANGE_HINTS, ASSET_KIND_LABELS, LIABILITY_KINDS, LIABILITY_KIND_LABELS, LIABILITY_KIND_LABELS as LOAN_LABELS, loanKindFor, type AssetItemKind, type AssetKind } from "@/lib/wealth";
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
  // Still being paid off (Jonathan, 26 October): the loan goes in with the
  // asset, linked to it, so one entry carries both sides.
  const [onLoan, setOnLoan] = useState(false);
  // A vehicle starts at -10% a year (Jonathan, 26 October): a car loses
  // about that, and a blank box read as "keeps its value". Typed over, the
  // typed figure stays whatever kind is picked after.
  const [change, setChange] = useState("");
  const [changeTyped, setChangeTyped] = useState(false);
  const pickKind = (k: string) => {
    setKind(k);
    if (!changeTyped) setChange(k === "vehicle" ? "-10" : "");
  };
  const isPlace = kind === "property";
  // Rows left wholly blank are dropped; a half-filled one is sent and named in the error.
  const filled = items.filter((i) => i.name.trim() || i.cost.trim());
  const update = (key: number, patch: Partial<ItemRow>) => setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={formAction}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <input type="hidden" name="items" value={JSON.stringify(filled.map(({ key: _key, ...rest }) => rest))} />
      <input type="hidden" name="loan_on" value={onLoan ? "on" : ""} />
      <ErrorText message={state.error} />
      <Field label="What is it">
        <input className="input" name="name" required placeholder="House in San Juan" style={{ minHeight: "2.75rem" }} />
      </Field>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "-0.25rem 0 0.875rem" }}>
        Something the household owns and could sell. A bank, e-wallet, cash or investment account is added on the <Link href="/wealth?seg=accounts">Accounts tab</Link> and counts toward net worth on its own; a savings goal is added with + Goal.
      </p>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Kind" style={{ flex: 1 }}>
          <select className="input" name="kind" value={kind} onChange={(e) => pickKind(e.target.value)} style={{ minHeight: "2.75rem" }}>
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
          <input
            className="input"
            type="number"
            step="0.1"
            min="-50"
            max="50"
            name="annual_change_pct"
            value={change}
            onChange={(e) => {
              setChange(e.target.value);
              setChangeTyped(true);
            }}
            placeholder={ASSET_KIND_CHANGE_HINTS[kind as AssetKind] ?? "Leave blank"}
            style={{ minHeight: "2.75rem" }}
          />
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

      {/* The loan it was bought on. A house with a mortgage is owned at its
          full value and owed at what is left: A&L shows the difference as
          what is truly yours, and each payment recorded against the loan
          splits into interest and what pays it down. */}
      <div style={{ margin: "0.25rem 0 1rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", font: "600 0.9375rem/1.2 var(--font-heading)", cursor: "pointer" }}>
          <input type="checkbox" checked={onLoan} onChange={(e) => setOnLoan(e.target.checked)} />
          Still being paid off
        </label>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0.25rem 0 0.625rem" }}>
          {onLoan
            ? `The ${LOAN_LABELS[loanKindFor(kind)].toLowerCase()} goes in with it, linked: the ${isPlace ? "place" : "asset"} counts at its full value above, the loan at what is still owed, and what is yours is the difference.`
            : "Tick this if a loan was taken for it. The asset is worth its full value either way; the loan is what lowers your net worth."}
        </p>
        {onLoan && <LoanFields prefix="loan_" showName />}
      </div>

      <JointToggle isJoint={isJoint} setIsJoint={setIsJoint} />
      <Field label="Note">
        <input className="input" name="note" placeholder="Title under both names" style={{ minHeight: "2.75rem" }} />
      </Field>
      <SubmitButton style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }}>{onLoan ? "Save asset and loan" : "Save asset"}</SubmitButton>
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
      <LoanFields prefix="" />
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

/** A loan's lender, payment, schedule and terms -- the same fields on the
 * liability form and under "Still being paid off" on the asset form (there
 * with a `loan_` prefix and a name, since the asset's name is taken). The
 * schedule puts each payment on the calendar; the terms (20261026170000)
 * let A&L check the balance against the bank's amortisation table and show
 * the interest paid so far. All optional but the balance. */
function LoanFields({ prefix, showName = false }: { prefix: "" | "loan_"; showName?: boolean }) {
  const sym = useCurrencySymbol();
  const h = { minHeight: "2.75rem" } as const;
  return (
    <>
      {showName && (
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Field label="The loan" style={{ flex: 1 }}>
            <input className="input" name={`${prefix}name`} placeholder="Pag-IBIG housing loan" style={h} />
          </Field>
          <Field label={`Still owed (${sym})`} style={{ flex: 1 }}>
            <input className="input" type="number" step="0.01" min="0" inputMode="decimal" name={`${prefix}balance`} style={h} />
          </Field>
        </div>
      )}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Lender" style={{ flex: 1 }}>
          <input className="input" name={`${prefix}lender`} placeholder="BPI" style={h} />
        </Field>
        <Field label={`Per month (${sym})`} style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" inputMode="decimal" name={`${prefix}monthly_payment`} style={h} />
        </Field>
      </div>
      {/* The schedule: each payment then shows on the calendar, with its
          amount, on its own day until the last one. */}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Next payment" style={{ flex: 1 }}>
          <DateInput className="input" name={`${prefix}next_payment_date`} style={h} />
        </Field>
        <Field label="Payments left" style={{ flex: 1 }}>
          <input className="input" type="number" step="1" min="1" max="1200" inputMode="numeric" name={`${prefix}payments_remaining`} placeholder="e.g. 120" style={h} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Interest rate (% a year)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.001" min="0" max="100" inputMode="decimal" name={`${prefix}interest_rate`} placeholder="e.g. 6.5" style={h} />
        </Field>
        <Field label="Rate fixed until" style={{ flex: 1 }}>
          <DateInput className="input" name={`${prefix}rate_fixed_until`} style={h} />
        </Field>
      </div>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "-0.25rem 0 0.625rem" }}>
        Halfway through the loan? Add what was borrowed and the term off the bank&apos;s offer: Kin then shows what the balance should be by now, the interest paid so far, and the whole loan&apos;s cost.
      </p>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label={`Amount borrowed (${sym})`} style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" inputMode="decimal" name={`${prefix}original_amount`} style={h} />
        </Field>
        <Field label="Term (months)" style={{ flex: 1 }}>
          <input className="input" type="number" step="1" min="1" max="1200" inputMode="numeric" name={`${prefix}term_months`} placeholder="e.g. 240" style={h} />
        </Field>
      </div>
    </>
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
