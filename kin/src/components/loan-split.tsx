"use client";

import { AmountInput } from "@/components/amount-input";
import { formatCurrency } from "@/lib/format";
import { loanPaymentSplit } from "@/lib/wealth";

/** A loan, as far as splitting a payment on it needs (getAttributableTargets). */
export type SplitLoan = { id: string; name: string; balance: number; interestRate: number | null; monthlyPayment: number | null };

/** A loan payment is two things (20261023220000): interest, the cost, and
 * principal, which only pays the loan down. Kin works out the split from
 * the loan's rate on what is still owed; the bank's own statement wins if
 * it says otherwise, so the principal is there to change (Jonathan, 26
 * October: on Add expense and Settle, as Move money has had it).
 *
 * `override` is what the person typed, null to follow Kin's split as the
 * amount changes; the box remounts its field on a new amount so the
 * default follows. With `name`, the principal is submitted under it for a
 * <form action>; the Settle sheet, holding it in state, leaves `name` off. */
export function LoanSplitBox({
  loan,
  amount,
  currency,
  override,
  onOverride,
  name,
}: {
  loan: SplitLoan;
  amount: number;
  currency: string;
  override: number | null;
  onOverride: (v: number) => void;
  name?: string;
}) {
  const split = loanPaymentSplit(loan.balance, loan.interestRate, amount);
  const principal = override ?? split.principal;
  const interest = Math.max(0, Math.round((amount - principal) * 100) / 100);
  return (
    <div style={{ border: "1px solid var(--color-divider)", borderRadius: 10, padding: "0.75rem", margin: "0 0 0.75rem", fontSize: "0.8125rem" }}>
      <div style={{ color: "var(--color-neutral-600)", marginBottom: "0.5rem" }}>
        {formatCurrency(loan.balance, currency)} still owed on {loan.name}
        {loan.interestRate != null ? ` · ${loan.interestRate}% a year` : " · no interest rate saved, so all of it pays the loan down"}
      </div>
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, margin: 0 }}>
          <label>Pays the loan down</label>
          <AmountInput key={`${loan.id}-${amount}`} name={name} ariaLabel="Pays the loan down" defaultValue={principal} onValueChange={onOverride} style={{ minHeight: "2.5rem" }} />
        </div>
        <div style={{ flex: 1, paddingBottom: "0.625rem" }}>
          <div style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)" }}>Interest (the cost)</div>
          <div style={{ fontFamily: "var(--font-numeric)", fontWeight: 600 }}>{formatCurrency(interest, currency)}</div>
        </div>
      </div>
      <div style={{ color: "var(--color-neutral-600)", marginTop: "0.375rem" }}>
        After this, {formatCurrency(Math.max(0, Math.round((loan.balance - principal) * 100) / 100), currency)} will be owed. Only the interest lowers your net worth.
      </div>
    </div>
  );
}
