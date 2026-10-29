"use client";

import Link from "next/link";

import { FormSheet } from "@/components/form-sheet";
import { useId, useRef, useState, useSyncExternalStore, useTransition } from "react";

/** For useSyncExternalStore where only the server/client difference matters. */
const subscribeNever = () => () => {};
import { useRouter } from "next/navigation";
import {
  payBillAction,
  settleBillOutsideKinAction,
  receiveIncomeAction,
  contributeToGoalAction,
  payFromFundAction,
  confirmTransactionAction,
  deleteTransactionAction,
  updateTransactionAction,
  updateAssetValueAction,
  addAssetItemAction,
  updateAssetItemAction,
  deleteAssetItemAction,
  updateLiabilityBalanceAction,
  setLoanPaymentsLeftAction,
  addLoanBillAction,
  addBillAction,
  repriceLoanAction,
  transferAction,
  updateLiabilityScheduleAction,
  deleteAssetAction,
  deleteLiabilityAction,
  deleteBillAction,
  deleteIncomeScheduleAction,
  deleteIncomeGroupAction,
  deleteGoalAction,
  updateSavingsGoalAction,
  archiveAccountAction,
  restoreAccountAction,
  setIncludePrivateInTotalsAction,
  deleteAccountAction,
  getAccountDeletionPreviewAction,
  type AccountDeletionEntry,
  setAccountVisibilityAction,
  postHubExpenseAction,
  deleteRemittanceAction,
  matchBankBalanceAction,
  markItemServicedAction,
} from "@/lib/actions/wealth";
import { remindDepositAction, snoozeWaitingAction } from "@/lib/actions/waiting";
import { formatCurrency, formatDate, currencySymbol } from "@/lib/format";
import { Icon } from "@/components/icons";
import { confirm } from "@/components/confirm-sheet";
import { AmountInput } from "@/components/amount-input";
import { accountAudienceLabel, costPerMonth, extraPaymentEffect, MP2_RATE_YEAR, MP2_RECENT_RATE, mp2RateStale, payOrInvest, repricedPayment, RUNNING_COST_PRESETS, type RunningCostRepeat, categoryLabel, EXPENSE_CATEGORIES, INCOME_SOURCES, type AccountAudienceMember, type PendingRow } from "@/lib/wealth";
import { RowButton } from "@/components/today-row";
import { DateInput } from "@/components/date-input";
import { fundCategory } from "@/lib/sinking-fund";
import { ASSET_ITEM_KINDS, ASSET_ITEM_KIND_HINTS, ASSET_ITEM_KIND_LABELS, type AssetItemKind } from "@/lib/wealth";

/** Lives in lib/account-picker now, where the ordering and grouping rules
 * are; re-exported so the forms that import it from here keep working. */
export type { PickableAccount } from "@/lib/account-picker";
import type { PickableAccount } from "@/lib/account-picker";
import { AccountOptions } from "@/components/account-options";
import { LoanSplitBox, type SplitLoan } from "@/components/loan-split";
import { ForSelect, type ExpenseTargets } from "@/components/for-select";
import { raiseNextBill } from "@/components/next-bill-offer";
import { failedSaveMessage, newOpId } from "@/lib/offline/live";
import { nextServiceDue } from "@/lib/upkeep";

/** Kin starts the payment, the member's own banking app finishes it, then
 * they come back and confirm — so nothing is counted as moved until it
 * really has. */
function useMoneyAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // An id per save, made at its first try and kept until one succeeds
  // (lib/ledger-ids, 29 October): a retry after "Load failed" then finds
  // the money already recorded instead of recording it twice. By scope, so
  // a Pay that failed does not lend its id to a different save.
  const ids = useRef(new Map<string, string>());
  const named = useRef(false);
  function entryId(scope: string): string {
    named.current = true;
    const known = ids.current.get(scope);
    if (known) return known;
    const id = newOpId();
    ids.current.set(scope, id);
    return id;
  }

  function run<R extends { error: string | null; appUrl?: string | null }>(fn: () => Promise<R>, onDone?: (res: R) => void) {
    startTransition(async () => {
      named.current = false;
      let res: R;
      try {
        res = await fn();
      } catch (e) {
        // A weak signal ("Load failed"): the sheet stays as it was, with
        // what was typed, instead of the page falling over.
        setError(failedSaveMessage(e, named.current));
        return;
      }
      setError(res.error);
      if (res.error) return;
      ids.current.clear();
      if (res.appUrl) window.open(res.appUrl, "_blank", "noopener,noreferrer");
      onDone?.(res);
      router.refresh();
    });
  }

  return { error, pending, run, entryId };
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
      <AccountOptions accounts={accounts} currency={currency} />
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

export function PayBillControl({
  billId,
  amount,
  accounts,
  currency,
  defaultAccountId,
  due = null,
  autoOpen = false,
  loan = null,
}: {
  billId: string;
  amount: number;
  accounts: PickableAccount[];
  currency: string;
  /** The account the bill was added against (bills.account_id); Settle
   * starts on it. Null, or one the member can't pay from: the most used. */
  defaultAccountId?: string | null;
  /** Due today or overdue (Jonathan, 26 October): the sheet asks whether it
   * went through, the amount there to change if the bill came to more. */
  due?: "today" | "overdue" | null;
  /** Arrived from Today's Pay: open the sheet straight away. */
  autoOpen?: boolean;
  /** The loan this bill pays down (bills.against_table): the sheet shows
   * Kin's split into interest and principal, the principal there to change. */
  loan?: SplitLoan | null;
}) {
  // Opened after hydration, not as the first state: a sheet whose open
  // flag is already true when the server's HTML hydrates never slid in
  // (the Add expense spec's first runs, 26 October); opened a moment
  // later, as a tap would, it does. `hydrated` is false in the server's
  // HTML and true on the client's first render after it, so an arrival
  // from Today's Pay opens the sheet then; a tap or a close takes over.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? (autoOpen && hydrated);
  const setOpen = setChosen;
  const [accountId, setAccountId] = useState((defaultAccountId && accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : accounts[0]?.id) ?? "");
  const [payAmount, setPayAmount] = useState(amount);
  // The principal the person typed, null to follow Kin's split.
  const [principalOverride, setPrincipalOverride] = useState<number | null>(null);
  const [viaApp, setViaApp] = useState(true);
  const { error, pending, run, entryId } = useMoneyAction();
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
      <FormSheet open={open} onClose={() => setOpen(false)} title={due ? "Did it go through?" : "Settle"}>
        <div style={{ marginTop: "0.625rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", textAlign: "left" }}>
          <Err message={error} />
          {due && (
            <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.625rem", lineHeight: 1.45 }}>
              {due === "today" ? "Due today." : "The due day has passed."} Mark it paid if it went through, changing the amount first if the bill came to more or less.
            </p>
          )}
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-account`}>Pay from</label>
            <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
          </div>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-amount`}>Amount ({currencySymbol(currency)})</label>
            <AmountInput
              id={`${uid}-amount`}
              ariaLabel={`Amount (${currencySymbol(currency)})`}
              defaultValue={payAmount}
              onValueChange={(v) => {
                setPayAmount(v);
                setPrincipalOverride(null);
              }}
              style={{ minHeight: "2.625rem" }}
            />
          </div>
          {loan && <LoanSplitBox loan={loan} amount={payAmount} currency={currency} override={principalOverride} onOverride={setPrincipalOverride} />}
          <ViaAppToggle checked={viaApp} onChange={setViaApp} account={account} />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
              onClick={() => run(() => payBillAction({ billId, accountId, amount: payAmount, viaApp: viaApp && !!account?.linked_app_url, principal: loan ? principalOverride : null, clientId: entryId("pay") }), (res) => { setOpen(false); raiseNextBill(res.next); })}
            >
              {pending ? "…" : viaApp && account?.linked_app_url ? "Open app & log" : "Mark paid"}
            </button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          {/* Paid with money Kin doesn't track (cash at a Bayad Center, a
              relative's GCash): the bill is settled, no account moves. */}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={pending}
            style={{ width: "100%", minHeight: "2.25rem", fontSize: "0.8125rem", marginTop: "0.375rem", color: "var(--color-neutral-700)" }}
            onClick={() => run(() => settleBillOutsideKinAction(billId), (res) => { setOpen(false); raiseNextBill(res.next); })}
          >
            Paid outside Kin — no account to take it from
          </button>
        </div>
      </FormSheet>
    </>
  );
}

