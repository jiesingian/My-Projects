import { Blueprint } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import type { CashFlowSource } from "@/lib/queries/wealth";

/** Where the period's money was tied. Shown under the chart, because the
 * chart answers "how much" and this answers "to what" -- which is the
 * question a household actually argues about.
 *
 * Money entered by hand is a row of its own rather than being dropped, so
 * the list adds up to the totals above it. A breakdown that quietly omits a
 * category is worse than no breakdown. */
export function CashFlowSources({ sources, currency }: { sources: CashFlowSource[]; currency: string }) {
  if (sources.length === 0) return null;

  return (
    <div style={{ marginTop: "1.125rem" }}>
      <h3 className="kin-eyebrow">Where it came from and went</h3>
      <Blueprint style={{ padding: "0.25rem 0.75rem" }}>
        {sources.map((s, i) => (
          <div
            key={`${s.kind}-${s.name}-${i}`}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "0.625rem",
              padding: "0.5625rem 0",
              borderBottom: i === sources.length - 1 ? "none" : "1px solid color-mix(in srgb, var(--color-text) 9%, transparent)",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 500 }}>{s.name}</span>
              <span style={{ display: "block", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>{s.label}</span>
            </span>
            {s.income > 0 && (
              <span style={{ font: "600 0.875rem/1 var(--font-numeric)", color: "var(--cal-home)", whiteSpace: "nowrap" }}>
                +{formatCurrency(s.income, currency)}
              </span>
            )}
            {s.expense > 0 && (
              <span style={{ font: "600 0.875rem/1 var(--font-numeric)", color: "var(--cal-money)", whiteSpace: "nowrap" }}>
                −{formatCurrency(s.expense, currency)}
              </span>
            )}
          </div>
        ))}
      </Blueprint>
    </div>
  );
}
