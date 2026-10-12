"use client";

import { FormSheet } from "@/components/form-sheet";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  payBillAction,
  receiveIncomeAction,
  contributeToGoalAction,
  confirmTransactionAction,
  deleteTransactionAction,
  updateAssetValueAction,
  addAssetItemAction,
  updateAssetItemAction,
  deleteAssetItemAction,
  updateLiabilityBalanceAction,
  updateLiabilityScheduleAction,
  deleteAssetAction,
  deleteLiabilityAction,
  deleteBillAction,
  deleteIncomeScheduleAction,
  deleteGoalAction,
  archiveAccountAction,
  restoreAccountAction,
  setIncludePrivateInTotalsAction,
  deleteAccountAction,
  setAccountPrivacyAction,
  postHubExpenseAction,
  deleteRemittanceAction,
} from "@/lib/actions/wealth";
import { formatCurrency, currencySymbol } from "@/lib/format";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";
import { AmountInput } from "@/components/amount-input";
import { DateInput } from "@/components/date-input";
import { ASSET_ITEM_KINDS, ASSET_ITEM_KIND_HINTS, ASSET_ITEM_KIND_LABELS, type AssetItemKind } from "@/lib/wealth";

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


  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.625rem", marginTop: "0.375rem" }} onClick={() => setOpen(true)}>
        Settle
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Settle">
        <div style={{ marginTop: "0.625rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", textAlign: "left" }}>
          <Err message={error} />
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-account`}>Pay from</label>
            <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
          </div>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-amount`}>Amount ({currencySymbol(currency)})</label>
            <AmountInput id={`${uid}-amount`} ariaLabel={`Amount (${currencySymbol(currency)})`} defaultValue={payAmount} onValueChange={setPayAmount} style={{ minHeight: "2.625rem" }} />
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
      </FormSheet>
    </>
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


  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.625rem", marginTop: "0.375rem" }} onClick={() => setOpen(true)}>
        Received
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Mark as received">
        <div style={{ marginTop: "0.625rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", textAlign: "left" }}>
          <Err message={error} />
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-account`}>Into</label>
            <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
          </div>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-amount`}>Amount ({currencySymbol(currency)})</label>
            <AmountInput id={`${uid}-amount`} ariaLabel={`Amount (${currencySymbol(currency)})`} defaultValue={receiveAmount} onValueChange={setReceiveAmount} style={{ minHeight: "2.625rem" }} />
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
      </FormSheet>
    </>
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


  return (
    <>
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.375rem", fontSize: "0.8125rem", marginTop: "0.625rem" }} onClick={() => setOpen(true)}>
        + PUT MONEY IN
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Put money in">
        <div style={{ marginTop: "0.75rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)" }}>
          <Err message={error} />
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`${uid}-account`}>From</label>
              <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
            </div>
            <div className="field" style={{ width: 110, margin: 0 }}>
              <label htmlFor={`${uid}-amount`}>Amount</label>
              <AmountInput id={`${uid}-amount`} ariaLabel="Amount" defaultValue={amount} onValueChange={setAmount} style={{ minHeight: "2.625rem" }} />
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
              {pending ? "…" : viaApp && account?.linked_app_url ? "Open app & log" : "Add to goal"}
            </button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </FormSheet>
    </>
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


  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.625rem" }} onClick={() => setOpen(true)}>
        {label}
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={label}>
        <div style={{ marginTop: "0.625rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", width: "100%" }}>
          <Err message={error} />
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`${uid}-account`}>Paid from</label>
              <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
            </div>
            <div className="field" style={{ width: 110, margin: 0 }}>
              <label htmlFor={`${uid}-amount`}>Amount</label>
              <AmountInput id={`${uid}-amount`} ariaLabel="Amount" defaultValue={amount} onValueChange={setAmount} style={{ minHeight: "2.625rem" }} />
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
      </FormSheet>
    </>
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