export function ReceiveIncomeControl({ scheduleId, amount, accounts, currency, defaultAccountId = null }: { scheduleId: string; amount: number; accounts: PickableAccount[]; currency: string; /** The account it is set to arrive in: the picker opens on it. */ defaultAccountId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState((defaultAccountId && accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId : accounts[0]?.id) ?? "");
  const [receiveAmount, setReceiveAmount] = useState(amount);
  const [viaApp, setViaApp] = useState(true);
  const { error, pending, run, entryId } = useMoneyAction();
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
                  () => receiveIncomeAction({ scheduleId, accountId, amount: receiveAmount, viaApp: viaApp && !!account?.linked_app_url, clientId: entryId("receive") }),
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
  fromAccountId,
  fromAccount2Id,
  fromAmount,
  from2Amount,
  compact = false,
}: {
  /** One small filled button among the row's others (29 October), not a
   * full-width bar above them. */
  compact?: boolean;
  goalId: string;
  accounts: PickableAccount[];
  currency: string;
  /** The goal's To account: where its savings are kept. */
  linkedAccountId?: string | null;
  /** The goal's From account: where putting money in starts (26 October). */
  fromAccountId?: string | null;
  /** Its second source, and what each gives a month, if said. */
  fromAccount2Id?: string | null;
  fromAmount?: number | null;
  from2Amount?: number | null;
}) {
  const [open, setOpen] = useState(false);
  // From the goal's From account; else the first that is not its To account
  // (money moves From -> To); else whatever there is.
  const defaultAccountId =
    (fromAccountId && accounts.some((a) => a.id === fromAccountId) ? fromAccountId : (accounts.find((a) => a.id !== linkedAccountId) ?? accounts[0])?.id) ?? "";
  const toAccount = linkedAccountId ? accounts.find((a) => a.id === linkedAccountId) : undefined;
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [amount, setAmount] = useState(0);
  const [viaApp, setViaApp] = useState(true);
  const { error, pending, run, entryId } = useMoneyAction();
  const account = accounts.find((a) => a.id === accountId);
  const uid = useId();
  // Both sources at once (26 October): each its own transfer, its own amount.
  const source1 = fromAccountId ? accounts.find((a) => a.id === fromAccountId) : undefined;
  const source2 = fromAccount2Id ? accounts.find((a) => a.id === fromAccount2Id) : undefined;
  const twoSources = !!source1 && !!source2;
  const [both, setBoth] = useState(false);
  const [amount1, setAmount1] = useState(fromAmount ?? 0);
  const [amount2, setAmount2] = useState(from2Amount ?? 0);

  if (accounts.length === 0) return null;

  const putIn = () =>
    both && source1 && source2
      ? run(async () => {
          // One after the other: a failure on the second leaves the first
          // done, and says so.
          if (amount1 > 0) {
            const first = await contributeToGoalAction({ goalId, accountId: source1.id, amount: amount1, viaApp: false, clientId: entryId("goal-1") });
            if (first.error) return first;
          }
          if (amount2 > 0) {
            const second = await contributeToGoalAction({ goalId, accountId: source2.id, amount: amount2, viaApp: false, clientId: entryId("goal-2") });
            if (second.error) return { error: amount1 > 0 ? `${source1.name}'s part went in; ${source2.name}'s did not. ${second.error}` : second.error };
          }
          return { error: amount1 > 0 || amount2 > 0 ? null : "Enter an amount for at least one account." };
        }, () => setOpen(false))
      : run(() => contributeToGoalAction({ goalId, accountId, amount, viaApp: viaApp && !!account?.linked_app_url, clientId: entryId("goal") }), () => setOpen(false));

  return (
    <>
      <button type="button" className={compact ? "btn btn-primary" : "btn btn-secondary btn-block"} style={compact ? { minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.6875rem" } : { minHeight: "2.375rem", fontSize: "0.8125rem", marginTop: "0.625rem" }} onClick={() => setOpen(true)}>
        {compact ? "Put money in" : "+ PUT MONEY IN"}
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Put money in">
        <div style={{ marginTop: "0.75rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)" }}>
          <Err message={error} />
          {twoSources && (
            <div style={{ display: "flex", gap: "0.4375rem", marginBottom: "0.625rem" }}>
              <button type="button" className="chip" data-active={!both} onClick={() => setBoth(false)}>
                One account
              </button>
              <button type="button" className="chip" data-active={both} onClick={() => setBoth(true)}>
                From both
              </button>
            </div>
          )}
          {both && source1 && source2 ? (
            <>
              {[
                { a: source1, v: amount1, set: setAmount1 },
                { a: source2, v: amount2, set: setAmount2 },
              ].map(({ a, v, set }) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "0.84375rem" }}>{a.name}</span>
                  <AmountInput ariaLabel={`From ${a.name}`} defaultValue={v} onValueChange={set} style={{ width: 120, minHeight: "2.625rem" }} />
                </div>
              ))}
              {toAccount && <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0 0 0.5rem" }}>Both move to {toAccount.name}, where this goal&rsquo;s savings are kept.</p>}
            </>
          ) : (
          <>
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
          {toAccount && (
            <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0 0 0.5rem" }}>
              {accountId === toAccount.id ? `${toAccount.name} is where this goal's savings are kept: the money leaves it and is set aside in the goal.` : `Moves to ${toAccount.name}, where this goal's savings are kept.`}
            </p>
          )}
          <ViaAppToggle checked={viaApp} onChange={setViaApp} account={account} />
          </>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
              onClick={putIn}
            >
              {pending ? "…" : !both && viaApp && account?.linked_app_url ? "Open app & log" : "Add to goal"}
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

/** "Paid it", on a sinking fund whose cost has come due: what was paid, from
 * which account, in which category. The money comes back out of the goal and
 * goes out as the expense; a yearly fund moves on to next year's date. */
export function FundPaidControl({
  goalId,
  title,
  accounts,
  currency,
  saved,
  target,
  linkedAccountId,
  repeatsYearly,
}: {
  goalId: string;
  title: string;
  accounts: PickableAccount[];
  currency: string;
  saved: number;
  target: number;
  linkedAccountId?: string | null;
  repeatsYearly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const defaultAccountId = (linkedAccountId && accounts.some((a) => a.id === linkedAccountId) ? linkedAccountId : accounts[0]?.id) ?? "";
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [amount, setAmount] = useState(Math.min(saved, target) || target);
  const [category, setCategory] = useState<string>(fundCategory(title));
  const { error, pending, run, entryId } = useMoneyAction();
  const uid = useId();

  if (accounts.length === 0) return null;

  return (
    <>
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.375rem", fontSize: "0.8125rem", marginTop: "0.5rem" }} onClick={() => setOpen(true)}>
        PAID IT
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={`Paid ${title}`}>
        <div style={{ marginTop: "0.75rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)" }}>
          <Err message={error} />
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`${uid}-account`}>Paid from</label>
              <AccountSelect id={`${uid}-account`} accounts={accounts} value={accountId} onChange={setAccountId} currency={currency} />
            </div>
            <div className="field" style={{ width: 110, margin: 0 }}>
              <label htmlFor={`${uid}-amount`}>Amount</label>
              <AmountInput id={`${uid}-amount`} ariaLabel="Amount paid" defaultValue={amount} onValueChange={setAmount} style={{ minHeight: "2.625rem" }} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-category`}>Category</label>
            <select id={`${uid}-category`} className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: "2.625rem" }}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "0 0 0.625rem" }}>
            Up to {formatCurrency(saved, currency)} comes out of the fund into this account, and the payment goes out of it.
            {repeatsYearly ? " The fund then starts again for next year’s date." : ""}
          </p>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
              onClick={() => run(() => payFromFundAction({ goalId, accountId, amount, category, clientId: entryId("fund") }), () => setOpen(false))}
            >
              {pending ? "…" : "Record payment"}
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
  sourceTable: "bills" | "events" | "buy_items" | "health_appointments" | "gift_list_items";
  sourceId: string | null;
  suggested?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState(suggested ?? 0);
  const { error, pending, run, entryId } = useMoneyAction();
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
              onClick={() => run(() => postHubExpenseAction({ accountId, amount, particulars, category, sourceTable, sourceId, clientId: entryId("hub") }), () => setOpen(false))}
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

/** Accounts' "Waiting on you" (Jonathan, 27 October): one row per thing
 * to decide, a transfer as one row rather than its two legs, with Today's
 * small buttons on the right instead of two full-width ones in a card of
 * their own. "Went through" opens a sheet that shows what each balance
 * becomes and lets the amount, the day and the account(s) be put right
 * first: the reminder is usually the moment the transfer is actually made,
 * so what was logged ahead of time is often not quite what went through.
 * `openId` opens one row's sheet on arrival (Today's Confirm). */
export function PendingRows({ rows, accounts, appUrls, currency, dateFormat, openId = null, bare = false }: { rows: PendingRow[]; accounts: PickableAccount[]; appUrls: Record<string, string | null>; currency: string; dateFormat: string; openId?: string | null; /** Only the buttons: inside "Waiting on you"'s sheet, which already says what it is (29 October). */ bare?: boolean }) {
  return (
    <div>
      {rows.map((r) => (
        <PendingRowItem key={r.id} row={r} accounts={accounts} appUrl={appUrls[r.id] ?? null} currency={currency} dateFormat={dateFormat} openAtStart={r.id === openId} bare={bare} />
      ))}
    </div>
  );
}

function PendingRowItem({ row, accounts, appUrl, currency, dateFormat, openAtStart, bare = false }: { row: PendingRow; accounts: PickableAccount[]; appUrl: string | null; currency: string; dateFormat: string; openAtStart: boolean; bare?: boolean }) {
  const [open, setOpen] = useState(openAtStart);
  const [amount, setAmount] = useState(row.amount);
  const [occurredOn, setOccurredOn] = useState(row.occurredOn);
  const [fromId, setFromId] = useState(row.from?.id ?? "");
  const [toId, setToId] = useState(row.to?.id ?? "");
  const [accountId, setAccountId] = useState(row.account?.id ?? "");
  const { error, pending, run } = useMoneyAction();
  const uid = useId();
  const transfer = row.kind === "transfer";
  const fmt = (n: number) => formatCurrency(n, currency);
  const title = transfer ? `${row.from?.name ?? "Another account"} → ${row.to?.name ?? "another account"}` : row.particulars;
  const meta = [transfer ? (row.defaultWords ? null : row.particulars) : row.account?.name, `started ${formatDate(row.occurredOn, dateFormat)}`, "not counted yet"].filter(Boolean).join(" · ");
  const sign = row.kind === "in" ? "+" : row.kind === "out" ? "−" : "";
  const nameOf = (id: string, fallback: string) => accounts.find((a) => a.id === id)?.name ?? fallback;
  // What each balance becomes, for the accounts the viewer can see.
  const effects = (transfer ? [[fromId, -amount, row.from?.name ?? ""], [toId, amount, row.to?.name ?? ""]] : [[accountId, row.kind === "in" ? amount : -amount, row.account?.name ?? ""]])
    .flatMap(([id, delta, fallback]) => {
      const a = accounts.find((x) => x.id === id);
      return a ? [`${nameOf(a.id, fallback as string)}: ${fmt(a.balance)} → ${fmt(a.balance + (delta as number))}`] : [];
    });
  const changed = amount !== row.amount || occurredOn !== row.occurredOn || (transfer ? fromId !== (row.from?.id ?? "") || toId !== (row.to?.id ?? "") : accountId !== (row.account?.id ?? ""));
  const edits = changed ? { amount, occurredOn, ...(transfer ? { fromAccountId: fromId || undefined, toAccountId: toId || undefined } : { accountId: accountId || undefined }) } : undefined;
  const sideSelect = (id: string, label: string, side: { id: string | null; name: string } | null, value: string, set: (v: string) => void) => (
    <div className="field" style={{ flex: 1, margin: 0 }}>
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} disabled={!side?.id} onChange={(e) => set(e.target.value)} style={{ minHeight: "2.625rem" }}>
        {!side?.id && <option value="">{side?.name ?? "Another account"}</option>}
        {side?.id && !accounts.some((a) => a.id === side.id) && <option value={side.id}>{side.name}</option>}
        <AccountOptions accounts={accounts} currency={currency} />
      </select>
    </div>
  );
  const discard = async () => {
    if (!(await confirm({ title: "Discard this?", description: transfer ? "Both sides of the transfer are removed. Nothing was counted yet." : "It was never counted, so no balance changes.", confirmLabel: "Discard", danger: true }))) return;
    run(() => deleteTransactionAction(row.entryId));
  };
  return (
    <div id={bare ? undefined : `pending-${row.id}`} style={bare ? { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem 0.625rem" } : { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem 0.625rem", padding: "0.625rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      {!bare && (
        <>
          <span style={{ flex: "1 1 10rem", minWidth: 0 }}>
            <span style={{ fontSize: "0.875rem", display: "block" }}>{title}</span>
            <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{meta}</span>
          </span>
          <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none", color: row.kind === "in" ? "var(--color-accent-700)" : "inherit" }}>
            {sign}
            {fmt(row.amount)}
          </span>
        </>
      )}
      <span style={{ display: "flex", gap: "0.375rem", flex: "none" }}>
        <RowButton kind="primary" icon="check" label="Went through" disabled={pending} onClick={() => setOpen(true)} />
        <RowButton kind="ghost" label="Discard" disabled={pending} onClick={discard} />
      </span>
      <Err message={open ? null : error} />
      <FormSheet open={open} onClose={() => setOpen(false)} title="Did it go through?">
        <div style={{ marginTop: "0.625rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", textAlign: "left" }}>
          <Err message={error} />
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.625rem", lineHeight: 1.45 }}>
            {transfer ? "Check what actually moved, then confirm. Both sides are counted together." : "Check what actually went through, then confirm."}
          </p>
          {transfer ? (
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
              {sideSelect(`${uid}-from`, "From", row.from, fromId, setFromId)}
              {sideSelect(`${uid}-to`, "To", row.to, toId, setToId)}
            </div>
          ) : (
            <div style={{ marginBottom: "0.5rem", display: "flex" }}>{sideSelect(`${uid}-account`, row.kind === "in" ? "Paid into" : "Paid from", row.account, accountId, setAccountId)}</div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`${uid}-amount`}>Amount ({currencySymbol(currency)})</label>
              <AmountInput id={`${uid}-amount`} ariaLabel={`Amount (${currencySymbol(currency)})`} defaultValue={amount} onValueChange={setAmount} style={{ minHeight: "2.625rem" }} />
            </div>
            <div className="field" style={{ flex: 1, margin: 0 }}>
              <label htmlFor={`${uid}-on`}>Day</label>
              <DateInput id={`${uid}-on`} className="input" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} style={{ minHeight: "2.625rem" }} />
            </div>
          </div>
          {effects.length > 0 && (
            <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem", lineHeight: 1.5 }}>
              {effects.map((e) => (
                <span key={e} style={{ display: "block" }}>{e}</span>
              ))}
            </p>
          )}
          {appUrl && (
            <a href={appUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-block" style={{ minHeight: "2.375rem", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
              Open the app to make it now
            </a>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-primary" disabled={pending} style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={() => run(() => confirmTransactionAction(row.entryId, edits), () => setOpen(false))}>
              {pending ? "…" : changed ? "Confirm as corrected" : "Confirm"}
            </button>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </FormSheet>
    </div>
  );
}

/** One entry behind a Cash Flow line, as the line's list shows it. */
export type LineEntry = {
  id: string;
  particulars: string;
  amount: number;
  occurredOn: string;
  category: string | null;
  direction: string;
  accountId: string;
  accountName: string;
  /** What it was for: "liabilities:<id>", "assets:<id>", "goals:<id>" or
   * "" (Jonathan, 26 October). Null when it cannot change here, with
   * `forLocked` saying why: it settled a bill or came from another hub,
   * or it bought or added to an asset (its item is on the asset). */
  forKey: string | null;
  forLocked: string | null;
  /** On a loan: the part of it saved as paying the loan down, and whether
   * it is confirmed -- a confirmed one has already lowered the loan's
   * balance, so Edit entry measures its split against what was owed before
   * it (27 October). */
  principal?: number | null;
  confirmed?: boolean;
};


/** The entries a Cash Flow line adds up (Janine, 25 October): a line is
 * every entry of one name and category, so it has no single entry to edit
 * or remove. Tapping "N entries" opens them, each with Edit and Remove. */
export function LineEntries({ entries, accounts, targets, currency, dateFormat }: { entries: LineEntry[]; accounts: PickableAccount[]; targets: ExpenseTargets; currency: string; dateFormat: string }) {
  const [open, setOpen] = useState(false);
  // Which entries sit in an Only-you account (27 October): nobody else
  // sees those, and nothing on Cash Flow said so.
  const onlyMe = new Set(accounts.filter((a) => a.onlyMe).map((a) => a.id));
  if (entries.length === 0) return null;
  return (
    <div style={{ width: "100%" }}>
      <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5rem" }}>
        {open ? "Hide entries" : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} · edit or remove`}
      </button>
      {open && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0.25rem 0 0" }}>
          {[...entries].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)).map((e) => (
            <li key={e.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem 0.5rem", fontSize: "0.8125rem", padding: "0.375rem 0", borderTop: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
              <span style={{ flex: "1 1 9rem", minWidth: 0 }}>
                {e.particulars}
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                  {formatDate(e.occurredOn, dateFormat)} · {e.accountName}
                  {onlyMe.has(e.accountId) ? " · only you" : ""}
                </span>
              </span>
              <span style={{ fontFamily: "var(--font-numeric)", flex: "none" }}>{formatCurrency(e.amount, currency)}</span>
              <span style={{ display: "flex", gap: "0.375rem", flex: "none" }}>
                <EditEntryButton entry={e} accounts={accounts} targets={targets} currency={currency} />
                <DeleteEntryButton transactionId={e.id} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EditEntryButton({ entry, accounts, targets, currency }: { entry: LineEntry; accounts: PickableAccount[]; targets: ExpenseTargets; currency: string }) {
  const [open, setOpen] = useState(false);
  const [particulars, setParticulars] = useState(entry.particulars);
  const [amount, setAmount] = useState(entry.amount);
  const [occurredOn, setOccurredOn] = useState(entry.occurredOn);
  const [category, setCategory] = useState(entry.category ?? "");
  const [accountId, setAccountId] = useState(entry.accountId);
  // What it was for (Jonathan, 26 October): re-tied to a loan, an asset or
  // a goal, or to nothing. A loan picked shows Kin's split, the principal
  // there to change; null follows the split as the amount changes.
  const [forKey, setForKey] = useState(entry.forKey ?? "");
  // On a loan, the split starts as saved: Kin's own split would be worked
  // out again on a balance this payment already lowered (27 October).
  const savedPrincipal = entry.forKey?.startsWith("liabilities:") && entry.principal != null ? entry.principal : null;
  const [principalOverride, setPrincipalOverride] = useState<number | null>(savedPrincipal);
  // Each opening starts from the entry as saved (27 October): Cancel used
  // to keep what was typed, and the next Edit showed it as if it were the
  // entry. The amount field is uncontrolled, so it is remounted per opening.
  const [opening, setOpening] = useState(0);
  const openFresh = () => {
    setParticulars(entry.particulars);
    setAmount(entry.amount);
    setOccurredOn(entry.occurredOn);
    setCategory(entry.category ?? "");
    setAccountId(entry.accountId);
    setForKey(entry.forKey ?? "");
    setPrincipalOverride(savedPrincipal);
    setOpening((n) => n + 1);
    setOpen(true);
  };
  const listed = entry.direction === "out" && forKey.startsWith("liabilities:") ? targets.loans.find((l) => `liabilities:${l.id}` === forKey) : undefined;
  // The loan it is already on, as it stood before this payment: a
  // confirmed one has lowered the balance by what it paid down.
  const loan = listed && forKey === entry.forKey && entry.confirmed && savedPrincipal ? { ...listed, balance: Math.round((listed.balance + savedPrincipal) * 100) / 100 } : listed;
  const { error, pending, run } = useMoneyAction();
  const uid = useId();
  const choices: readonly string[] = entry.direction === "in" ? INCOME_SOURCES : EXPENSE_CATEGORIES;
  const options = category && !choices.includes(category) ? [category, ...choices] : choices;
  // Which account it moved through (Jonathan, 26 October). The pickable
  // ones are joint and the member's own; an entry on an account merely
  // shared with them keeps that account as a choice, so Save never moves
  // it by accident.
  const onPickable = accounts.some((a) => a.id === entry.accountId);
  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }} onClick={openFresh}>
        Edit
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Edit entry">
        <div style={{ marginTop: "0.625rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", textAlign: "left" }}>
          <Err message={error} />
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-what`}>What it was for</label>
            <input id={`${uid}-what`} className="input" value={particulars} maxLength={200} onChange={(e) => setParticulars(e.target.value)} style={{ minHeight: "2.625rem" }} />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div className="field" style={{ marginBottom: "0.5rem", flex: 1 }}>
              <label htmlFor={`${uid}-amount`}>Amount ({currencySymbol(currency)})</label>
              <AmountInput
                key={opening}
                id={`${uid}-amount`}
                ariaLabel={`Amount (${currencySymbol(currency)})`}
                defaultValue={amount}
                onValueChange={(v) => {
                  setAmount(v);
                  // Back to the saved amount on the same loan: the saved split.
                  setPrincipalOverride(v === entry.amount && forKey === entry.forKey ? savedPrincipal : null);
                }}
                style={{ minHeight: "2.625rem" }}
              />
            </div>
            <div className="field" style={{ marginBottom: "0.5rem", flex: 1 }}>
              <label htmlFor={`${uid}-on`}>{entry.direction === "in" ? "Received on" : "Paid on"}</label>
              <DateInput id={`${uid}-on`} className="input" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} style={{ minHeight: "2.625rem" }} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-cat`}>{entry.direction === "in" ? "Type of income" : "Spent on"}</label>
            <select id={`${uid}-cat`} className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: "2.625rem" }}>
              {options.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: "0.5rem" }}>
            <label htmlFor={`${uid}-account`}>{entry.direction === "in" ? "Paid into" : "Paid from"}</label>
            <select id={`${uid}-account`} className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ minHeight: "2.625rem" }}>
              {!onPickable && <option value={entry.accountId}>{entry.accountName}</option>}
              <AccountOptions accounts={accounts} currency={currency} />
            </select>
            {accounts.some((a) => a.onlyMe) && (
              <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.25rem 0 0", lineHeight: 1.4 }}>
                Moving it into an account marked “only you” keeps this entry to yourself.
              </p>
            )}
          </div>
          {entry.forKey !== null ? (
            <ForSelect
              targets={targets}
              value={forKey}
              loans={entry.direction === "out"}
              label={entry.direction === "in" ? "Income from (optional)" : "For (optional)"}
              onChange={(v) => {
                setForKey(v);
                setPrincipalOverride(v === entry.forKey && amount === entry.amount ? savedPrincipal : null);
                if (v.startsWith("liabilities:")) setCategory("Debt");
              }}
            />
          ) : (
            entry.forLocked && <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem", lineHeight: 1.45 }}>{entry.forLocked}</p>
          )}
          {loan && <LoanSplitBox key={opening} loan={loan} amount={amount} currency={currency} override={principalOverride} onOverride={setPrincipalOverride} />}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
              onClick={() =>
                run(
                  () =>
                    updateTransactionAction(entry.id, {
                      particulars,
                      amount,
                      occurredOn,
                      category: category || null,
                      accountId,
                      ...(entry.forKey !== null && forKey !== entry.forKey ? { against: forKey } : {}),
                      principal: loan ? principalOverride : null,
                    }),
                  () => setOpen(false),
                )
              }
            >
              {pending ? "…" : "Save"}
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
  /** Home upkeep (20261029160000): all optional. */
  warranty_until?: string | null;
  service_every_months?: number | null;
  last_serviced_on?: string | null;
};

