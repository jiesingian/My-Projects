"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordMovementAction, transferAction } from "@/lib/actions/wealth";
import { EXPENSE_CATEGORIES, INCOME_SOURCES } from "@/lib/wealth";
import { formatCurrency } from "@/lib/format";
import { ErrorText } from "@/components/form";
import type { PickableAccount } from "@/components/money-actions";
import { DateInput } from "@/components/date-input";

const MODES = ["in", "out", "transfer"] as const;
type Mode = (typeof MODES)[number];
const MODE_LABELS: Record<Mode, string> = { in: "Money in", out: "Money out", transfer: "Transfer" };

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TransactForm({
  accounts,
  currency,
  defaultMode,
  assets,
  goals,
  defaultParticulars,
  defaultAmount,
}: {
  accounts: PickableAccount[];
  currency: string;
  defaultMode: string;
  assets: { id: string; name: string }[];
  goals: { id: string; name: string }[];
  /** Carried in from a chat message someone chose to record as money. A
   * starting point only: nothing moves until they press the button. */
  defaultParticulars?: string;
  defaultAmount?: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>((MODES as readonly string[]).includes(defaultMode) ? (defaultMode as Mode) : "in");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? "");
  const [amount, setAmount] = useState<number>(defaultAmount ?? 0);
  const [particulars, setParticulars] = useState(defaultParticulars ?? "");
  const [category, setCategory] = useState<string>(INCOME_SOURCES[0]);
  const [occurredOn, setOccurredOn] = useState(todayLocal());
  const [viaApp, setViaApp] = useState(true);
  // "assets:<id>" or "goals:<id>", or empty for the ordinary case where the
  // money is not tied to either.
  const [against, setAgainst] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const account = accounts.find((a) => a.id === accountId);
  const canUseApp = !!account?.linked_app_url;

  function switchMode(next: Mode) {
    setMode(next);
    setCategory(next === "in" ? INCOME_SOURCES[0] : EXPENSE_CATEGORIES[0]);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const occurredAt = new Date(`${occurredOn}T${new Date().toTimeString().slice(0, 8)}`).toISOString();
      const res =
        mode === "transfer"
          ? await transferAction({ fromAccountId: accountId, toAccountId, amount, note: particulars, occurredAt, viaApp: viaApp && canUseApp })
          : await recordMovementAction({
              accountId,
              direction: mode,
              amount,
              particulars,
              category,
              occurredAt,
              viaApp: viaApp && canUseApp,
              againstTable: against ? (against.split(":")[0] as "assets" | "goals") : null,
              againstId: against ? against.split(":")[1] : null,
            });

      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.appUrl) window.open(res.appUrl, "_blank", "noopener,noreferrer");
      router.push(`/wealth/accounts/${accountId}`);
      router.refresh();
    });
  }

  if (accounts.length === 0) {
    return <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>Add an account in Wealth first, then you can record money against it.</p>;
  }

  return (
    <div>
      <div className="seg" style={{ marginBottom: "1.125rem", marginTop: 0 }}>
        {MODES.map((m) => (
          <button key={m} type="button" data-active={mode === m} onClick={() => switchMode(m)}>
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <ErrorText message={error} />

      <Field label={mode === "transfer" ? "FROM ACCOUNT" : mode === "in" ? "INTO ACCOUNT" : "OUT OF ACCOUNT"}>
        <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ minHeight: "2.75rem" }}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {formatCurrency(a.balance, currency)}
            </option>
          ))}
        </select>
      </Field>

      {mode === "transfer" && (
        <Field label="To account">
          <select className="input" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} style={{ minHeight: "2.75rem" }}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatCurrency(a.balance, currency)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label="Amount (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ minHeight: "2.75rem" }} />
        </Field>
        <Field label="Date" style={{ flex: 1 }}>
          <DateInput className="input" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>

      {/* Which account the money moved through was always recorded. What it
          was *for* was not, unless a hub posted it -- so a payment on the car
          and a contribution to a savings goal both landed as anonymous
          expenses. Optional, because most payments are neither. */}
      {mode !== "transfer" && (assets.length > 0 || goals.length > 0) && (
        <Field label={mode === "in" ? "INCOME FROM (OPTIONAL)" : "AGAINST (OPTIONAL)"}>
          <select className="input" value={against} onChange={(e) => setAgainst(e.target.value)} style={{ minHeight: "2.75rem" }}>
            <option value="">Nothing in particular</option>
            {assets.length > 0 && (
              <optgroup label="Assets">
                {assets.map((a) => (
                  <option key={a.id} value={`assets:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            )}
            {goals.length > 0 && (
              <optgroup label="Goals">
                {goals.map((g) => (
                  <option key={g.id} value={`goals:${g.id}`}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
      )}

      {mode !== "transfer" && (
        <Field label={mode === "in" ? "SOURCE" : "CATEGORY"}>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: "2.75rem" }}>
            {(mode === "in" ? INCOME_SOURCES : EXPENSE_CATEGORIES).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Particulars">
        <input
          className="input"
          value={particulars}
          onChange={(e) => setParticulars(e.target.value)}
          placeholder={mode === "in" ? "October salary" : mode === "out" ? "Hardware for the gate" : "Moving savings across"}
          style={{ minHeight: "2.75rem" }}
        />
      </Field>

      {canUseApp && (
        <label style={{ display: "flex", alignItems: "center", gap: "0.5625rem", fontSize: "0.84375rem", color: "var(--color-neutral-700)", margin: "2px 0 16px" }}>
          <input type="checkbox" checked={viaApp} onChange={(e) => setViaApp(e.target.checked)} />
          Open {account?.institution ?? account?.name} to do it, then confirm here
        </label>
      )}

      <button type="button" className="btn btn-primary btn-block" disabled={pending} style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em" }} onClick={submit}>
        {pending ? "…" : viaApp && canUseApp ? "Open app & log it" : "Record it"}
      </button>

      {viaApp && canUseApp && (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>
          Kin holds this as pending and leaves your balance alone until you come back and confirm it went through.
        </p>
      )}
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
