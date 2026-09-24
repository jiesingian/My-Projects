"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  payBillAction,
  receiveIncomeAction,
  contributeToGoalAction,
  confirmTransactionAction,
  deleteTransactionAction,
  updateAssetValueAction,
  updateLiabilityBalanceAction,
  deleteAssetAction,
  deleteLiabilityAction,
  deleteBillAction,
  deleteIncomeScheduleAction,
  deleteGoalAction,
  archiveAccountAction,
  setAccountPrivacyAction,
  postHubExpenseAction,
} from "@/lib/actions/wealth";
import { formatCurrency } from "@/lib/format";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";

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
  id,
  accounts,
  value,
  onChange,
  currency,
}: {
  id?: string;
  accounts: PickableAccount[];
  value: string;
  onChange: (v: string) => void;
  currency: string;
}) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} style={{ minHeight: "2.625rem" }}>
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
    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "2px 0 10px" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      Open {account.name} to pay, then confirm here
    </label>
  );
}

function Err({ message }: { message: string | null }) {
  if (!message) return null;
  return <p style={{ color: "var(--color-accent-700)", fontSize: "0.84375rem", margin: "0 0 8px" }}>{message}</p>;
}

export function PayBillControl({ billId, amount, accounts, currency }: { billId: string; amount: number; accounts: PickableAccount[]; currency: string }) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [payAmount, setPayAmount] = useState(amount);
  const [viaApp, setViaApp] = useState(true);
  const { error, pending, run } = useMoneyAction();
  const account = accounts.find((a) => a.id === accountId);
  const uid = useId();

  if (accounts.length === 0) {
    return <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>Add an account first</span>;
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.625rem", marginTop: "0.375rem" }} onClick={() => setOpen(true)}>
        Settle
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.625rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", textAlign: "left" }}>
      <Err message={error} />
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`${uid}-account`}>Pay from</label>
        <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
      </div>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`${uid}-amount`}>Amount (₱)</label>
        <input id={`${uid}-amount`} aria-label="Amount (₱)" className="input" type="number" step="0.01" min="0" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} style={{ minHeight: "2.625rem" }} />
      </div>
      <ViaAppToggle checked={viaApp} onChange={setViaApp} account={account} />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
          onClick={() => run(() => payBillAction({ billId, accountId, amount: payAmount, viaApp: viaApp && !!account?.linked_app_url }), () => setOpen(false))}
        >
          {pending ? "…" : viaApp && account?.linked_app_url ? "Open app & log" : "Mark paid"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ReceiveIncomeControl({ scheduleId, amount, accounts, currency }: { scheduleId: string; amount: number; accounts: PickableAccount[]; currency: string }) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [receiveAmount, setReceiveAmount] = useState(amount);
  const [viaApp, setViaApp] = useState(true);
  const { error, pending, run } = useMoneyAction();
  const account = accounts.find((a) => a.id === accountId);
  const uid = useId();

  if (accounts.length === 0) {
    return <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>Add an account first</span>;
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.625rem", marginTop: "0.375rem" }} onClick={() => setOpen(true)}>
        Received
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.625rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", textAlign: "left" }}>
      <Err message={error} />
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`${uid}-account`}>Into</label>
        <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
      </div>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`${uid}-amount`}>Amount (₱)</label>
        <input id={`${uid}-amount`} aria-label="Amount (₱)" className="input" type="number" step="0.01" min="0" value={receiveAmount} onChange={(e) => setReceiveAmount(Number(e.target.value))} style={{ minHeight: "2.625rem" }} />
      </div>
      <ViaAppToggle checked={viaApp} onChange={setViaApp} account={account} />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
          onClick={() =>
            run(
              () => receiveIncomeAction({ scheduleId, accountId, amount: receiveAmount, viaApp: viaApp && !!account?.linked_app_url }),
              () => setOpen(false),
            )
          }
        >
          {pending ? "…" : viaApp && account?.linked_app_url ? "Open app & log" : "Mark received"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** `linkedAccountId` is the account the goal was set up to be saved in
 * (SAVED IN, on the add-goal form) -- until now written once and never read,
 * so every contribution defaulted to whichever account happened to sort
 * first regardless of which one the goal actually names. This is what makes
 * that link mean something: the picker opens on it when it's still a live
 * account, falling back to the first the same way it always did if the goal
 * has none or the linked one is gone (archived, or no longer visible to
 * this member). */
export function GoalContributeControl({
  goalId,
  accounts,
  currency,
  linkedAccountId,
}: {
  goalId: string;
  accounts: PickableAccount[];
  currency: string;
  linkedAccountId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const defaultAccountId = (linkedAccountId && accounts.some((a) => a.id === linkedAccountId) ? linkedAccountId : accounts[0]?.id) ?? "";
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [amount, setAmount] = useState(0);
  const [viaApp, setViaApp] = useState(true);
  const { error, pending, run } = useMoneyAction();
  const account = accounts.find((a) => a.id === accountId);
  const uid = useId();

  if (accounts.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.375rem", fontSize: "0.8125rem", marginTop: "0.625rem" }} onClick={() => setOpen(true)}>
        + PUT MONEY IN
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.75rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)" }}>
      <Err message={error} />
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor={`${uid}-account`}>From</label>
          <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
        </div>
        <div className="field" style={{ width: 110, margin: 0 }}>
          <label htmlFor={`${uid}-amount`}>Amount</label>
          <input id={`${uid}-amount`} aria-label="Amount" className="input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ minHeight: "2.625rem" }} />
        </div>
      </div>
      <ViaAppToggle checked={viaApp} onChange={setViaApp} account={account} />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
          onClick={() => run(() => contributeToGoalAction({ goalId, accountId, amount, viaApp: viaApp && !!account?.linked_app_url }), () => setOpen(false))}
        >
          {pending ? "…" : "Add to goal"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={() => setOpen(false)}>
          Cancel
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
  sourceTable: "bills" | "events" | "buy_items" | "health_appointments";
  sourceId: string | null;
  suggested?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(suggested ?? 0);
  const { error, pending, run } = useMoneyAction();
  const uid = useId();

  if (accounts.length === 0) return null;

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.625rem" }} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div style={{ marginTop: "0.625rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", width: "100%" }}>
      <Err message={error} />
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label htmlFor={`${uid}-account`}>Paid from</label>
          <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
        </div>
        <div className="field" style={{ width: 110, margin: 0 }}>
          <label htmlFor={`${uid}-amount`}>Amount</label>
          <input id={`${uid}-amount`} aria-label="Amount" className="input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ minHeight: "2.625rem" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.8125rem" }}
          onClick={() => run(() => postHubExpenseAction({ accountId, amount, particulars, category, sourceTable, sourceId }), () => setOpen(false))}
        >
          {pending ? "…" : "Record it"}
        </button>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.375rem", fontSize: "0.8125rem" }} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function PendingEntryActions({ transactionId }: { transactionId: string }) {
  const { error, pending, run } = useMoneyAction();
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <Err message={error} />
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1, minHeight: "2.25rem", fontSize: "0.8125rem" }}
          onClick={() => run(() => confirmTransactionAction(transactionId))}
        >
          {pending ? "…" : "It went through"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          style={{ flex: 1, minHeight: "2.25rem", fontSize: "0.8125rem" }}
          onClick={() => run(() => deleteTransactionAction(transactionId))}
        >
          Discard
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
      style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }}
      onClick={async () => {
        if (!(await confirm({ title: "Remove this entry?", description: "Balances will be recalculated without it.", confirmLabel: "Remove", danger: true }))) return;
        run(() => deleteTransactionAction(transactionId));
      }}
    >
      {pending ? "…" : "Remove"}
    </button>
  );
}

