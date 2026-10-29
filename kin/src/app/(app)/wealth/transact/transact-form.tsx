"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordMovementAction, transferAction } from "@/lib/actions/wealth";
import { ASSET_ITEM_KINDS, ASSET_ITEM_KIND_LABELS, categoryLabel, EXPENSE_CATEGORIES, INCOME_SOURCES, loanPaymentSplit, type WhoseOption } from "@/lib/wealth";
import type { PayableLoan } from "@/lib/queries/wealth";
import { formatCurrency } from "@/lib/format";
import { WhoseSelect } from "@/components/whose-select";
import { currencySymbol } from "@/lib/format";
import { ErrorText } from "@/components/form";
import type { PickableAccount } from "@/components/money-actions";
import { AccountOptions } from "@/components/account-options";
import { DateInput } from "@/components/date-input";
import { AmountInput } from "@/components/amount-input";
import { RequiredMark } from "@/components/form";
import { AccountNumber } from "@/components/account-number";
import { failedSaveMessage, newOpId, sendOrQueue, useQueue } from "@/lib/offline/live";
import type { QueuedOp } from "@/lib/offline/types";

const MODES = ["in", "out", "transfer"] as const;
type Mode = (typeof MODES)[number];
const MODE_LABELS: Record<Mode, string> = { in: "Money in", out: "Money out", transfer: "Transfer" };