const serviceLine = (i: { acquired_on: string | null; service_every_months?: number | null; last_serviced_on?: string | null }) => {
  if (!i.service_every_months) return "";
  const due = nextServiceDue({ acquired_on: i.acquired_on, service_every_months: i.service_every_months, last_serviced_on: i.last_serviced_on ?? null });
  return ` · service every ${i.service_every_months} mo${due ? `, next ${shortDay(due)}` : ""}`;
};
const shortDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
const monthYear = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" });

/** What an asset is made of: each thing with its price, when it was bought
 * and what it is worth now, and a form to add or change one. */
export function AssetBreakdownControl({ assetId, assetName, items, currency }: { assetId: string; assetName: string; items: BreakdownItem[]; currency: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const blank = { name: "", kind: "appliance" as AssetItemKind, cost: "", acquired_on: "", value_now: "", warranty_until: "", service_every_months: "", last_serviced_on: "" };
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
      warranty_until: i.warranty_until ?? "",
      service_every_months: i.service_every_months == null ? "" : String(i.service_every_months),
      last_serviced_on: i.last_serviced_on ?? "",
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
                {serviceLine(i)}
                {i.warranty_until ? ` · warranty to ${shortDay(i.warranty_until)}` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none" }}>{formatCurrency(i.worth, currency)}</span>
            {i.service_every_months ? (
              <button type="button" className="btn btn-secondary" disabled={pending} style={{ minHeight: "1.75rem", fontSize: "0.75rem", padding: "0 0.5rem" }} onClick={() => run(() => markItemServicedAction(i.id))}>
                Serviced
              </button>
            ) : null}
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
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-every`}>Serviced every (months)</label>
            <input id={`${uid}-every`} className="input" type="number" min="1" max="60" inputMode="numeric" placeholder="Aircon: 6" value={draft.service_every_months} onChange={(e) => setDraft({ ...draft, service_every_months: e.target.value })} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-serviced`}>Last serviced</label>
            <DateInput id={`${uid}-serviced`} className="input" value={draft.last_serviced_on} onChange={(e) => setDraft({ ...draft, last_serviced_on: e.target.value })} style={field} />
          </div>
          <div className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
            <label htmlFor={`${uid}-warranty`}>Warranty until (optional)</label>
            <DateInput id={`${uid}-warranty`} className="input" value={draft.warranty_until} onChange={(e) => setDraft({ ...draft, warranty_until: e.target.value })} style={field} />
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
  originalAmount = null,
  termMonths = null,
  rateFixedUntil = null,
}: {
  id: string;
  monthlyPayment: number | null;
  /** The next payment still ahead, not the date first entered. */
  nextPaymentDate: string | null;
  /** How many are left from that one on. */
  paymentsLeft: number | null;
  interestRate: number | null;
  /** The loan's own terms (20261026170000): what was borrowed, over how
   * many months, and the day its fixed rate ends. */
  originalAmount?: number | null;
  termMonths?: number | null;
  rateFixedUntil?: string | null;
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [monthly, setMonthly] = useState(monthlyPayment == null ? "" : String(monthlyPayment));
  const [next, setNext] = useState(nextPaymentDate ?? "");
  const [left, setLeft] = useState(paymentsLeft == null ? "" : String(paymentsLeft));
  const [rate, setRate] = useState(interestRate == null ? "" : String(interestRate));
  const [original, setOriginal] = useState(originalAmount == null ? "" : String(originalAmount));
  const [term, setTerm] = useState(termMonths == null ? "" : String(termMonths));
  const [fixedUntil, setFixedUntil] = useState(rateFixedUntil ?? "");
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
        {/* The terms it was taken on: with these, A&L shows what the
            balance should be by now, the interest paid so far and over
            the whole loan, and when the fixed rate ends. */}
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.75rem 0 0.375rem" }}>
          The loan&apos;s own terms, off the bank&apos;s offer. Optional: with them Kin checks the balance against the amortisation table and shows the interest paid.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-original`}>Amount borrowed</label>
            <input id={`${uid}-original`} className="input" type="number" step="0.01" min="0" inputMode="decimal" value={original} onChange={(e) => setOriginal(e.target.value)} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-term`}>Term (months)</label>
            <input id={`${uid}-term`} className="input" type="number" step="1" min="1" max="1200" inputMode="numeric" placeholder="e.g. 240" value={term} onChange={(e) => setTerm(e.target.value)} style={field} />
          </div>
          <div className="field" style={{ margin: 0, gridColumn: "1 / -1" }}>
            <label htmlFor={`${uid}-fixed`}>Rate fixed until</label>
            <DateInput id={`${uid}-fixed`} className="input" value={fixedUntil} onChange={(e) => setFixedUntil(e.target.value)} style={field} />
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
              () => updateLiabilityScheduleAction(id, { monthlyPayment: monthly, nextPaymentDate: next, paymentsRemaining: left, interestRate: rate, originalAmount: original, termMonths: term, rateFixedUntil: fixedUntil }),
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

/** Edit on a savings goal's line (26 October): name, note, target, date.
 * The ring on Planner that fills from it follows. */
export function EditSavingsGoalButton({ goal, currency }: { goal: { id: string; title: string; note: string | null; target: number; date: string | null; yearly: boolean }; currency: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(goal.title);
  const [note, setNote] = useState(goal.note ?? "");
  const [target, setTarget] = useState(goal.target);
  const [date, setDate] = useState(goal.date ?? "");
  const { error, pending, run } = useMoneyAction();
  const field = { minHeight: "2.5rem", width: "100%" } as const;
  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }} onClick={() => setOpen(true)}>
        Edit
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Edit goal">
        <div className="field" style={{ marginBottom: "0.5rem" }}>
          <label htmlFor={`${uid}-title`}>Title</label>
          <input id={`${uid}-title`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={field} />
        </div>
        <div className="field" style={{ marginBottom: "0.5rem" }}>
          <label htmlFor={`${uid}-note`}>Note</label>
          <input id={`${uid}-note`} className="input" value={note} onChange={(e) => setNote(e.target.value)} style={field} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-target`}>Target ({currencySymbol(currency)})</label>
            <AmountInput id={`${uid}-target`} ariaLabel="Target" defaultValue={target} onValueChange={setTarget} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-date`}>{goal.yearly ? "Next due" : "Target date"}</label>
            <DateInput id={`${uid}-date`} className="input" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
          </div>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.5rem 0 0" }}>A ring on Planner that fills from this goal takes the same name, target and date.</p>
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
          onClick={() => run(() => updateSavingsGoalAction(goal.id, { title, note, target, date }), () => setOpen(false))}
        >
          {pending ? "…" : "Save"}
        </button>
      </FormSheet>
    </>
  );
}

