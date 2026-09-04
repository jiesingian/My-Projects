"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  payBillAction,
  contributeToGoalAction,
  confirmTransactionAction,
  deleteTransactionAction,
  updateAssetValueAction,
  updateLiabilityBalanceAction,
  deleteAssetAction,
  deleteLiabilityAction,
  deleteBillAction,
  deleteGoalAction,
  archiveAccountAction,
  postHubExpenseAction,
} from "@/lib/actions/wealth";
import { formatCurrency } from "@/lib/format";

export type PickableAccount = {
  id: string;
  name: string;
  institution?: string | null;
  linked_app_url: string | null;
  balance: number;
  is_joint: boolean;
};

/** Kin starts the payment, the member's own banking app finishes it, then
 * they come back and confirm — so nothing is counted as moved until it
 * really has. */
function useMoneyAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<{ error: string | null; appUrl?: string | null }>, onDone?: () => void) {
    startTransition(async () => {
      const res = await fn();
      setError(res.error);
      if (res.error) return;
      if (res.appUrl) window.open(res.appUrl, "_blank", "noopener,noreferrer");
      onDone?.();
      router.refresh();
    });
  }

  return { error, pending, run };
}

function AccountSelect({
  accounts,
  value,
  onChange,
  currency,
}: {
  accounts: PickableAccount[];
  value: string;
  onChange: (v: string) => void;
  currency: string;
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ minHeight: 42 }}>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {formatCurrency(a.balance, currency)}
        </option>
      ))}
    </select>
  );
}

function ViaAppToggle({ checked, onChange, account }: { checked: boolean; onChange: (v: boolean) => void; account?: PickableAccount }) {
  if (!account?.linked_app_url) return null;
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-neutral-700)", margin: "2px 0 10px" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Open {account.name} to pay, then confirm here
    </label>
  );
}

function Err({ message }: { message: string | null }) {
  if (!message) return null;
  return <p style={{ color: "var(--color-accent-700)", fontSize: 13.5, margin: "0 0 8px" }}>{message}</p>;
}