export function ValueUpdateControl({
  id,
  current,
  kind,
  yearlyChange,
}: {
  id: string;
  current: number;
  kind: "asset" | "liability";
  /** An asset's yearly change in %, null for none. */
  yearlyChange?: number | null;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [change, setChange] = useState(yearlyChange == null ? "" : String(yearlyChange));
  const { error, pending, run } = useMoneyAction();

  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }} onClick={() => setOpen(true)}>
        Update
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={kind === "asset" ? "Update value" : "Update balance"}>
        <span style={{ display: "flex", gap: "0.375rem", alignItems: "flex-end" }}>
          <AmountInput ariaLabel="New value" defaultValue={value} onValueChange={setValue} style={{ minHeight: "2rem", width: "6.875rem", fontSize: "0.84375rem" }} />
          {kind === "asset" && (
            <span className="field" style={{ margin: 0 }}>
              <label htmlFor={`${uid}-change`} style={{ fontSize: "0.75rem" }}>Changes a year (%)</label>
              <input id={`${uid}-change`} className="input" type="number" step="0.1" min="-50" max="50" inputMode="decimal" placeholder="None" value={change} onChange={(e) => setChange(e.target.value)} style={{ minHeight: "2rem", width: "6rem", fontSize: "0.84375rem" }} />
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }}
            onClick={() =>
              run(() => (kind === "asset" ? updateAssetValueAction(id, value, change) : updateLiabilityBalanceAction(id, value)), () => setOpen(false))
            }
          >
            {pending ? "…" : "Save"}
          </button>
        </span>
        {kind === "asset" && (
          <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.5rem 0 0" }}>
            The value of the asset itself as of today. A yearly change grows it from today on (minus if it loses value); a breakdown adds on top.
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
            {error}
          </p>
        )}
      </FormSheet>
    </>
  );
}

export type BreakdownItem = {
  id: string;
  name: string;
  kind: string;
  cost: number;
  acquired_on: string | null;
  value_now: number | null;
  /** What it is worth today, typed or worked out (assetWorth). */
  worth: number;
};

const monthYear = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" });

/** What an asset is made of: each thing with its price, when it was bought
 * and what it is worth now, and a form to add or change one. */