/** "New rate" on a loan whose fixed rate has ended or is about to (28
 * October): the new rate, the monthly payment it comes to over the
 * payments left (or the bank's own figure), and the next fixed-until day. */
export function RepriceLoanControl({ id, balance, paymentsLeft, currentRate, currentPayment, currency }: { id: string; balance: number; paymentsLeft: number; currentRate: number | null; currentPayment: number | null; currency: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(currentRate == null ? "" : String(currentRate));
  const [own, setOwn] = useState<number | null>(null);
  const [fixedUntil, setFixedUntil] = useState("");
  const { error, pending, run } = useMoneyAction();
  const r = Number(rate);
  const worked = rate.trim() && Number.isFinite(r) && r >= 0 ? repricedPayment(balance, r, paymentsLeft) : null;
  const payment = own ?? worked;
  const field = { minHeight: "2.5rem", width: "100%" } as const;
  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "1.625rem", fontSize: "0.71875rem", padding: "0 0.5rem" }} onClick={() => setOpen(true)}>
        Set the new rate
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="New rate">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-rate`}>New rate (% a year)</label>
            <input id={`${uid}-rate`} className="input" type="number" step="0.001" min="0" max="100" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-fixed`}>Fixed until (optional)</label>
            <DateInput id={`${uid}-fixed`} className="input" value={fixedUntil} onChange={(e) => setFixedUntil(e.target.value)} style={field} />
          </div>
        </div>
        <p style={{ fontSize: "0.875rem", margin: "0.75rem 0 0.25rem" }}>
          From {formatCurrency(balance, currency)} over {paymentsLeft} payment{paymentsLeft === 1 ? "" : "s"}:{" "}
          {worked != null ? <strong>about {formatCurrency(worked, currency)} a month</strong> : "—"}
          {currentPayment ? ` (now ${formatCurrency(currentPayment, currency)})` : ""}.
        </p>
        <div className="field" style={{ margin: "0.5rem 0 0" }}>
          <label htmlFor={`${uid}-pay`}>Monthly payment the bank set (if it differs)</label>
          <AmountInput id={`${uid}-pay`} ariaLabel="Monthly payment" defaultValue={own ?? undefined} onValueChange={(v) => setOwn(v > 0 ? v : null)} style={field} />
        </div>
        {error && (
          <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || payment == null}
          style={{ width: "100%", minHeight: "2.5rem", fontSize: "0.84375rem", marginTop: "0.75rem" }}
          onClick={() => run(() => repriceLoanAction(id, { rate: r, payment: payment!, fixedUntil }), () => setOpen(false))}
        >
          {pending ? "…" : payment != null ? `Use ${r}% and ${formatCurrency(payment, currency)} a month` : "Use this rate"}
        </button>
      </FormSheet>
    </>
  );
}

