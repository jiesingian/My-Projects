"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";

export type CashFlowPoint = { key: string; label: string; income: number; expense: number };

/** Cash Flow's headline numbers used to live apart from the graph -- a big
 * hero figure above it, three flat boxes below it. They live on the graph
 * now: in and out are the bars' own two colours, and net is the third
 * colour in the summary line above them, which updates to whichever
 * period's bar was last tapped. Opens on the current period selected, so
 * the numbers are never empty on first look -- `history` is oldest first,
 * so that is the last entry. */
export function CashFlowChart({ history, currency, periodNoun }: { history: CashFlowPoint[]; currency: string; periodNoun: string }) {
  const [selected, setSelected] = useState(Math.max(0, history.length - 1));
  const point = history[selected] ?? history[history.length - 1] ?? { key: "", label: "", income: 0, expense: 0 };
  const net = point.income - point.expense;
  const peak = Math.max(1, ...history.flatMap((h) => [h.income, h.expense]));

  if (history.length === 0) return null;

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p className="sr-only">Cash flow by {periodNoun}, {history.length} periods. Each bar below is a button announcing that period&rsquo;s in, out and net.</p>

      <div aria-live="polite" style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "0.375rem 1rem", marginBottom: "0.75rem" }}>
        <span style={{ font: "600 0.9375rem/1.15 var(--font-heading)" }}>{point.label}</span>
        {[
          { k: "IN", v: point.income, color: "var(--color-accent)" },
          { k: "OUT", v: point.expense, color: "color-mix(in srgb, var(--color-text) 40%, transparent)" },
          { k: "NET", v: net, color: "var(--color-accent-2, var(--color-accent))" },
        ].map((cell) => (
          <span key={cell.k} style={{ display: "flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.8125rem" }}>
            <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: cell.color, display: "inline-block" }} />
            <span style={{ color: "var(--color-neutral-600)", fontSize: "0.6875rem", letterSpacing: ".02em" }}>{cell.k}</span>
            <span style={{ fontFamily: "var(--font-numeric)" }}>
              {cell.k === "NET" && cell.v > 0 ? "+" : cell.k === "NET" && cell.v < 0 ? "−" : ""}
              {formatCurrency(Math.abs(cell.v), currency)}
            </span>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.375rem", alignItems: "flex-end", height: 120, borderBottom: "1px solid var(--color-divider)", paddingBottom: "0.0625rem" }}>
        {history.map((h, i) => {
          const active = i === selected;
          return (
            <button
              key={h.key}
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={active}
              aria-label={`${h.label}: in ${formatCurrency(h.income, currency)}, out ${formatCurrency(h.expense, currency)}`}
              style={{ all: "unset", cursor: "pointer", flex: 1, display: "flex", gap: "0.125rem", alignItems: "flex-end", height: "100%", boxSizing: "border-box" }}
            >
              <span
                style={{
                  flex: 1,
                  height: `${Math.max(h.income > 0 ? 3 : 0, (h.income / peak) * 100)}%`,
                  background: "var(--color-accent)",
                  opacity: active ? 1 : 0.35,
                  borderRadius: "3px 3px 0 0",
                  transition: "opacity .15s",
                }}
              />
              <span
                style={{
                  flex: 1,
                  height: `${Math.max(h.expense > 0 ? 3 : 0, (h.expense / peak) * 100)}%`,
                  background: "color-mix(in srgb, var(--color-text) 40%, transparent)",
                  opacity: active ? 1 : 0.35,
                  borderRadius: "3px 3px 0 0",
                  transition: "opacity .15s",
                }}
              />
            </button>
          );
        })}
      </div>
      <div aria-hidden="true" style={{ display: "flex", gap: "0.375rem", marginTop: "0.3125rem" }}>
        {history.map((h, i) => (
          <span
            key={h.key}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: "0.53125rem",
              letterSpacing: ".06em",
              color: i === selected ? "var(--color-text)" : "var(--color-neutral-600)",
              fontWeight: i === selected ? 600 : 400,
            }}
          >
            {h.label}
          </span>
        ))}
      </div>
    </div>
  );
}