export function AssetBreakdownControl({ assetId, assetName, items, currency }: { assetId: string; assetName: string; items: BreakdownItem[]; currency: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const blank = { name: "", kind: "appliance" as AssetItemKind, cost: "", acquired_on: "", value_now: "" };
  const [draft, setDraft] = useState(blank);
  const { error, pending, run } = useMoneyAction();
  const field = { minHeight: "2.5rem", width: "100%" } as const;
  const sym = currencySymbol(currency);

  const startEdit = (i: BreakdownItem) => {
    setEditing(i.id);
    setDraft({
      name: i.name,
      kind: (ASSET_ITEM_KINDS as readonly string[]).includes(i.kind) ? (i.kind as AssetItemKind) : "other",
      cost: String(i.cost),
      acquired_on: i.acquired_on ?? "",
      value_now: i.value_now == null ? "" : String(i.value_now),
    });
  };
  const reset = () => {
    setEditing(null);
    setDraft(blank);
  };

  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }} onClick={() => setOpen(true)}>
        Breakdown{items.length ? ` (${items.length})` : ""}
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={`What's in ${assetName}`}>
        {items.length === 0 && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem" }}>
            Nothing yet. Add the furniture, appliances, renovations and dues that went into it — each adds to what it is worth, and ages on its own.
          </p>
        )}
        {items.map((i) => (
          <div key={i.id} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", padding: "0.5rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, display: "block" }}>{i.name}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                {ASSET_ITEM_KIND_LABELS[i.kind as AssetItemKind] ?? i.kind} · paid {formatCurrency(i.cost, currency)}
                {i.acquired_on ? ` · ${monthYear(i.acquired_on)}` : ""}
                {i.value_now != null ? " · resale typed" : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none" }}>{formatCurrency(i.worth, currency)}</span>
            <button type="button" className="btn btn-secondary" style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem" }} onClick={() => startEdit(i)}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              aria-label={`Remove ${i.name}`}
              style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
              onClick={async () => {
                if (!(await confirm({ title: `Remove "${i.name}"?`, confirmLabel: "Remove", danger: true }))) return;
                run(() => deleteAssetItemAction(i.id), () => editing === i.id && reset());
              }}
            >
              ✕
            </button>
          </div>
        ))}

        <div style={{ font: "600 0.875rem/1.2 var(--font-heading)", margin: "0.875rem 0 0.5rem" }}>{editing ? "Change it" : "Add a thing in it"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-name`}>What it is</label>
            <input id={`${uid}-name`} className="input" placeholder="Aircon, sala set…" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-kind`}>Kind</label>
            <select id={`${uid}-kind`} className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as AssetItemKind })} style={field}>
              {ASSET_ITEM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {ASSET_ITEM_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-cost`}>Price ({sym})</label>
            <input id={`${uid}-cost`} className="input" type="number" step="0.01" min="0" inputMode="decimal" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-bought`}>Bought on</label>
            <DateInput id={`${uid}-bought`} className="input" value={draft.acquired_on} onChange={(e) => setDraft({ ...draft, acquired_on: e.target.value })} style={field} />
          </div>
          <div className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
            <label htmlFor={`${uid}-now`}>Would sell for now ({sym}, optional)</label>
            <input id={`${uid}-now`} className="input" type="number" step="0.01" min="0" inputMode="decimal" placeholder="Leave blank to estimate from its age" value={draft.value_now} onChange={(e) => setDraft({ ...draft, value_now: e.target.value })} style={field} />
          </div>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.5rem 0 0" }}>{ASSET_ITEM_KIND_HINTS[draft.kind]}</p>
        {error && (
          <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          {editing && (
            <button type="button" className="btn btn-secondary" disabled={pending} style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={reset}>
              Cancel
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            style={{ flex: 2, minHeight: "2.5rem", fontSize: "0.84375rem" }}
            onClick={() => run(() => (editing ? updateAssetItemAction(editing, draft) : addAssetItemAction(assetId, draft)), reset)}
          >
            {pending ? "…" : editing ? "Save" : "Add"}
          </button>
        </div>
      </FormSheet>
    </>
  );
}

/** A loan's payments: the monthly amount, when the next one is due, how many
 * are left and the yearly interest rate. With a date and a count, each
 * payment shows on the calendar with its amount. */
export function LoanScheduleControl({
  id,
  monthlyPayment,
  nextPaymentDate,
  paymentsLeft,
  interestRate,
}: {
  id: string;
  monthlyPayment: number | null;
  /** The next payment still ahead, not the date first entered. */
  nextPaymentDate: string | null;
  /** How many are left from that one on. */
  paymentsLeft: number | null;
  interestRate: number | null;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [monthly, setMonthly] = useState(monthlyPayment == null ? "" : String(monthlyPayment));
  const [next, setNext] = useState(nextPaymentDate ?? "");
  const [left, setLeft] = useState(paymentsLeft == null ? "" : String(paymentsLeft));
  const [rate, setRate] = useState(interestRate == null ? "" : String(interestRate));
  const { error, pending, run } = useMoneyAction();
  const field = { minHeight: "2.5rem", width: "100%" } as const;

  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }} onClick={() => setOpen(true)}>
        Payments
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Payments">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-monthly`}>Per month</label>
            <input id={`${uid}-monthly`} className="input" type="number" step="0.01" min="0" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-rate`}>Interest (% a year)</label>
            <input id={`${uid}-rate`} className="input" type="number" step="0.001" min="0" max="100" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-next`}>Next payment</label>
            <DateInput id={`${uid}-next`} className="input" value={next} onChange={(e) => setNext(e.target.value)} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-left`}>Payments left</label>
            <input id={`${uid}-left`} className="input" type="number" step="1" min="1" max="1200" inputMode="numeric" value={left} onChange={(e) => setLeft(e.target.value)} style={field} />
          </div>
        </div>
        {error && (
          <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ width: "100%", minHeight: "2.5rem", fontSize: "0.84375rem", marginTop: "0.75rem" }}
          onClick={() =>
            run(
              () => updateLiabilityScheduleAction(id, { monthlyPayment: monthly, nextPaymentDate: next, paymentsRemaining: left, interestRate: rate }),
              () => setOpen(false),
            )
          }
        >
          {pending ? "…" : "Save"}
        </button>
      </FormSheet>
    </>
  );
}

const DELETERS = {
  asset: deleteAssetAction,
  liability: deleteLiabilityAction,
  bill: deleteBillAction,
  income_schedule: deleteIncomeScheduleAction,
  goal: deleteGoalAction,
  account: archiveAccountAction,
  remittance: deleteRemittanceAction,
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
        if (
          !(await confirm({
            title: `${label}?`,
            description:
              kind === "account"
                ? "It drops off your lists and totals, and its history is kept exactly as it is. You can restore it any time from ARCHIVED at the foot of the Accounts tab."
                : undefined,
            confirmLabel: kind === "account" ? "Archive" : "Remove",
            danger: true,
          }))
        )
          return;
        run(() => DELETERS[kind](id));
      }}
    >
      {pending ? "…" : kind === "account" ? "Archive" : "Remove"}
    </button>
  );
}

const smallButton: React.CSSProperties = { minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" };

/** Brings an archived account back into every list and total. */
export function RestoreAccountButton({ accountId }: { accountId: string }) {
  const { error, pending, run } = useMoneyAction();
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
      <button type="button" className="btn btn-secondary" disabled={pending} style={smallButton} onClick={() => run(() => restoreAccountAction(accountId))}>
        {pending ? "…" : "Restore"}
      </button>
      <Err message={error} />
    </span>
  );
}

/** Delete, the permanent one. Only an account nothing has moved through can
 * go: one with movements is offered Archive instead, in the same sheet,
 * because deleting it would take its history -- and the other half of any
 * transfer -- with it (deleteAccountAction refuses it too, in case this
 * count is stale). `afterDelete` is where to go once it's gone, for the
 * account's own page, which has nothing left to show. */
export function DeleteAccountButton({
  accountId,
  accountName,
  movementCount,
  archived,
  afterDelete,
}: {
  accountId: string;
  accountName: string;
  movementCount: number;
  archived: boolean;
  afterDelete?: string;
}) {
  const { error, pending, run } = useMoneyAction();
  const router = useRouter();
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ ...smallButton, color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
        onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (movementCount > 0) {
            const archiveInstead = await confirm({
              title: `"${accountName}" can't be deleted`,
              description: `It has ${movementCount} movement${movementCount === 1 ? "" : "s"} in its history. Deleting it would erase them — including its side of any transfer, leaving money that left another account and arrived nowhere. ${archived ? "It is already archived: hidden from your lists and totals, with its history kept." : "Archive it instead: it disappears from your lists and totals, its history stays, and you can restore it any time."}`,
              confirmLabel: archived ? "OK" : "Archive instead",
              cancelLabel: archived ? "Close" : "Cancel",
            });
            if (archiveInstead && !archived) run(() => archiveAccountAction(accountId), () => afterDelete && router.push(afterDelete));
            return;
          }
          if (
            !(await confirm({
              title: `Delete "${accountName}"?`,
              description: "This removes the account for good, for everyone in the household. Nothing has moved through it, so no history is lost. This can't be undone.",
              confirmLabel: "Delete",
              danger: true,
            }))
          )
            return;
          run(() => deleteAccountAction(accountId), () => afterDelete && router.push(afterDelete));
        }}
      >
        {pending ? "…" : "Delete"}
      </button>
      <Err message={error} />
    </span>
  );
}