/** "Pay extra?" on a loan (Jonathan, 28 October): type an extra amount a
 * month and see how much sooner the loan ends and the interest it saves,
 * worked on the same table as the rest of the loan line. An estimate:
 * banks may charge for paying ahead, or count extra toward future months. */
export function ExtraPaymentControl({ balance, rate, payment, firstDate, currency }: { balance: number; rate: number | null; payment: number; firstDate: string; currency: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState(2000);
  const e = extraPaymentEffect(balance, rate, payment, extra, firstDate);
  const monthYear = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { month: "short", year: "numeric" });
  const span = (m: number) => {
    const y = Math.floor(m / 12);
    const r = m % 12;
    return [y ? `${y} year${y === 1 ? "" : "s"}` : null, r ? `${r} month${r === 1 ? "" : "s"}` : null].filter(Boolean).join(" ") || "0 months";
  };
  const line = { fontSize: "0.875rem", margin: "0.5rem 0 0" } as const;
  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }} onClick={() => setOpen(true)}>
        Pay extra?
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Pay extra each month" guardUnsaved={false}>
        <div className="field" style={{ marginBottom: "0.5rem" }}>
          <label htmlFor={`${uid}-extra`}>On top of {formatCurrency(payment, currency)} a month</label>
          <AmountInput id={`${uid}-extra`} ariaLabel="Extra each month" defaultValue={extra} onValueChange={setExtra} style={{ minHeight: "2.625rem" }} />
        </div>
        {!e.base ? (
          <p style={line}>At {formatCurrency(payment, currency)} the payment does not cover the interest, so the loan never ends. Check the rate and payment under Payments.</p>
        ) : !e.faster || !(extra > 0) ? (
          <p style={line}>Paying {formatCurrency(payment, currency)} a month, the last payment falls in {monthYear(e.base.last)}, with about {formatCurrency(Math.round(e.base.interest), currency)} interest still to pay.</p>
        ) : (
          <>
            <p style={line}>
              Done <strong>{span(e.monthsSooner!)} sooner</strong>: {monthYear(e.faster.last)}, not {monthYear(e.base.last)}.
            </p>
            <p style={line}>
              About <strong>{formatCurrency(Math.round(e.interestSaved!), currency)} less interest</strong> ({formatCurrency(Math.round(e.faster.interest), currency)} instead of {formatCurrency(Math.round(e.base.interest), currency)}).
            </p>
          </>
        )}
        {/* Or MP2 instead (29 October): paying ahead earns the loan's rate,
            certainly; MP2 its yearly dividend, locked in for five years. */}
        {(() => {
          const v = payOrInvest(rate);
          if (!v) return null;
          return (
            <p style={{ fontSize: "0.8125rem", margin: "0.75rem 0 0", padding: "0.5rem 0.625rem", borderRadius: 8, background: "color-mix(in srgb, var(--color-text) 5%, transparent)" }}>
              <strong>Or MP2?</strong> Paying ahead earns this loan&apos;s {rate}% for sure. Pag-IBIG MP2 paid {MP2_RECENT_RATE}% for {MP2_RATE_YEAR}, tax-free but not promised, and locked in for 5 years.{mp2RateStale(firstDate) ? ` A newer year's rate has likely been declared since; check pagibigfund.gov.ph.` : ""}{" "}
              {v.better === "loan" ? "Paying the loan down comes out ahead." : v.better === "mp2" ? `MP2 comes out about ${Math.abs(v.gap)} points ahead, if its dividend holds.` : "The two come out about even; paying the loan is the surer one."}
            </p>
          );
        })()}
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.75rem 0 0" }}>
          An estimate from what is owed now and the rate. Ask the bank first: some charge a fee for paying ahead, or count extra toward later months instead of the balance.
        </p>
      </FormSheet>
    </>
  );
}

/** Takes the balance a loan's own terms say should be owed (A&L, under the
 * loan): one tap instead of typing the figure into Update. */
export function SetBalanceButton({ id, value, currency, paymentsLeft = null }: { id: string; value: number; currency: string; /** The other reading of the gap (26 October): the balance is right and the schedule is off -- how many payments are left if so. */ paymentsLeft?: number | null }) {
  const { error, pending, run } = useMoneyAction();
  const small = { minHeight: "1.625rem", fontSize: "0.71875rem", padding: "0 0.5rem" } as const;
  return (
    <>
      <button type="button" className="btn btn-secondary" disabled={pending} style={small} onClick={() => run(() => updateLiabilityBalanceAction(id, value))}>
        {pending ? "…" : `Set to ${formatCurrency(value, currency)}`}
      </button>
      {paymentsLeft != null && paymentsLeft >= 1 && (
        <button type="button" className="btn btn-secondary" disabled={pending} style={small} onClick={() => run(() => setLoanPaymentsLeftAction(id, paymentsLeft))}>
          {pending ? "…" : `Or keep the balance: ${paymentsLeft} payment${paymentsLeft === 1 ? "" : "s"} left`}
        </button>
      )}
      {error && (
        <span role="alert" style={{ color: "var(--color-accent-700)" }}>
          {error}
        </span>
      )}
    </>
  );
}

/** Makes the loan's payment a monthly bill, once (A&L, on the loan row). */
export function LoanBillButton({ liabilityId, hasBill }: { liabilityId: string; hasBill: boolean }) {
  const { error, pending, run } = useMoneyAction();
  if (hasBill) {
    return (
      <Link href="/wealth?seg=cashflow&open=expenses" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
        Monthly bill set ›
      </Link>
    );
  }
  return (
    <>
      <button type="button" className="btn btn-secondary" disabled={pending} style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }} onClick={() => run(() => addLoanBillAction(liabilityId))}>
        {pending ? "…" : "Add as monthly bill"}
      </button>
      {error && (
        <span role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.78125rem" }}>
          {error}
        </span>
      )}
    </>
  );
}