export function PayBillControl({ billId, amount, accounts, currency }: { billId: string; amount: number; accounts: PickableAccount[]; currency: string }) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [payAmount, setPayAmount] = useState(amount);
  const [viaApp, setViaApp] = useState(true);
  const { error, pending, run } = useMoneyAction();
  const account = accounts.find((a) => a.id === accountId);

  if (accounts.length === 0) {
    return <span style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>Add an account first</span>;
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ minHeight: 32, fontSize: 13, padding: "0 10px", marginTop: 6 }} onClick={() => setOpen(true)}>
        SETTLE
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-divider)", textAlign: "left" }}>
      <Err message={error} />
      <div className="field" style={{ marginBottom: 8 }}>
        <label>PAY FROM</label>
        <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label>AMOUNT (₱)</label>
        <input className="input" type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} style={{ minHeight: 42 }} />
      </div>
      <ViaAppToggle checked={viaApp} onChange={setViaApp} account={account} />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: 40, fontSize: 13.5 }}
          onClick={() => run(() => payBillAction({ billId, accountId, amount: payAmount, viaApp: viaApp && !!account?.linked_app_url }), () => setOpen(false))}
        >
          {pending ? "…" : viaApp && account?.linked_app_url ? "OPEN APP & LOG" : "MARK PAID"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 40, fontSize: 13.5 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

export function GoalContributeControl({ goalId, accounts, currency }: { goalId: string; accounts: PickableAccount[]; currency: string }) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(0);
  const [viaApp, setViaApp] = useState(true);
  const { error, pending, run } = useMoneyAction();
  const account = accounts.find((a) => a.id === accountId);

  if (accounts.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 38, fontSize: 13, marginTop: 10 }} onClick={() => setOpen(true)}>
        + PUT MONEY IN
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--color-divider)" }}>
      <Err message={error} />
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label>FROM</label>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
        </div>
        <div className="field" style={{ width: 110, margin: 0 }}>
          <label>AMOUNT</label>
          <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ minHeight: 42 }} />
        </div>
      </div>
      <ViaAppToggle checked={viaApp} onChange={setViaApp} account={account} />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: 40, fontSize: 13.5 }}
          onClick={() => run(() => contributeToGoalAction({ goalId, accountId, amount, viaApp: viaApp && !!account?.linked_app_url }), () => setOpen(false))}
        >
          {pending ? "…" : "ADD TO GOAL"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 40, fontSize: 13.5 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

/** Drop-in for any hub that produces real spend — a grocery run, a checkup,
 * a trip — so the money leaves an account instead of only being remembered
 * as an activity. */
export function LogSpendControl({
  accounts,
  currency,
  particulars,
  category,
  sourceTable,
  sourceId,
  suggested,
  label = "LOG SPEND",
}: {
  accounts: PickableAccount[];
  currency: string;
  particulars: string;
  category: string;
  sourceTable: "bills" | "trips" | "buy_items" | "health_appointments";
  sourceId: string | null;
  suggested?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(suggested ?? 0);
  const { error, pending, run } = useMoneyAction();

  if (accounts.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ minHeight: 32, fontSize: 12.5, padding: "0 10px" }} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--color-divider)", width: "100%" }}>
      <Err message={error} />
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label>PAID FROM</label>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
        </div>
        <div className="field" style={{ width: 110, margin: 0 }}>
          <label>AMOUNT</label>
          <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ minHeight: 42 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: 38, fontSize: 13 }}
          onClick={() => run(() => postHubExpenseAction({ accountId, amount, particulars, category, sourceTable, sourceId }), () => setOpen(false))}
        >
          {pending ? "…" : "RECORD IT"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 38, fontSize: 13 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

export function PendingEntryActions({ transactionId }: { transactionId: string }) {
  const { error, pending, run } = useMoneyAction();
  return (
    <div style={{ marginTop: 8 }}>
      <Err message={error} />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: 36, fontSize: 13 }}
          onClick={() => run(() => confirmTransactionAction(transactionId))}
        >
          {pending ? "…" : "IT WENT THROUGH"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          style={{ flex: 1, minHeight: 36, fontSize: 13 }}
          onClick={() => run(() => deleteTransactionAction(transactionId))}
        >
          DISCARD
        </button>
      </div>
    </div>
  );
}

export function DeleteEntryButton({ transactionId }: { transactionId: string }) {
  const { pending, run } = useMoneyAction();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={pending}
      style={{ minHeight: 30, fontSize: 12.5, padding: "0 9px" }}
      onClick={() => {
        if (!window.confirm("Remove this entry? Balances will be recalculated without it.")) return;
        run(() => deleteTransactionAction(transactionId));
      }}
    >
      {pending ? "…" : "REMOVE"}
    </button>
  );
}

export function ValueUpdateControl({ id, current, kind }: { id: string; current: number; kind: "asset" | "liability" }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const { pending, run } = useMoneyAction();

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ minHeight: 30, fontSize: 12.5, padding: "0 9px" }} onClick={() => setOpen(true)}>
        UPDATE
      </button>
    );
  }

  return (
    <span style={{ display: "flex", gap: 6 }}>
      <input className="input" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ minHeight: 32, width: 110, fontSize: 13.5 }} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        style={{ minHeight: 32, fontSize: 12.5, padding: "0 9px" }}
        onClick={() =>
          run(() => (kind === "asset" ? updateAssetValueAction(id, value) : updateLiabilityBalanceAction(id, value)), () => setOpen(false))
        }
      >
        {pending ? "…" : "SAVE"}
      </button>
    </span>
  );
}

const DELETERS = {
  asset: deleteAssetAction,
  liability: deleteLiabilityAction,
  bill: deleteBillAction,
  goal: deleteGoalAction,
  account: archiveAccountAction,
} as const;

export function RemoveButton({ id, kind, label }: { id: string; kind: keyof typeof DELETERS; label: string }) {
  const { pending, run } = useMoneyAction();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={pending}
      style={{ minHeight: 30, fontSize: 12.5, padding: "0 9px", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
      onClick={() => {
        if (!window.confirm(`${label}?`)) return;
        run(() => DELETERS[kind](id));
      }}
    >
      {pending ? "…" : kind === "account" ? "ARCHIVE" : "REMOVE"}
    </button>
  );
}