/** "Include my private accounts in All totals" -- the viewer's own switch,
 * shown on All. Off leaves their private accounts out of All's lists and
 * totals; they still show under their own name. */
export function IncludePrivateToggle({ include }: { include: boolean }) {
  const { error, pending, run } = useMoneyAction();
  return (
    <div style={{ margin: "0 0 0.75rem" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>
        <input type="checkbox" checked={include} disabled={pending} onChange={(e) => run(() => setIncludePrivateInTotalsAction(e.target.checked))} />
        Include my private accounts in All totals
      </label>
      <Err message={error} />
    </div>
  );
}

/** Move money for one account: a single banknote icon beside its Archive
 * button, where three MONEY IN / MONEY OUT / TRANSFER buttons used to sit
 * above the whole list. Which of the three is picked inside the form; this
 * only carries the account in, so it starts out chosen. A button, not a
 * link, for the same reason as RemoveButton: the row it sits in already is
 * one, and links can't nest. */
export function MoveMoneyButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-secondary"
      aria-label={`Move money: ${accountName}`}
      title="Move money"
      style={{ minHeight: "1.875rem", minWidth: "1.875rem", padding: "0 0.4375rem", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        router.push(`/wealth/transact?account=${accountId}`);
      }}
    >
      <Icon name="banknote" size={16} />
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

  // "All", not "Family": Family is the Who for joint accounts, and a personal
  // account everyone can see is not one of those (Janine, 12 October). Same
  // word as the Who picker's All, which is where it shows.
  const label = isPrivate ? "Private" : "All";
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
      title={isPrivate ? "Only you can see this account. Tap to let everyone in the household see it." : "Everyone in the household can see this account. Tap to keep it to yourself."}
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