const DELETERS = {
  asset: deleteAssetAction,
  liability: deleteLiabilityAction,
  bill: deleteBillAction,
  income_schedule: deleteIncomeScheduleAction,
  income_group: deleteIncomeGroupAction,
  goal: deleteGoalAction,
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
      onClick={async () => {
        if (!(await confirm({ title: `${label}?`, confirmLabel: "Remove", danger: true }))) return;
        run(() => DELETERS[kind](id));
      }}
    >
      {pending ? "…" : "Remove"}
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

/** Delete Account: one full-width button, and the choices behind it.
 *
 * An account nothing has moved through just goes, after one confirmation.
 * One with entries offers Archive instead (hidden, restorable), Delete and
 * keep every entry -- the usual case: the account was closed in real life
 * and the money that moved through it really moved -- or Delete and pick
 * entries to remove with it, each labelled as this account's alone or one
 * side of a transfer whose other side stays where it is. Before the red
 * button, what the removal changes; after it, the same list as done. */
export function DeleteAccountButton({
  accountId,
  accountName,
  balance,
  movementCount,
  pendingCount,
  archived,
  currency,
  dateFormat,
  afterDelete,
  compact,
}: {
  accountId: string;
  accountName: string;
  balance: number;
  movementCount: number;
  pendingCount: number;
  archived: boolean;
  currency: string;
  dateFormat?: string;
  afterDelete?: string;
  /** The small button of the Archived list, rather than the account page's full-width one. */
  compact?: boolean;
}) {
  const { error, pending, run } = useMoneyAction();
  const router = useRouter();
  const [step, setStep] = useState<"closed" | "choose" | "pick" | "confirm">("closed");
  const [entries, setEntries] = useState<AccountDeletionEntry[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const doomed = (entries ?? []).filter((e) => chosen.has(e.id));
  const effects = deletionEffects(doomed, currency);
  const kept = movementCount - doomed.length;

  function close() {
    setStep("closed");
    setChosen(new Set());
  }

  function openPicker() {
    setStep("pick");
    if (entries) return;
    startLoading(async () => {
      const res = await getAccountDeletionPreviewAction(accountId);
      setLoadError(res.error);
      setEntries(res.entries ?? []);
    });
  }

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const balanceNote =
    balance !== 0 ? (
      <p style={noteStyle}>
        This account still shows <strong>{formatCurrency(balance, currency)}</strong>. Once it is deleted that amount leaves your totals. If you moved the money
        elsewhere, record a transfer to that account first so your total stays right.
      </p>
    ) : null;

  return (
    <>
      <span style={compact ? { display: "inline-flex", flexDirection: "column", alignItems: "flex-end" } : { display: "block", marginTop: "0.5rem" }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          style={
            compact
              ? { ...smallButton, color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }
              : { width: "100%", minHeight: "2.75rem", fontSize: "0.875rem", color: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }
          }
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (movementCount === 0) {
              if (
                !(await confirm({
                  title: `Delete "${accountName}"?`,
                  description: "This removes the account for good, for everyone in the household. Nothing has moved through it, so no history is lost. This can't be undone.",
                  confirmLabel: "Delete Account",
                  danger: true,
                }))
              )
                return;
              run(() => deleteAccountAction(accountId), () => afterDelete && router.push(afterDelete));
              return;
            }
            setStep("choose");
          }}
        >
          {pending ? "…" : compact ? "Delete" : "Delete Account"}
        </button>
        {step === "closed" && <Err message={error} />}
      </span>

      <FormSheet open={step !== "closed"} onClose={close} title={`Delete "${accountName}"?`}>
        {step === "choose" && (
          <div>
            <p style={noteStyle}>
              It has {movementCount} {movementCount === 1 ? "entry" : "entries"}. Money that really moved stays recorded unless you choose otherwise, and the other
              side of every transfer always stays in the other account.
            </p>
            {pendingCount > 0 && (
              <p style={{ ...noteStyle, color: "var(--color-accent-700)" }}>
                {pendingCount} {pendingCount === 1 ? "entry is" : "entries are"} waiting on confirmation. Confirm or discard {pendingCount === 1 ? "it" : "them"} on the
                account first; until then it can only be archived.
              </p>
            )}
            {balanceNote}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
              {!archived && (
                <ChoiceButton
                  title="Archive instead"
                  line="Hidden from your lists and balance totals. Its entries still count in the months they happened, and you can restore it any time."
                  disabled={pending}
                  onClick={() => run(() => archiveAccountAction(accountId), () => { setStep("closed"); if (afterDelete) router.push(afterDelete); })}
                />
              )}
              <ChoiceButton
                danger
                title="Delete account, keep its entries"
                line={`The account is gone for good. Its ${movementCount} ${movementCount === 1 ? "entry stays" : "entries stay"}, still counted in the months they happened.`}
                disabled={pending || pendingCount > 0}
                onClick={() => { setChosen(new Set()); setStep("confirm"); }}
              />
              <ChoiceButton
                danger
                title="Delete account and choose entries to delete…"
                line="Pick, one by one, which entries go with it."
                disabled={pending || pendingCount > 0}
                onClick={openPicker}
              />
              <button type="button" className="btn btn-ghost" onClick={close} style={{ minHeight: "2.5rem" }}>
                Cancel
              </button>
            </div>
            <Err message={error} />
          </div>
        )}

        {step === "pick" && (
          <div>
            <p style={noteStyle}>Tick the entries to delete with the account. Nothing is ticked: every entry you leave stays recorded.</p>
            {loading && <p style={noteStyle}>Loading entries…</p>}
            <Err message={loadError} />
            {(entries ?? []).map((e) => (
              <label key={e.id} style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start", padding: "0.625rem 0", borderBottom: "1px solid var(--color-divider)", cursor: "pointer" }}>
                <input type="checkbox" checked={chosen.has(e.id)} onChange={() => toggle(e.id)} style={{ marginTop: "0.25rem" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                    <span style={{ fontSize: "0.875rem", flex: 1, minWidth: 0 }}>{e.particulars}</span>
                    <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none" }}>
                      {e.direction === "in" ? "+" : "−"}
                      {formatCurrency(e.amount, currency)}
                    </span>
                  </span>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
                    {formatDate(e.occurredAt, dateFormat)}
                    {e.category ? ` · ${categoryLabel(e.category)}` : ""}
                  </span>
                  <span style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginTop: "0.25rem", color: e.transfer ? "var(--color-neutral-700)" : "var(--color-accent-700)" }}>
                    {e.transfer
                      ? `Transfer — the other side stays in ${e.otherAccountName}. Only this account's side is deleted.`
                      : "Only in this account — deleting it removes it for good."}
                  </span>
                  {(e.goalTitle || e.billName || e.incomeName) && (
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>
                      {e.goalTitle ? `Counts toward the goal "${e.goalTitle}". ` : ""}
                      {e.billName ? `Paid the bill "${e.billName}". ` : ""}
                      {e.incomeName ? `Received the income "${e.incomeName}".` : ""}
                    </span>
                  )}
                </span>
              </label>
            ))}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.875rem" }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem" }} onClick={() => setStep("choose")}>
                Back
              </button>
              <button type="button" className="btn btn-primary" style={{ flex: 1, minHeight: "2.5rem" }} disabled={loading || !entries} onClick={() => setStep("confirm")}>
                Review ({chosen.size} to delete)
              </button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div>
            <DeletionSummary accountName={accountName} deleted={doomed.length} kept={kept} effects={effects} />
            {balanceNote}
            <p style={{ ...noteStyle, fontWeight: 600 }}>This can&rsquo;t be undone.</p>
            <Err message={error} />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.5rem" }} disabled={pending} onClick={() => setStep(entries ? "pick" : "choose")}>
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                style={{ flex: 1, minHeight: "2.5rem", background: "var(--color-accent-700)", borderColor: "var(--color-accent-700)" }}
                onClick={() =>
                  run(
                    () => deleteAccountAction(accountId, [...chosen]),
                    () => {
                      // The account's page and row are about to go (the refresh
                      // that follows drops them), and this sheet with them -- so
                      // what changed is told by the app-wide sheet instead.
                      setStep("closed");
                      if (afterDelete) router.push(afterDelete);
                      void confirm({ title: `"${accountName}" deleted`, description: summaryText(accountName, doomed.length, kept, effects), confirmLabel: "Done", notice: true });
                    },
                  )
                }
              >
                {pending ? "…" : doomed.length > 0 ? `Delete account and ${doomed.length} ${doomed.length === 1 ? "entry" : "entries"}` : "Delete account"}
              </button>
            </div>
          </div>
        )}

      </FormSheet>
    </>
  );
}

const noteStyle: React.CSSProperties = { fontSize: "0.8125rem", color: "var(--color-neutral-700)", lineHeight: 1.45, margin: "0 0 0.625rem" };

function ChoiceButton({ title, line, danger, disabled, onClick }: { title: string; line: string; danger?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={disabled}
      onClick={onClick}
      style={{ display: "block", textAlign: "left", height: "auto", padding: "0.625rem 0.75rem", whiteSpace: "normal", ...(danger ? { borderColor: "var(--color-accent-700)" } : null) }}
    >
      <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: danger ? "var(--color-accent-700)" : undefined }}>{title}</span>
      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)", marginTop: "0.125rem", fontWeight: 400 }}>{line}</span>
    </button>
  );
}

/** What deleting these entries changes elsewhere, in words: each month's
 * money in and out, any goal's progress, any bill or expected income that
 * opens again. Transfers included: this account's side of one counted as
 * money in or out of it, and goes with it. */