export function TransactForm({
  accounts,
  currency,
  defaultMode,
  defaultAccountId,
  accountNumbers = {},
  assets,
  goals,
  loans = [],
  defaultAgainst,
  defaultParticulars,
  defaultAmount,
  whose: whoseChoices,
  today,
}: {
  accounts: PickableAccount[];
  currency: string;
  defaultMode: string;
  /** The account this was opened from, chosen to start with. Ignored if it
   * isn't one of `accounts` -- archived, or not the viewer's to see. */
  defaultAccountId?: string;
  /** Numbers of the accounts the viewer may see them for, by id -- shown in
   * Transfer with Copy, to paste into the bank's app. */
  accountNumbers?: Record<string, string>;
  assets: { id: string; name: string }[];
  goals: { id: string; name: string }[];
  /** Loans with something still owed, to pay down (20261023220000). */
  loans?: PayableLoan[];
  /** "liabilities:<id>" from a loan's own "Record a payment". */
  defaultAgainst?: string;
  /** Carried in from a chat message someone chose to record as money. A
   * starting point only: nothing moves until they press the button. */
  defaultParticulars?: string;
  defaultAmount?: number;
  /** "Whose is it?" -- You, each household member, Family (joint). */
  whose: WhoseOption[];
  /** Today in the household's zone, from the server, so the date box renders
   * the same day on both sides of hydration (React error #418 otherwise,
   * whenever the browser's zone was on a different day). */
  today: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>((MODES as readonly string[]).includes(defaultMode) ? (defaultMode as Mode) : "in");
  const startId = accounts.some((a) => a.id === defaultAccountId) ? defaultAccountId! : (accounts[0]?.id ?? "");
  const [accountId, setAccountId] = useState(startId);
  const [toAccountId, setToAccountId] = useState(accounts.find((a) => a.id !== startId)?.id ?? startId);
  const startLoan = defaultAgainst?.startsWith("liabilities:") ? loans.find((l) => `liabilities:${l.id}` === defaultAgainst) : undefined;
  const [amount, setAmount] = useState<number>(defaultAmount ?? startLoan?.monthlyPayment ?? 0);
  // Remounts the amount box when a loan fills it in.
  const [amountKey, setAmountKey] = useState(0);
  const [particulars, setParticulars] = useState(defaultParticulars ?? (startLoan ? `${startLoan.name} payment` : ""));
  const [category, setCategory] = useState<string>(startLoan ? "Debt" : INCOME_SOURCES[0]);
  const [occurredOn, setOccurredOn] = useState(today);
  const [viaApp, setViaApp] = useState(true);
  const [whose, setWhose] = useState("me");
  // "assets:<id>", "goals:<id>" or "liabilities:<id>", or empty for the
  // ordinary case where the money is not tied to any.
  const [against, setAgainst] = useState(startLoan ? `liabilities:${startLoan.id}` : "");
  // Paying a loan: the part that pays it down, when the person changed
  // Kin's split; null follows the split as the amount changes.
  const [principalOverride, setPrincipalOverride] = useState<number | null>(null);
  // Money out for an asset: buying it, adding to it, or upkeep
  // (20261023232000). Upkeep, the everyday case, unless they say otherwise.
  const [assetUse, setAssetUse] = useState<"buy" | "add" | "upkeep">("upkeep");
  const [itemKind, setItemKind] = useState<string>("improvement");
  const loan = against.startsWith("liabilities:") ? loans.find((l) => `liabilities:${l.id}` === against) : undefined;
  const split = loan ? loanPaymentSplit(loan.balance, loan.interestRate, amount) : null;
  const principal = split ? (principalOverride ?? split.principal) : null;

  function pickAgainst(value: string) {
    setAgainst(value);
    setPrincipalOverride(null);
    const picked = value.startsWith("liabilities:") ? loans.find((l) => `liabilities:${l.id}` === value) : undefined;
    if (!picked) return;
    setCategory("Debt");
    if (!(amount > 0) && picked.monthlyPayment) {
      setAmount(picked.monthlyPayment);
      setAmountKey((k) => k + 1);
    }
    if (!particulars.trim()) setParticulars(`${picked.name} payment`);
  }
  const [error, setError] = useState<string | null>(null);
  // Which field the error is about, so it is outlined in red and focused
  // rather than only named at the top (Janine, 12 October).
  const [bad, setBad] = useState<"amount" | "particulars" | null>(null);
  const [pending, startTransition] = useTransition();
  // The entry's ids, made on the phone at the first try and kept until it
  // saves or is queued: a retry after "Load failed" (a weak signal, the
  // answer lost on its way back) then finds the first save rather than
  // recording the money twice (28 October).
  const ids = useRef<{ id: string; inId: string } | null>(null);
  // Said under the button once an entry is waiting on the phone.
  const [queuedNote, setQueuedNote] = useState<string | null>(null);
  const waiting = useQueue().filter((q) => q.kind === "money.record" || q.kind === "money.transfer").length;

  const account = accounts.find((a) => a.id === accountId);
  const canUseApp = !!account?.linked_app_url;

  function switchMode(next: Mode) {
    setMode(next);
    setCategory(next === "in" ? INCOME_SOURCES[0] : EXPENSE_CATEGORIES[0]);
    // A loan is only ever paid with money going out.
    if (next !== "out" && against.startsWith("liabilities:")) setAgainst("");
  }

  function submit() {
    setError(null);
    setBad(null);
    const missing = mode !== "transfer" && !particulars.trim() ? "particulars" : !(amount > 0) ? "amount" : null;
    if (missing) {
      setError(missing === "particulars" ? "Say what this is for." : "Enter an amount greater than zero.");
      setBad(missing);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-field="${missing}"] .input`)?.focus());
      return;
    }
    setQueuedNote(null);
    startTransition(async () => {
      const occurredAt = new Date(`${occurredOn}T${new Date().toTimeString().slice(0, 8)}`).toISOString();
      const through = viaApp && canUseApp;
      const { id, inId } = (ids.current ??= { id: newOpId(), inId: newOpId() });
      const label = `${particulars.trim() || MODE_LABELS[mode]} (${formatCurrency(amount, currency)})`;
      const entry = {
        accountId,
        direction: mode === "in" ? ("in" as const) : ("out" as const),
        amount,
        particulars,
        category,
        occurredAt,
        againstTable: against ? (against.split(":")[0] as "assets" | "goals" | "liabilities") : null,
        againstId: against ? against.split(":")[1] : null,
        principal: loan ? principal : null,
        assetUse: mode === "out" && against.startsWith("assets:") ? assetUse : undefined,
        assetItemKind: assetUse === "add" ? itemKind : undefined,
        whose,
      };
      const transfer = { fromAccountId: accountId, toAccountId, amount, note: particulars, occurredAt };
      const op = (): QueuedOp =>
        mode === "transfer"
          ? { id, inId, at: new Date().toISOString(), kind: "money.transfer", ...transfer, label }
          : { id, at: new Date().toISOString(), kind: "money.record", ...entry, label };
      const send = () =>
        mode === "transfer"
          ? transferAction({ ...transfer, viaApp: through, clientIds: { out: id, in: inId } })
          : recordMovementAction({ ...entry, viaApp: through, clientId: id });

      // Through a banking app it cannot wait: the app needs a signal too.
      // Without one the form stays as it was, to try again.
      if (through) {
        let res: Awaited<ReturnType<typeof send>>;
        try {
          res = await send();
        } catch (e) {
          // It may have saved; a second try is safe (the ids above).
          setError(failedSaveMessage(e, true));
          return;
        }
        if (res.error) {
          setError(res.error);
          return;
        }
        ids.current = null;
        if (res.appUrl) window.open(res.appUrl, "_blank", "noopener,noreferrer");
        router.push(`/wealth/accounts/${accountId}`);
        router.refresh();
        return;
      }

      // Otherwise, with no signal it waits on the phone and saves on
      // reconnect (lib/offline/live), as Health's dose ticks do.
      const res = await sendOrQueue(send, op);
      if (res.error) {
        setError(res.error);
        return;
      }
      ids.current = null;
      if (res.queued) {
        // Cleared, so the same money is not entered a second time by hand.
        setAmount(0);
        setAmountKey((k) => k + 1);
        setParticulars("");
        setPrincipalOverride(null);
        setQueuedNote(`No signal — ${label} is kept on this phone and will be recorded when you’re back online.`);
        return;
      }
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
          <AccountOptions accounts={accounts} currency={currency} />
        </select>
      </Field>

      {mode === "transfer" && (
        <Field label="To account">
          <select className="input" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} style={{ minHeight: "2.75rem" }}>
            <AccountOptions accounts={accounts} currency={currency} />
          </select>
        </Field>
      )}
      {/* The number to paste into the bank's app when sending the transfer. */}
      {mode === "transfer" && accountNumbers[toAccountId] && (
        <div style={{ margin: "-0.375rem 0 0.875rem" }}>
          <AccountNumber number={accountNumbers[toAccountId]} label="To account no." />
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem" }}>
        <Field label={`Amount (${currencySymbol(currency)})`} style={{ flex: 1 }} required name="amount">
          <AmountInput key={amountKey} defaultValue={amount || (amountKey === 0 ? defaultAmount : undefined)} onValueChange={(v) => { setAmount(v); setPrincipalOverride(null); if (bad === "amount") setBad(null); }} style={{ minHeight: "2.75rem" }} required invalid={bad === "amount"} />
        </Field>
        <Field label="Date" style={{ flex: 1 }}>
          <DateInput className="input" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} style={{ minHeight: "2.75rem" }} />
        </Field>
      </div>

      {/* Which account the money moved through was always recorded. What it
          was *for* was not, unless a hub posted it -- so a payment on the car
          and a contribution to a savings goal both landed as anonymous
          expenses. Optional, because most payments are neither. */}
      {mode !== "transfer" && (assets.length > 0 || goals.length > 0 || (mode === "out" && loans.length > 0)) && (
        <Field label={mode === "in" ? "INCOME FROM (OPTIONAL)" : "FOR (OPTIONAL)"}>
          <select className="input" value={against} onChange={(e) => pickAgainst(e.target.value)} style={{ minHeight: "2.75rem" }}>
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
            {mode === "out" && loans.length > 0 && (
              <optgroup label="Paying a loan">
                {loans.map((l) => (
                  <option key={l.id} value={`liabilities:${l.id}`}>
                    {l.name}
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

      {/* Money spent on an asset is one of three things (20261023232000):
          buying it or a down payment (its value is already on record, so
          this only moves cash into it), adding to it (it becomes one of the
          asset's items and the asset is worth more), or upkeep -- the only
          one that is a living cost. */}
      {mode === "out" && against.startsWith("assets:") && (
        <div style={{ border: "1px solid var(--color-divider)", borderRadius: 10, padding: "0.75rem", margin: "0 0 14px", fontSize: "0.8125rem" }}>
          <div role="radiogroup" aria-label="What was it?" style={{ display: "grid", gap: "0.375rem" }}>
            {([
              ["upkeep", "Upkeep", "Repairs, dues, insurance, fuel -- a living cost."],
              ["add", "Adding to it", "A renovation, an appliance, an upgrade -- it is now worth more."],
              ["buy", "Buying it, or a down payment", "Its value is already on record; this only moves cash into it."],
            ] as const).map(([value, label, hint]) => (
              <label key={value} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" name="asset_use" value={value} checked={assetUse === value} onChange={() => setAssetUse(value)} style={{ marginTop: "0.1875rem" }} />
                <span>
                  <span style={{ fontWeight: 600, display: "block" }}>{label}</span>
                  <span style={{ color: "var(--color-neutral-600)" }}>{hint}</span>
                </span>
              </label>
            ))}
          </div>
          {assetUse === "add" && (
            <Field label="WHAT KIND" style={{ marginTop: "0.625rem", marginBottom: 0 }}>
              <select className="input" value={itemKind} onChange={(e) => setItemKind(e.target.value)} style={{ minHeight: "2.5rem" }}>
                {ASSET_ITEM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_ITEM_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {assetUse !== "upkeep" && (
            <div style={{ color: "var(--color-neutral-600)", marginTop: "0.5rem" }}>
              {assetUse === "add"
                ? "Not a living cost: the asset will be worth this much more."
                : "Not a living cost: it is part of the asset's value you already entered."}
            </div>
          )}
        </div>
      )}

      {/* A loan payment is two things (20261023220000): interest, the cost,
          and principal, which only pays the loan down. Kin works out the
          split from the loan's rate on what is still owed; the bank's own
          statement wins if it says otherwise. */}
      {loan && split && principal !== null && (
        <div style={{ border: "1px solid var(--color-divider)", borderRadius: 10, padding: "0.75rem", margin: "0 0 14px", fontSize: "0.8125rem" }}>
          <div style={{ color: "var(--color-neutral-600)", marginBottom: "0.5rem" }}>
            {formatCurrency(loan.balance, currency)} still owed
            {loan.interestRate != null ? ` · ${loan.interestRate}% a year` : " · no interest rate saved, so all of it pays the loan down"}
          </div>
          <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-end" }}>
            <Field label="PAYS THE LOAN DOWN" style={{ flex: 1 }}>
              <AmountInput key={`${against}-${amountKey}-${amount}`} defaultValue={principal} onValueChange={(v) => setPrincipalOverride(v)} style={{ minHeight: "2.5rem" }} />
            </Field>
            <div style={{ flex: 1, paddingBottom: "0.625rem" }}>
              <div style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)" }}>INTEREST (THE COST)</div>
              <div style={{ fontFamily: "var(--font-numeric)", fontWeight: 600 }}>{formatCurrency(Math.max(0, Math.round((amount - principal) * 100) / 100), currency)}</div>
            </div>
          </div>
          <div style={{ color: "var(--color-neutral-600)", marginTop: "0.375rem" }}>
            After this, {formatCurrency(Math.max(0, Math.round((loan.balance - principal) * 100) / 100), currency)} will be owed. Only the interest lowers your net worth.
          </div>
        </div>
      )}

      {mode !== "transfer" && (
        <Field label="CATEGORY">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: "2.75rem" }}>
            {(mode === "in" ? INCOME_SOURCES : EXPENSE_CATEGORIES).map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Field>
      )}

      {mode !== "transfer" && (
        <Field label="WHOSE IS IT?">
          <WhoseSelect options={whoseChoices} value={whose} onChange={setWhose} />
        </Field>
      )}

      {/* Money in names its source -- "Category - Source" on Cash Flow. */}
      <Field label={mode === "in" ? "Source" : "Particulars"} required={mode !== "transfer"} name="particulars">
        <input
          className="input"
          value={particulars}
          aria-required={mode !== "transfer" || undefined}
          aria-invalid={bad === "particulars" || undefined}
          onChange={(e) => {
            setParticulars(e.target.value);
            if (bad === "particulars") setBad(null);
          }}
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

      {(queuedNote || waiting > 0) && (
        <p role="status" style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", marginTop: "0.625rem" }}>
          {queuedNote ?? `${waiting} ${waiting === 1 ? "entry is" : "entries are"} waiting on this phone, to be recorded when you’re back online.`}
        </p>
      )}

      {viaApp && canUseApp && (
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>
          Kin holds this as pending and leaves your balance alone until you come back and confirm it went through.
        </p>
      )}
    </div>
  );
}

function Field({ label, children, style, required, name }: { label: string; children: React.ReactNode; style?: React.CSSProperties; required?: boolean; name?: string }) {
  return (
    <div className="field" data-field={name} style={{ marginBottom: "0.875rem", ...style }}>
      <label>
        {label}
        {required && <RequiredMark />}
        {children}
      </label>
    </div>
  );
}
