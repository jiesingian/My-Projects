"use client";

import { useId } from "react";
import type { SplitLoan } from "@/components/loan-split";

/** What an expense can be for: the household's assets, goals and loans
 * with something still owed (getAttributableTargets). */
export type ExpenseTargets = { assets: { id: string; name: string }[]; goals: { id: string; name: string }[]; loans: SplitLoan[] };

/** "For (optional)": a loan it pays down, an asset, a goal -- the same
 * choice Move money offers, on Add expense (both halves), the receipt
 * scanner and Edit entry. Nothing to pick from: nothing shown. The value
 * is "liabilities:<id>", "assets:<id>", "goals:<id>" or "" for nothing in
 * particular; with `name` it is submitted under that field for a <form
 * action>. `loans` off hides the loans (money in is never a loan payment). */
export function ForSelect({
  targets,
  value,
  onChange,
  name,
  label = "For (optional)",
  loans = true,
  style,
}: {
  targets: ExpenseTargets;
  value: string;
  onChange: (v: string) => void;
  name?: string;
  label?: string;
  loans?: boolean;
  style?: React.CSSProperties;
}) {
  const id = useId();
  const loanList = loans ? targets.loans : [];
  if (targets.assets.length + targets.goals.length + loanList.length === 0) return null;
  return (
    <div className="field" style={{ marginBottom: "0.75rem", ...style }}>
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" name={name} value={value} onChange={(e) => onChange(e.target.value)} style={{ minHeight: "2.625rem" }}>
        <option value="">Nothing in particular</option>
        {loanList.length > 0 && (
          <optgroup label="Paying a loan">
            {loanList.map((l) => (
              <option key={l.id} value={`liabilities:${l.id}`}>
                {l.name}
              </option>
            ))}
          </optgroup>
        )}
        {targets.assets.length > 0 && (
          <optgroup label="An asset">
            {targets.assets.map((a) => (
              <option key={a.id} value={`assets:${a.id}`}>
                {a.name}
              </option>
            ))}
          </optgroup>
        )}
        {targets.goals.length > 0 && (
          <optgroup label="A goal">
            {targets.goals.map((g) => (
              <option key={g.id} value={`goals:${g.id}`}>
                {g.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