function deletionEffects(doomed: AccountDeletionEntry[], currency: string): string[] {
  const lines: string[] = [];
  const byMonth = new Map<string, { label: string; in: number; out: number; at: number }>();
  for (const e of doomed) {
    const d = new Date(e.occurredAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const m = byMonth.get(key) ?? { label: d.toLocaleDateString("en-PH", { month: "long", year: "numeric" }), in: 0, out: 0, at: d.getTime() };
    if (e.direction === "in") m.in += e.amount;
    else m.out += e.amount;
    byMonth.set(key, m);
  }
  for (const m of [...byMonth.values()].sort((a, b) => b.at - a.at)) {
    if (m.in) lines.push(`${m.label}: money in −${formatCurrency(m.in, currency)}`);
    if (m.out) lines.push(`${m.label}: money out −${formatCurrency(m.out, currency)}`);
  }
  const goals = new Map<string, number>();
  for (const e of doomed) if (e.goalTitle) goals.set(e.goalTitle, (goals.get(e.goalTitle) ?? 0) + e.amount);
  for (const [title, amount] of goals) lines.push(`Goal "${title}": progress −${formatCurrency(amount, currency)}`);
  for (const e of doomed) if (e.billName) lines.push(`Bill "${e.billName}" goes back to unpaid`);
  for (const e of doomed) if (e.incomeName) lines.push(`Income "${e.incomeName}" goes back to expected`);
  return lines;
}

/** The notice shown once it is done: the same facts, as plain lines. */
function summaryText(accountName: string, deleted: number, kept: number, effects: string[]): string {
  return [
    `Gone from every list and balance total.`,
    `${deleted} ${deleted === 1 ? "entry" : "entries"} deleted · ${kept} kept, shown as "${accountName} (deleted)".`,
    ...(effects.length ? ["", "What changed:", ...effects.map((l) => `• ${l}`)] : []),
    "",
    "Other accounts: unchanged.",
  ].join("\n");
}

function DeletionSummary({ accountName, deleted, kept, effects }: { accountName: string; deleted: number; kept: number; effects: string[] }) {
  return (
    <div>
      <p style={noteStyle}>&ldquo;{accountName}&rdquo; will be gone from every list and balance total, and can&rsquo;t be restored.</p>
      <ul style={{ ...noteStyle, paddingLeft: "1.125rem" }}>
        <li>
          <strong>{deleted}</strong> {deleted === 1 ? "entry" : "entries"} to delete
        </li>
        <li>
          <strong>{kept}</strong> {kept === 1 ? "entry" : "entries"} to keep, still counted in the months they happened and shown as &ldquo;{accountName} (deleted)&rdquo;
        </li>
      </ul>
      {effects.length > 0 && (
        <>
          <p style={{ ...noteStyle, fontWeight: 600, marginBottom: "0.25rem" }}>What this changes</p>
          <ul style={{ ...noteStyle, paddingLeft: "1.125rem" }}>
            {effects.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </>
      )}
      <p style={noteStyle}>
        <strong>Other accounts: unchanged.</strong> The other side of every transfer stays where it is.
      </p>
    </div>
  );
}

/** "Include my private accounts in All totals" -- the viewer's own switch,
 * shown on All. Off leaves their private accounts out of All's lists and
 * totals; they still show under their own name. */
export function IncludePrivateToggle({ include }: { include: boolean }) {
  const { error, pending, run } = useMoneyAction();
  return (
    <div style={{ margin: "0.375rem 0 0" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--color-neutral-700)" }}>
        <input type="checkbox" checked={include} disabled={pending} onChange={(e) => run(() => setIncludePrivateInTotalsAction(e.target.checked))} />
        Include my private accounts in All totals
      </label>
      <Err message={error} />
    </div>
  );
}

/** Move money for one account: a single banknote icon on its row, where three MONEY IN / MONEY OUT / TRANSFER buttons used to sit
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

export type AudienceMode = "everyone" | "only_me" | "chosen";

/** The choices for who can see an account: everyone, only you, or people
 * picked one by one from the household -- with a shortcut for all its
 * grown-ups. Controlled; `people` excludes the owner. */
export function AudienceChoices({
  mode,
  chosen,
  people,
  onChange,
  seen = "its balance and movements",
}: {
  mode: AudienceMode;
  chosen: string[];
  people: AccountAudienceMember[];
  onChange: (mode: AudienceMode, chosen: string[]) => void;
  /** What the people chosen get to see (an account's balance, a budget). */
  seen?: string;
}) {
  // Custom stays open while it is the choice, even with nobody ticked yet.
  const [custom, setCustom] = useState(mode === "chosen");
  const pickable = people.filter((p) => p.hasLogin !== false);
  const grownUps = pickable.filter((p) => p.grownUp).map((p) => p.id);
  const ticked = mode === "chosen" ? chosen : [];
  const toggle = (id: string) => {
    const next = ticked.includes(id) ? ticked.filter((c) => c !== id) : [...ticked, id];
    onChange("chosen", next);
  };
  const isCustom = custom || mode === "chosen";

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4375rem" }}>
        <button type="button" className="chip" data-active={!isCustom && mode === "everyone"} onClick={() => { setCustom(false); onChange("everyone", []); }}>
          All grown-ups
        </button>
        <button type="button" className="chip" data-active={!isCustom && mode === "only_me"} onClick={() => { setCustom(false); onChange("only_me", []); }}>
          Only me
        </button>
        <button type="button" className="chip" data-active={isCustom} onClick={() => { setCustom(true); onChange("chosen", mode === "everyone" ? grownUps : chosen); }}>
          Custom
        </button>
      </div>
      {isCustom && (
        <>
          <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.75rem 0 0.375rem" }}>Tick who can see it — you always see it:</div>
          <div style={{ display: "grid", gap: "0.375rem" }}>
            {people.map((p) => {
              const can = p.hasLogin !== false;
              return (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", minHeight: "2rem", opacity: can ? 1 : 0.55 }}>
                  <input type="checkbox" disabled={!can} checked={can && ticked.includes(p.id)} onChange={() => toggle(p.id)} />
                  {p.label}
                  <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
                    {!can ? "· needs their own login to see it" : p.grownUp ? "" : "· child"}
                  </span>
                </label>
              );
            })}
            {people.length === 0 && <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>Nobody else is in the household yet.</span>}
          </div>
        </>
      )}
      <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0.625rem 0 0" }}>
        {isCustom
          ? ticked.length === 0
            ? "Tick at least one person, or choose Only me."
            : `Only you and the people ticked see ${seen}. Nobody else knows it is there.`
          : mode === "everyone"
            ? `Every grown-up in the household sees ${seen}. Children do not — choose Custom to add one.`
            : "Only you see it."}
      </p>
    </div>
  );
}

/** Who can see this account, shown on every account so it is never a guess.
 * The owner of a personal one taps it to choose: everyone, only them, or
 * people picked from the household. */
export function AccountPrivacyToggle({
  accountId,
  isPrivate,
  isJoint,
  ownerId,
  canChange,
  viewers,
  people,
  me,
}: {
  accountId: string;
  isPrivate: boolean;
  isJoint: boolean;
  ownerId: string | null;
  canChange: boolean;
  /** Who it is shared with besides its owner. */
  viewers: string[];
  /** The household, the viewer excluded. */
  people: AccountAudienceMember[];
  me: string;
}) {
  const { error, pending, run } = useMoneyAction();
  const [open, setOpen] = useState(false);
  const startMode: AudienceMode = !isPrivate ? "everyone" : viewers.length ? "chosen" : "only_me";
  const [mode, setMode] = useState<AudienceMode>(startMode);
  const [chosen, setChosen] = useState<string[]>(viewers);

  // Never "Family": Family is the Who for joint accounts (Janine, 12 October).
  const label = accountAudienceLabel({ is_joint: isJoint, is_private: isPrivate, owner_member_id: ownerId }, viewers, people, me);
  const icon = isJoint || !isPrivate || viewers.length ? "users" : "keyRound";
  const look = { display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.6875rem", color: "var(--color-neutral-700)" } as const;

  if (isJoint || !canChange) {
    return (
      <span style={{ ...look, color: "var(--color-neutral-600)" }}>
        <Icon name={icon} size={12} />
        {label}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          // The row is a link to the account; this is not part of following it.
          e.preventDefault();
          e.stopPropagation();
          setMode(startMode);
          setChosen(viewers);
          setOpen(true);
        }}
        title="Who can see this account. Tap to choose."
        style={{
          ...look,
          padding: "0.125rem 0.5rem",
          borderRadius: 999,
          border: 0,
          cursor: "pointer",
          fontFamily: "var(--font-body)",
          background: isPrivate ? "color-mix(in srgb, var(--color-text) 8%, transparent)" : "color-mix(in srgb, var(--color-switch-on) 18%, transparent)",
        }}
      >
        <Icon name={icon} size={12} />
        {pending ? "…" : label}
      </button>
      {/* The row is a link; nothing in the sheet (a portal, but still inside
          it in React's tree) may bubble up and follow it. */}
      <span onClick={(e) => e.stopPropagation()}>
        <FormSheet open={open} onClose={() => setOpen(false)} title="Who can see this account">
          <AudienceChoices
            mode={mode}
            chosen={chosen}
            people={people}
            onChange={(m, c) => {
              setMode(m);
              setChosen(c);
            }}
          />
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
            onClick={() => run(() => setAccountVisibilityAction(accountId, { mode, memberIds: chosen }), () => setOpen(false))}
          >
            {pending ? "…" : "Save"}
          </button>
        </FormSheet>
      </span>
    </>
  );
}

/** "Pay card" on a credit card (Jonathan, 28 October): what is owed, the
 * minimum, or another amount, from a bank or e-wallet, as one transfer --
 * the card's balance and the bank's move together. Today's Pay row opens it
 * straight away (`autoOpen`). Paid in the bank's app, it waits as pending
 * until confirmed, like any transfer made there. */
export function PayCardControl({ cardId, cardName, owed, minimum, accounts, currency, autoOpen = false }: { cardId: string; cardName: string; owed: number; minimum: number | null; accounts: PickableAccount[]; currency: string; autoOpen?: boolean }) {
  const uid = useId();
  const from = accounts.filter((a) => a.id !== cardId && a.account_type !== "credit");
  const [open, setOpen] = useState(autoOpen);
  const [choice, setChoice] = useState<"owed" | "minimum" | "other">("owed");
  const [other, setOther] = useState(owed);
  const [accountId, setAccountId] = useState(from[0]?.id ?? "");
  const [viaApp, setViaApp] = useState(true);
  const { error, pending, run, entryId } = useMoneyAction();
  const amount = choice === "owed" ? owed : choice === "minimum" && minimum ? minimum : other;
  const radio = { display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", minHeight: "2rem" } as const;
  return (
    <>
      <button type="button" className="btn btn-primary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginBottom: "0.5rem" }} onClick={() => setOpen(true)}>
        Pay card · {formatCurrency(owed, currency)} owed
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={`Pay ${cardName}`}>
        <div role="radiogroup" aria-label="Amount" style={{ marginBottom: "0.5rem" }}>
          <label style={radio}>
            <input type="radio" name={`${uid}-amt`} checked={choice === "owed"} onChange={() => setChoice("owed")} />
            All that is owed · {formatCurrency(owed, currency)}
          </label>
          {minimum ? (
            <label style={radio}>
              <input type="radio" name={`${uid}-amt`} checked={choice === "minimum"} onChange={() => setChoice("minimum")} />
              The minimum · {formatCurrency(minimum, currency)}
            </label>
          ) : null}
          <label style={radio}>
            <input type="radio" name={`${uid}-amt`} checked={choice === "other"} onChange={() => setChoice("other")} />
            Another amount
          </label>
          {choice === "other" && <AmountInput ariaLabel="Amount" defaultValue={other} onValueChange={setOther} style={{ minHeight: "2.5rem", marginTop: "0.25rem" }} />}
        </div>
        <div className="field" style={{ marginBottom: "0.5rem" }}>
          <label htmlFor={`${uid}-from`}>Pay from</label>
          <AccountSelect id={`${uid}-from`} accounts={from} value={accountId} onChange={setAccountId} currency={currency} />
        </div>
        <label style={{ ...radio, marginBottom: "0.25rem" }}>
          <input type="checkbox" checked={viaApp} onChange={(e) => setViaApp(e.target.checked)} />
          Paying it in the bank&apos;s app now (it waits until you confirm it went through)
        </label>
        {from.length === 0 && <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>Add the bank or e-wallet it is paid from on the Accounts tab first.</p>}
        {error && (
          <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !accountId || !(amount > 0)}
          style={{ width: "100%", minHeight: "2.5rem", fontSize: "0.84375rem", marginTop: "0.75rem" }}
          onClick={() => run(() => transferAction({ fromAccountId: accountId, toAccountId: cardId, amount, note: `Paid ${cardName}`, occurredAt: null, viaApp, clientIds: { out: entryId("card-out"), in: entryId("card-in") } }), () => setOpen(false))}
        >
          {pending ? "…" : `Pay ${formatCurrency(amount > 0 ? amount : 0, currency)}`}
        </button>
      </FormSheet>
    </>
  );
}

/** "Match the bank" on an account's page (29 October): type what the bank
 * or e-wallet app shows, see the difference, and Kin records it as one
 * entry (matchBankBalanceAction). A card asks for what is owed. Today's
 * monthly row opens it straight away (`autoOpen`, ?match=1). */
export function MatchBankControl({ accountId, accountName, balance, kind, currency, autoOpen = false }: { accountId: string; accountName: string; balance: number; kind: string; currency: string; autoOpen?: boolean }) {
  const credit = kind === "credit";
  const source = credit ? "card statement says you owe" : kind === "cash" ? "cash actually there when you count it" : "bank or e-wallet app shows";
  const [open, setOpen] = useState(autoOpen);
  const [typed, setTyped] = useState<number | null>(null);
  const { error, pending, run, entryId } = useMoneyAction();
  const shown = credit ? -balance : balance;
  const target = typed === null ? null : credit ? -Math.abs(typed) : typed;
  const diff = target === null ? null : Math.round((target - balance) * 100) / 100;
  return (
    <>
      <button type="button" className="btn btn-ghost" style={{ minHeight: "2rem", fontSize: "0.8125rem", padding: "0 0.5rem" }} onClick={() => setOpen(true)}>
        {kind === "cash" ? "Count the cash" : "Match the bank"}
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={`Match ${accountName} to the bank`}>
        <p style={{ fontSize: "0.84375rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 0.625rem" }}>
          Kin shows {formatCurrency(shown, currency)}{credit ? " owed" : ""}. Type what the {source}, and Kin records the difference so the two agree from today.
        </p>
        <AmountInput ariaLabel={credit ? "What the card says you owe" : "What the bank shows"} onValueChange={setTyped} style={{ minHeight: "2.5rem", width: "100%" }} />
        {diff !== null && (
          <p role="status" style={{ fontSize: "0.8125rem", margin: "0.5rem 0 0", color: "var(--color-neutral-700)" }}>
            {diff === 0 ? "They already agree." : `${diff > 0 ? "Adds" : "Takes off"} ${formatCurrency(Math.abs(diff), currency)}, recorded today as "Matched to the bank's balance". It is not counted as income or spending.`}
          </p>
        )}
        {error && (
          <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || typed === null || diff === 0}
          style={{ width: "100%", minHeight: "2.5rem", fontSize: "0.84375rem", marginTop: "0.75rem" }}
          onClick={() => typed !== null && run(() => matchBankBalanceAction({ accountId, bankBalance: typed, clientId: entryId("match") }), () => setOpen(false))}
        >
          {pending ? "…" : "Match it"}
        </button>
      </FormSheet>
    </>
  );
}

/** "Add a running cost" on an asset (Jonathan, 28 October): a condo's
 * association dues, its amilyar, a car's insurance and registration, as a
 * repeating bill against the asset. Today and the calendar remind on its
 * day; paying it records upkeep on the asset, and "Add the next one?"
 * carries it to the next month or year. */
export function AddRunningCostControl({ assetId, assetName, kind, whose, currency, today }: { assetId: string; assetName: string; kind: string; whose: string; currency: string; today: string }) {
  const uid = useId();
  const presets = RUNNING_COST_PRESETS[kind] ?? [];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Housing");
  const [recurrence, setRecurrence] = useState<RunningCostRepeat>("monthly");
  const [amount, setAmount] = useState(0);
  const [due, setDue] = useState("");
  const { error, pending, run } = useMoneyAction();
  const field = { minHeight: "2.5rem", width: "100%" } as const;
  const save = () => {
    const f = new FormData();
    f.set("name", name.trim());
    f.set("amount", String(amount));
    f.set("due_date", due);
    f.set("category", category);
    f.set("recurrence", recurrence);
    f.set("against", `assets:${assetId}`);
    f.set("whose", whose);
    // A yearly cost is reminded two weeks ahead: time to get the money or
    // the renewal papers together. A month's comes three days ahead.
    f.set("remind_days_before", recurrence === "monthly" ? "3" : "14");
    run(() => addBillAction({ error: null }, f), () => {
      setOpen(false);
      setName("");
      setAmount(0);
      setDue("");
    });
  };
  return (
    <>
      <button type="button" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem" }} onClick={() => setOpen(true)}>
        Add a running cost
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title={`A running cost of ${assetName}`}>
        {presets.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.75rem" }}>
            {presets.map((p) => (
              <button
                key={p.name}
                type="button"
                className="chip"
                data-active={name === p.name}
                onClick={() => {
                  setName(p.name);
                  setCategory(p.category);
                  setRecurrence(p.recurrence);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="field" style={{ marginBottom: "0.625rem" }}>
          <label htmlFor={`${uid}-name`}>What it is</label>
          <input id={`${uid}-name`} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Association dues, parking, insurance" maxLength={150} style={field} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.625rem", marginBottom: "0.625rem" }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-amount`}>Amount ({currencySymbol(currency)})</label>
            <AmountInput id={`${uid}-amount`} ariaLabel="Amount" defaultValue={amount || undefined} onValueChange={setAmount} style={field} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`${uid}-every`}>How often</label>
            <select id={`${uid}-every`} className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value as RunningCostRepeat)} style={field}>
              <option value="monthly">Every month</option>
              <option value="quarterly">Every 3 months</option>
              <option value="yearly">Every year</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: "0.5rem" }}>
          <label htmlFor={`${uid}-due`}>Next due</label>
          <DateInput id={`${uid}-due`} className="input" value={due} min={today} onChange={(e) => setDue(e.target.value)} style={field} />
        </div>
        {amount > 0 && recurrence !== "monthly" && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.5rem" }}>About {formatCurrency(costPerMonth(amount, recurrence), currency)} a month.</p>
        )}
        {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0 0 0.5rem" }}>{error}</p>}
        <button type="button" className="btn btn-primary btn-block" disabled={pending || !name.trim() || !(amount > 0) || !due} onClick={save} style={{ minHeight: "2.75rem" }}>
          {pending ? "Adding…" : "Add running cost"}
        </button>
      </FormSheet>
    </>
  );
}

/** One row of "Waiting on you" (Jonathan, 29 October): what it is, how it
 * stands and what it comes to; tapped, the same sheet wherever the row is
 * -- Accounts, Cash Flow, A&L or Goals -- with what it is about, who it
 * waits on, and the action owed on it right there. `sheet` is built on the
 * server (components/waiting-on-you.tsx). */
export function WaitingRow({
  title,
  meta,
  amount,
  badge,
  currency,
  autoOpen = false,
  quick,
  snoozeKey,
  sheet,
}: {
  title: string;
  meta: string;
  amount?: number;
  badge?: string;
  currency: string;
  autoOpen?: boolean;
  /** The one action a simple item needs, right on the row (Jonathan, 29
   * October), so paying a bill doesn't take a sheet first. */
  quick?: React.ReactNode;
  /** "Not now" in the sheet: away for 30 days (snoozeWaitingAction). */
  snoozeKey?: string;
  sheet: React.ReactNode;
}) {
  const [open, setOpen] = useState(autoOpen);
  const { error, pending, run } = useMoneyAction();
  return (
    <>
      <div style={{ borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: "0.625rem", padding: quick ? "0.625rem 0 0.375rem" : "0.625rem 0", background: "none", border: 0, color: "inherit", textAlign: "left", cursor: "pointer", font: "inherit" }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "0.875rem", display: "block" }}>{title}</span>
          <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{meta}</span>
        </span>
        {badge && <span style={{ flex: "none", font: "600 0.75rem/1 var(--font-numeric)", color: "var(--color-accent-700)", padding: "0.3125rem 0.5rem", borderRadius: 999, background: "color-mix(in srgb, var(--color-text) 6%, transparent)" }}>{badge}</span>}
        {amount != null && <span style={{ flex: "none", fontFamily: "var(--font-numeric)", fontSize: "0.8125rem" }}>{formatCurrency(amount, currency)}</span>}
        <span aria-hidden="true" style={{ flex: "none", color: "var(--color-neutral-600)" }}>›</span>
      </button>
      {/* Under the words, not beside them: a phone's row has no room for both. */}
      {quick && <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", paddingBottom: "0.625rem" }}>{quick}</div>}
      </div>
      <FormSheet open={open} onClose={() => setOpen(false)} title={title} guardUnsaved={false}>
        {sheet}
        {snoozeKey && (
          <div style={{ marginTop: "0.875rem", paddingTop: "0.625rem", borderTop: "1px solid var(--color-divider)", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => run(() => snoozeWaitingAction(snoozeKey), () => setOpen(false))} style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.6875rem" }}>
              {pending ? "Putting away…" : "Not now"}
            </button>
            <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>Off your list for 30 days; back after that if it still stands.</span>
            {error && <p role="alert" style={{ fontSize: "0.75rem", color: "var(--color-accent-700)", margin: 0, width: "100%" }}>{error}</p>}
          </div>
        )}
      </FormSheet>
    </>
  );
}

/** "Remind" on a shared goal's deposit: one push to the person who hasn't
 * put in yet, sent once from here. */
export function RemindButton({ goalId, memberId, name }: { goalId: string; memberId: string; name: string }) {
  const [sent, setSent] = useState(false);
  const { error, pending, run } = useMoneyAction();
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: "0.25rem" }}>
      <button type="button" className="btn btn-secondary" disabled={pending || sent} onClick={() => run(() => remindDepositAction(goalId, memberId), () => setSent(true))} style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.6875rem" }}>
        {sent ? `Reminded ${name} ✓` : pending ? "Sending…" : `Remind ${name}`}
      </button>
      {error && <span role="alert" style={{ fontSize: "0.75rem", color: "var(--color-accent-700)" }}>{error}</span>}
    </span>
  );
}