export function ValueUpdateControl({ id, current, kind }: { id: string; current: number; kind: "asset" | "liability" }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const { pending, run } = useMoneyAction();

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }} onClick={() => setOpen(true)}>
        Update
      </button>
    );
  }

  return (
    <span style={{ display: "flex", gap: "0.375rem" }}>
      <input className="input" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ minHeight: "2rem", width: "6.875rem", fontSize: "0.84375rem" }} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }}
        onClick={() =>
          run(() => (kind === "asset" ? updateAssetValueAction(id, value) : updateLiabilityBalanceAction(id, value)), () => setOpen(false))
        }
      >
        {pending ? "…" : "Save"}
      </button>
    </span>
  );
}

const DELETERS = {
  asset: deleteAssetAction,
  liability: deleteLiabilityAction,
  bill: deleteBillAction,
  income_schedule: deleteIncomeScheduleAction,
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
      style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
      onClick={async (e) => {
        // A no-op everywhere this isn't inside a link (every kind but
        // account, today) -- but the account row on the Accounts tab is a
        // link to that account's own page, and this is not part of
        // following it.
        e.preventDefault();
        e.stopPropagation();
        if (!(await confirm({ title: `${label}?`, confirmLabel: kind === "account" ? "Archive" : "Remove", danger: true }))) return;
        run(() => DELETERS[kind](id));
      }}
    >
      {pending ? "…" : kind === "account" ? "Archive" : "Remove"}
    </button>
  );
}

/** Whether this account is the owner's business alone or the household's to
 * see. Shown on every account so the state is never a guess; only the owner
 * of a personal one can move it. */
export function AccountPrivacyToggle({
  accountId,
  isPrivate,
  isJoint,
  canChange,
}: {
  accountId: string;
  isPrivate: boolean;
  isJoint: boolean;
  canChange: boolean;
}) {
  const { pending, run } = useMoneyAction();

  if (isJoint) {
    return (
      <span style={{ fontSize: "0.6875rem", color: "var(--color-neutral-600)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
        <Icon name="users" size={12} />
        Joint
      </span>
    );
  }

  const label = isPrivate ? "Private" : "Family";
  if (!canChange) {
    return (
      <span style={{ fontSize: "0.6875rem", color: "var(--color-neutral-600)", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
        <Icon name={isPrivate ? "keyRound" : "users"} size={12} />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        // The row is a link to the account; this is not part of following it.
        e.preventDefault();
        e.stopPropagation();
        run(() => setAccountPrivacyAction(accountId, !isPrivate));
      }}
      title={isPrivate ? "Only you can see this account. Tap to show the family." : "The family can see this account. Tap to keep it to yourself."}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.6875rem",
        padding: "0.125rem 0.5rem",
        borderRadius: 999,
        border: 0,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        background: isPrivate ? "color-mix(in srgb, var(--color-text) 8%, transparent)" : "color-mix(in srgb, var(--color-switch-on) 18%, transparent)",
        color: "var(--color-neutral-700)",
      }}
    >
      <Icon name={isPrivate ? "keyRound" : "users"} size={12} />
      {pending ? "…" : label}
    </button>
  );
}
