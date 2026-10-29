"use client";

/* The Wealth charts approved on 30 September
 * (https://claude.ai/artifact/1Qg7T8E3XFBYLf9rJ21WFn): spending by category
 * as a donut, cash flow against a budget band, net worth over time, and each
 * person's spending against their budget.
 *
 * Drawn with visx, which is React rendering plain SVG: ~17 KB on the page
 * against Recharts' 118 and ECharts' 198 for the same four charts, measured.
 * Touch is ours rather than a library's hover tooltip -- a tap selects, a
 * drag along the net-worth line scrubs it -- because a hover does not exist on
 * a phone. Colours are Kin's own tokens (the category palette was run through
 * the colour-blindness validator in both themes before this was built), so
 * light and dark come for free. Every chart also says what it shows in words
 * for a screen reader, and nothing is told apart by colour alone. */

import { useId, useState, useTransition } from "react";
import { Pie } from "@visx/shape";
import { scaleBand, scaleLinear } from "@visx/scale";
import { formatCurrency, currencySymbol } from "@/lib/format";
import { categoryLabel, expenseCategoryColor, incomeSourceColor, netWorthMoves, type NetWorthPoint } from "@/lib/wealth";
import { FoldableSection } from "@/components/collapsible-group";
import { Icon } from "@/components/icons";

const OUT_COLOR = "color-mix(in srgb, var(--color-text) 40%, transparent)";
const BAND_COLOR = "color-mix(in srgb, var(--color-accent) 8%, transparent)";
const GRID_COLOR = "var(--color-neutral-200)";
const eyebrow: React.CSSProperties = { font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" };
const muted: React.CSSProperties = { fontSize: "0.78125rem", color: "var(--color-neutral-600)" };
const tabular: React.CSSProperties = { fontFamily: "var(--font-numeric)", fontVariantNumeric: "tabular-nums" };

function shortMoney(n: number, currency: string) {
  const sym = currencySymbol(currency);
  if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${sym}${Math.round(n / 1000)}k`;
  return `${sym}${Math.round(n)}`;
}

/** A diagonal hatch in the darker accent, for the part of a bar that went
 * over budget -- texture as well as colour, so it reads without either. */
function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={4} height={4} fill="var(--color-accent-700)" />
      <line x1={0} y1={0} x2={0} y2={4} stroke="var(--color-surface)" strokeWidth={1.4} />
    </pattern>
  );
}

/** A column with a 4px rounded top and a square foot on the baseline. */
function columnPath(x: number, top: number, base: number, w: number) {
  const h = base - top;
  if (h <= 0) return "";
  const r = Math.min(4, h, w / 2);
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
}

/* ------------------------------------------------------------- cash flow */

export type CashFlowPoint = { key: string; label: string; income: number; expense: number };

/** Money in against money out for each period, with the budget each month
 * was measured against drawn as a band behind the bars. Money out past the
 * budget is hatched and the summary line says by how much. Opens on the
 * current period; a tap on any period moves the summary line to it. `budgets`
 * is keyed by period (YYYY-MM) and only given on the month range -- a budget
 * is monthly, so a band on weeks or years would be a number nobody set. */
export function CashFlowChart({
  history,
  currency,
  periodNoun,
  budgets = {},
}: {
  history: CashFlowPoint[];
  currency: string;
  periodNoun: string;
  budgets?: Record<string, number>;
}) {
  const [selected, setSelected] = useState(Math.max(0, history.length - 1));
  const hatchId = `kin-hatch-${useId().replace(/:/g, "")}`;
  if (history.length === 0) return null;

  const point = history[selected] ?? history[history.length - 1];
  const net = point.income - point.expense;
  const budget = budgets[point.key];
  const anyBudget = history.some((h) => budgets[h.key]);
  const anyOver = history.some((h) => budgets[h.key] && h.expense > budgets[h.key]);

  const W = 340;
  const H = 160;
  const left = 36;
  const bottom = 18;
  const top = 6;
  const peak = Math.max(1, ...history.flatMap((h) => [h.income, h.expense, budgets[h.key] ?? 0]));
  const y = scaleLinear<number>({ domain: [0, peak], range: [H - bottom, top], nice: 3 });
  const x = scaleBand<string>({ domain: history.map((h) => h.key), range: [left, W], padding: 0.18 });
  const bw = Math.min(14, (x.bandwidth() - 2) / 2);
  const ticks = y.ticks(3);
  const labelEvery = history.length > 8 ? Math.ceil(history.length / 6) : 1;

  function move(i: number) {
    setSelected(Math.max(0, Math.min(history.length - 1, i)));
  }

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p className="sr-only">
        Cash flow by {periodNoun}, {history.length} periods. Each period below is a button announcing its in, out and budget.
      </p>

      <div aria-live="polite" style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "0.375rem 1rem", marginBottom: "0.625rem", minHeight: "2.6rem" }}>
        <span style={{ font: "600 0.9375rem/1.15 var(--font-heading)", width: "100%" }}>{point.label}</span>
        {[
          { k: "IN", v: point.income, swatch: "var(--color-accent)" },
          { k: "OUT", v: point.expense, swatch: OUT_COLOR },
        ].map((c) => (
          <span key={c.k} style={{ display: "flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.8125rem" }}>
            <i aria-hidden="true" style={{ width: 8, height: 8, background: c.swatch, display: "inline-block" }} />
            <span style={{ color: "var(--color-neutral-600)", fontSize: "0.6875rem", letterSpacing: ".02em" }}>{c.k}</span>
            <span style={tabular}>{formatCurrency(c.v, currency)}</span>
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.8125rem" }}>
          <span style={{ color: "var(--color-neutral-600)", fontSize: "0.6875rem", letterSpacing: ".02em" }}>NET</span>
          <span style={tabular}>
            {net > 0 ? "+" : net < 0 ? "−" : ""}
            {formatCurrency(Math.abs(net), currency)}
          </span>
        </span>
        {budget ? (
          <span
            style={{
              ...tabular,
              fontSize: "0.75rem",
              padding: "0.125rem 0.5rem",
              borderRadius: 999,
              color: point.expense > budget ? "var(--color-accent-700)" : "var(--color-neutral-700)",
              background: point.expense > budget ? "var(--color-accent-100)" : "var(--color-neutral-200)",
            }}
          >
            {point.expense > budget ? `Over budget by ${formatCurrency(point.expense - budget, currency)}` : `${formatCurrency(budget - point.expense, currency)} under budget`}
          </span>
        ) : null}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible", touchAction: "pan-y" }}>
        <defs>
          <Hatch id={hatchId} />
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke={GRID_COLOR} strokeWidth={1} />
            <text x={left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={9.5} fill="var(--color-neutral-600)" style={tabular}>
              {shortMoney(t, currency)}
            </text>
          </g>
        ))}
        {/* The budget band: the zone from nothing up to what that month was
            allowed, stepping where the budget changed, with a hairline on top. */}
        {history.map((h) => {
          const b = budgets[h.key];
          if (!b) return null;
          const x0 = (x(h.key) ?? 0) - (x.step() - x.bandwidth()) / 2;
          return (
            <g key={`band-${h.key}`} aria-hidden="true">
              <rect x={x0} y={y(b)} width={x.step()} height={y(0) - y(b)} fill={BAND_COLOR} />
              <line x1={x0} x2={x0 + x.step()} y1={y(b)} y2={y(b)} stroke="var(--color-accent)" strokeOpacity={0.55} strokeWidth={1} />
            </g>
          );
        })}
        {history.map((h, i) => {
          const cx = (x(h.key) ?? 0) + x.bandwidth() / 2;
          const b = budgets[h.key];
          const within = b ? Math.min(h.expense, b) : h.expense;
          const active = i === selected;
          return (
            <g
              key={h.key}
              role="button"
              tabIndex={active ? 0 : -1}
              aria-pressed={active}
              aria-label={`${h.label}: in ${formatCurrency(h.income, currency)}, out ${formatCurrency(h.expense, currency)}${b ? `, budget ${formatCurrency(b, currency)}` : ""}`}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  move(i + 1);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  move(i - 1);
                }
              }}
              style={{ cursor: "pointer", outline: "none" }}
              opacity={active ? 1 : 0.4}
            >
              {/* The whole column is the target, not the thin bars. */}
              <rect x={(x(h.key) ?? 0) - 2} y={top} width={x.bandwidth() + 4} height={H - top} fill="transparent" />
              <path d={columnPath(cx - bw - 1, y(h.income), y(0), bw)} fill="var(--color-accent)" />
              <path d={columnPath(cx + 1, y(within), y(0), bw)} fill={OUT_COLOR} />
              {b && h.expense > b && (
                <>
                  <path d={columnPath(cx + 1, y(h.expense), y(b) - 2, bw)} fill={`url(#${hatchId})`} />
                </>
              )}
              {i % labelEvery === (history.length - 1) % labelEvery && (
                <text x={cx} y={H - 4} textAnchor="middle" fontSize={9.5} letterSpacing=".05em" fill={active ? "var(--color-text)" : "var(--color-neutral-600)"} fontWeight={active ? 600 : 400}>
                  {h.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div aria-hidden="true" style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem 0.875rem", marginTop: "0.5rem", ...muted }}>
        <Key swatch={<i style={{ width: 8, height: 8, background: "var(--color-accent)", display: "inline-block" }} />} label="In" />
        <Key swatch={<i style={{ width: 8, height: 8, background: OUT_COLOR, display: "inline-block" }} />} label="Out" />
        {anyOver && (
          <Key
            swatch={<i style={{ width: 8, height: 8, background: "repeating-linear-gradient(45deg, var(--color-accent-700) 0 2px, var(--color-surface) 2px 3px)", display: "inline-block" }} />}
            label="Over budget"
          />
        )}
        {anyBudget && <Key swatch={<i style={{ width: 10, height: 8, background: BAND_COLOR, borderTop: "1px solid var(--color-accent)", display: "inline-block" }} />} label="Budget" />}
      </div>
    </div>
  );
}

function Key({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
      {swatch}
      {label}
    </span>
  );
}

/* ------------------------------------------------------- category donut */

/** Cash balance across the same window the history strip already covers --
 * the trend line every net-worth screen from Mint to Monarch leads with,
 * reconstructed from cashBalanceTrend (lib/wealth.ts) rather than stored.
 * Cash only: assets, liabilities and goals don't carry a per-period history
 * the way transactions do, so a full net-worth trend needs a stored monthly
 * snapshot -- a migration, not this. Shared by the Accounts tab and each
 * account's own page, which draws the same line for that account alone. */
export function CashTrendLine({ trend, currency, periodNoun = "period" }: { trend: { key: string; label: string; balance: number }[]; currency: string; periodNoun?: string }) {
  if (trend.length < 2) return null;
  const values = trend.map((t) => t.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 100;
  const h = 30;
  const points = trend.map((t, i) => ({
    x: (i / (trend.length - 1)) * w,
    y: h - ((t.balance - min) / span) * h,
    ...t,
  }));
  const changed = trend[trend.length - 1].balance - trend[0].balance;
  const up = changed >= 0;

  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: "0.375rem" }}>
        <span style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>CASH TREND</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.78125rem",
            fontFamily: "var(--font-numeric)",
            color: up ? "var(--color-accent-700)" : "var(--color-neutral-700)",
          }}
        >
          <span aria-hidden="true">{up ? "▲" : "▼"}</span> {formatCurrency(Math.abs(changed), currency)} over {trend.length} {periodNoun}s
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 44, display: "block" }} aria-hidden="true">
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <circle key={p.key} cx={p.x} cy={p.y} r={1.6} fill="var(--color-accent)">
            <title>{`${p.label}: ${formatCurrency(p.balance, currency)}`}</title>
          </circle>
        ))}
      </svg>
      <p className="sr-only">
        Cash trend, {trend.length} {periodNoun}s, {formatCurrency(trend[0].balance, currency)} to {formatCurrency(trend[trend.length - 1].balance, currency)}.{" "}
        {trend.map((t) => `${t.label}: ${formatCurrency(t.balance, currency)}`).join("; ")}.
      </p>
    </div>
  );
}

/** `color` overrides the category's own, for a slice that is not a
 * category: a regular income's group. */
export type CategorySlice = { category: string; spent: number; budget: number; color?: string };

/** Where the month's money went, as a donut (Jonathan's choice over a divided
 * bar). The list under it carries the exact figures, so nobody has to judge an
 * angle; a tap on a slice or a row puts that category, and how it stands
 * against its budget, in the middle. `kind="income"` draws the same donut
 * for money in, by source, with no budget line. */
export function CategoryDonut({
  categories,
  currency,
  monthBudget,
  showList = true,
  kind = "expense",
}: {
  categories: CategorySlice[];
  currency: string;
  monthBudget: number | null;
  /** Off where the page already lists the same categories right below, with
   * the same colour dots -- two lists of one thing is one too many. */
  showList?: boolean;
  kind?: "expense" | "income";
}) {
  const income = kind === "income";
  const colorOf = income ? incomeSourceColor : expenseCategoryColor;
  const [sel, setSel] = useState<number | null>(null);
  const slices = categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  const total = slices.reduce((sum, c) => sum + c.spent, 0);
  if (total <= 0) return null;

  const size = 200;
  const outer = 92;
  const inner = 64;
  const pad = 2 / ((outer + inner) / 2);
  const picked = sel !== null ? slices[sel] : null;
  const pct = (v: number) => Math.round((v / total) * 100);

  return (
    <div style={{ marginBottom: "1rem" }}>
      <p className="sr-only">
        {income ? "Income by source" : "Spending by category this month"}, total {formatCurrency(total, currency)}. {slices.map((c) => `${categoryLabel(c.category)}: ${formatCurrency(c.spent, currency)}, ${pct(c.spent)}%`).join("; ")}.
      </p>
      <div style={{ maxWidth: size, margin: "0.25rem auto 0" }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
          <g transform={`translate(${size / 2},${size / 2})`}>
            <Pie data={slices} pieValue={(d) => d.spent} outerRadius={outer} innerRadius={inner} padAngle={slices.length > 1 ? pad : 0} pieSort={null}>
              {(pie) =>
                pie.arcs.map((arc, i) => (
                  <path
                    key={arc.data.category}
                    d={pie.path(arc) ?? ""}
                    fill={arc.data.color ?? colorOf(arc.data.category)}
                    opacity={sel === null || sel === i ? 1 : 0.28}
                    style={{ cursor: "pointer", transition: "opacity 160ms ease-out" }}
                    onClick={() => setSel(sel === i ? null : i)}
                  />
                ))
              }
            </Pie>
            <text textAnchor="middle" y={-16} fontSize={10.5} letterSpacing=".06em" fill="var(--color-neutral-600)">
              {picked ? categoryLabel(picked.category).toUpperCase() : income ? "EARNED" : "SPENT"}
            </text>
            <text textAnchor="middle" y={8} fontSize={20} fontWeight={600} fill="var(--color-text)" style={tabular}>
              {formatCurrency(picked ? picked.spent : total, currency)}
            </text>
            <text textAnchor="middle" y={27} fontSize={11} fill="var(--color-neutral-600)" style={tabular}>
              {picked && income
                ? `${pct(picked.spent)}% of income`
                : picked
                ? picked.budget > 0
                  ? picked.spent > picked.budget
                    ? `over by ${formatCurrency(picked.spent - picked.budget, currency)}`
                    : `${formatCurrency(picked.budget - picked.spent, currency)} left`
                  : "no budget set"
                : monthBudget
                  ? `of ${formatCurrency(monthBudget, currency)} budget`
                  : ""}
            </text>
          </g>
        </svg>
      </div>
      {showList && (
      <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0", display: "grid", gap: 2 }}>
        {slices.map((c, i) => (
          <li key={c.category}>
            <button
              type="button"
              aria-pressed={sel === i}
              onClick={() => setSel(sel === i ? null : i)}
              style={{
                all: "unset",
                boxSizing: "border-box",
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.84375rem",
                padding: "0.375rem 0.25rem",
                borderRadius: 8,
                cursor: "pointer",
                background: sel === i ? "var(--color-neutral-200)" : "transparent",
                transition: "background-color 160ms ease-out",
              }}
            >
              <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: c.color ?? colorOf(c.category), flex: "none" }} />
              <span style={{ flex: 1, minWidth: 0 }}>{categoryLabel(c.category)}</span>
              <span style={tabular}>{formatCurrency(c.spent, currency)}</span>
              <span style={{ ...tabular, width: "2.6rem", textAlign: "right", color: "var(--color-neutral-600)" }}>{pct(c.spent)}%</span>
            </button>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ net worth */

export type { NetWorthPoint };


/** Net worth month by month, from the snapshots this viewer's own visits
 * have kept (the line starts the month it shipped). Drag a finger along it,
 * or use the arrow keys, and the figure above follows. */
export function NetWorthLine({ points, currency, periodNoun = "month" }: { points: NetWorthPoint[]; currency: string; periodNoun?: string }) {
  const [at, setAt] = useState<number | null>(null);
  if (points.length < 2) {
    return (
      <p style={{ ...muted, margin: "-0.25rem 0 0.875rem", lineHeight: 1.45 }}>
        Kin keeps your net worth each day you open Wealth. The line draws once there are two {periodNoun}s to join.
      </p>
    );
  }
  const W = 340;
  const H = 120;
  const L = 4;
  const R = 42;
  const T = 10;
  const B = 18;
  const values = points.map((p) => p.netWorth);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const y = scaleLinear<number>({ domain: [lo === hi ? lo - 1 : lo, lo === hi ? hi + 1 : hi], range: [H - B, T], nice: 3 });
  const x = scaleLinear<number>({ domain: [0, points.length - 1], range: [L, W - R] });
  const [yMin] = y.domain();
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.netWorth).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${y(yMin)} L${x(0)},${y(yMin)} Z`;
  const i = at ?? points.length - 1;
  const first = points[0].netWorth;
  const shown = points[i].netWorth;
  const diff = shown - first;
  const labelled = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  function indexFrom(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    return Math.max(0, Math.min(points.length - 1, Math.round(x.invert(px))));
  }

  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }} aria-live="polite">
        <span style={eyebrow}>{at === null ? "OVER TIME" : points[i].longLabel.toUpperCase()}</span>
        <span style={{ ...tabular, marginLeft: "auto", fontSize: "0.8125rem" }}>{formatCurrency(shown, currency)}</span>
        {diff !== 0 && (
          <span
            style={{
              ...tabular,
              fontSize: "0.75rem",
              padding: "0.125rem 0.5rem",
              borderRadius: 999,
              color: diff > 0 ? "var(--color-accent-700)" : "var(--color-neutral-700)",
              background: diff > 0 ? "var(--color-accent-100)" : "var(--color-neutral-200)",
            }}
          >
            <span aria-hidden="true">{diff > 0 ? "▲" : "▼"}</span> {formatCurrency(Math.abs(diff), currency)} since {points[0].label}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", marginTop: "0.375rem", touchAction: "pan-y", outline: "none" }}
        role="img"
        tabIndex={0}
        aria-label={`Net worth over ${points.length} ${periodNoun}s, from ${formatCurrency(first, currency)} in ${points[0].longLabel} to ${formatCurrency(values[values.length - 1], currency)}. Arrow keys step through the ${periodNoun}s.`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setAt(indexFrom(e));
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.currentTarget.hasPointerCapture(e.pointerId)) setAt(indexFrom(e));
        }}
        onPointerUp={() => setAt(null)}
        onPointerLeave={() => setAt(null)}
        onPointerCancel={() => setAt(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setAt(Math.max(0, i - 1));
          else if (e.key === "ArrowRight") setAt(Math.min(points.length - 1, i + 1));
          else if (e.key === "Escape") setAt(null);
        }}
        onBlur={() => setAt(null)}
      >
        {y.ticks(3).map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID_COLOR} strokeWidth={1} />
            <text x={W - R + 6} y={y(t) + 3.5} fontSize={9.5} fill="var(--color-neutral-600)" style={tabular}>
              {shortMoney(t, currency)}
            </text>
          </g>
        ))}
        <path d={area} fill="var(--color-accent)" fillOpacity={0.1} />
        <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, k) =>
          labelled.has(k) ? (
            <text key={p.key} x={x(k)} y={H - 4} textAnchor={k === 0 ? "start" : k === points.length - 1 ? "end" : "middle"} fontSize={9.5} fill="var(--color-neutral-600)">
              {p.label}
            </text>
          ) : null,
        )}
        {at !== null && at !== points.length - 1 && <line x1={x(i)} x2={x(i)} y1={T - 4} y2={y(yMin)} stroke="var(--color-neutral-600)" strokeWidth={1} />}
        <circle cx={x(i)} cy={y(shown)} r={4.5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
      </svg>
    </div>
  );
}

/* ------------------------------------------------- spending by person */

export type PersonSpending = { memberId: string | null; label: string; spent: number; budget: number | null; hasVisibleAccounts: boolean };

/** Each person's spending this month against the budget a grown-up set for
 * them. The dark tick is the budget; past it, the bar is hatched and the line
 * under it says by how much. Someone whose accounts the viewer cannot see
 * shows no number at all rather than a misleading zero. */
export function SpendingByPerson({
  people,
  currency,
  details,
  openFirst = [],
}: {
  people: PersonSpending[];
  currency: string;
  /** Opened from the start (keys as in `details`): the one a link to an
   * open bill lands in. */
  openFirst?: string[];
  /** Under each one, keyed by member id or "family": their categories,
   * budget against spend, where their budgets are set (26 October). */
  details: Record<string, React.ReactNode>;
}) {
  const hatchId = `kin-hatch-${useId().replace(/:/g, "")}`;
  // Each one's categories fold away under their name, folded to start
  // (Janine, 26 October).
  const [opened, setOpened] = useState<string[]>(openFirst);
  if (people.length === 0) return null;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <Hatch id={hatchId} />
        </defs>
      </svg>
      {people.map((p) => {
        const over = p.budget !== null && p.spent > p.budget;
        const within = p.budget !== null ? Math.min(p.spent, p.budget) : p.spent;
        // Each against their own budget alone (26 October): someone with
        // none has no bar, rather than a share of somebody else's.
        const scale = Math.max(1, p.spent, p.budget ?? 0);
        const pctOf = (v: number) => `${(v / scale) * 100}%`;
        const key = p.memberId ?? "family";
        const open = opened.includes(key);
        const toggle = () => setOpened((o) => (o.includes(key) ? o.filter((k) => k !== key) : [...o, key]));
        return (
          <div key={p.memberId ?? "joint"} style={{ margin: "0.75rem 0 0.125rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", fontSize: "0.84375rem" }}>
              <span style={{ minWidth: 0 }}>
                {p.label}
                {p.memberId === null && <span style={{ ...muted, marginLeft: "0.375rem" }}>joint accounts</span>}
              </span>
              <span style={{ ...tabular, marginLeft: "auto", fontSize: "0.8125rem", color: p.hasVisibleAccounts ? undefined : "var(--color-neutral-600)" }}>
                {!p.hasVisibleAccounts
                  ? p.budget !== null
                    ? `Budget ${formatCurrency(p.budget, currency)}`
                    : "Nothing shared"
                  : p.budget !== null
                    ? `${formatCurrency(p.spent, currency)} of ${formatCurrency(p.budget, currency)}`
                    : formatCurrency(p.spent, currency)}
                {/* What is left, or over, beside the amount (Janine, 26 October). */}
                {p.hasVisibleAccounts && p.budget !== null && (
                  <span style={{ marginLeft: "0.375rem", color: over ? "var(--color-accent-700)" : "var(--color-neutral-600)" }}>
                    ({over ? `${formatCurrency(p.spent - p.budget, currency)} over` : `${formatCurrency(p.budget - p.spent, currency)} left`})
                  </span>
                )}
              </span>
              {details[key] && (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  aria-label={`${open ? "Fold" : "Open"} ${p.label}'s categories`}
                  style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: 0, padding: 0, minWidth: "1.75rem", minHeight: "1.75rem", color: "var(--color-neutral-700)", cursor: "pointer" }}
                >
                  {/* The same chevron as the folds above it. */}
                  <span aria-hidden className="kin-chevron" data-open={open}>
                    <Icon name="chevronLeft" size={14} />
                  </span>
                </button>
              )}
            </div>
            {p.budget !== null && (
            <div
              aria-hidden="true"
              style={{ position: "relative", height: 12, borderRadius: 4, background: "var(--color-neutral-200)", marginTop: "0.3125rem", overflow: "visible" }}
            >
              {p.hasVisibleAccounts && <div style={{ position: "absolute", inset: "0 auto 0 0", width: pctOf(within), background: "var(--color-accent)", borderRadius: 4 }} />}
              {p.hasVisibleAccounts && over && (
                <svg style={{ position: "absolute", top: 0, height: 12, left: `calc(${pctOf(p.budget!)} + 2px)`, width: `calc(${pctOf(p.spent - p.budget!)} - 2px)` }} preserveAspectRatio="none">
                  <rect width="100%" height="100%" rx={4} fill={`url(#${hatchId})`} />
                </svg>
              )}
              {p.budget !== null && <div style={{ position: "absolute", top: -3, bottom: -3, left: `calc(${pctOf(p.budget)} - 1px)`, width: 2, borderRadius: 1, background: "var(--color-text)" }} />}
            </div>
            )}
            {/* With a budget, what is left sits beside the amount above. */}
            {(p.budget === null || !p.hasVisibleAccounts) && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                <span style={muted}>
                  {!p.hasVisibleAccounts && p.budget === null
                    ? p.memberId === null ? "No joint accounts or budget yet" : "Their accounts are private to them."
                    : p.budget === null
                      ? "No budget set"
                      : p.memberId === null ? "No joint accounts yet" : "Their accounts are private to them."}
                </span>
              </div>
            )}
            {open && details[key] && <div style={{ margin: "0.75rem 0 1.25rem", paddingLeft: "0.75rem", borderLeft: "2px solid var(--color-neutral-200)" }}>{details[key]}</div>}
          </div>
        );
      })}
      <p style={{ ...muted, marginTop: "0.75rem", lineHeight: 1.45 }}>
        The dark tick is each one&rsquo;s budget for the month: their category budgets added up. Budgets set as private are not shown.
      </p>
    </div>
  );
}

/* ------------------------------------------------- accounts by owner */

/** One line of a breakdown: an account, a goal, an asset, a debt, an
 * income or an expense. Every Wealth tab draws its breakdown the same way
 * (Janine, 23 October): whose it is first, then its category, then the line
 * itself -- one donut, one set of headings, one row format.
 *
 * `amount` is what counts toward the donut and the shares; a line with 0
 * (an income still expected, a bill not yet paid) is listed without a
 * share. `sub` is the small line under the name; `actions` its buttons. */
export type BreakdownItem = {
  id: string;
  name: string;
  amount: number;
  ownerKey: string;
  ownerLabel: string;
  ownerSlot: number;
  category: string;
  sub?: string;
  /** Where the line opens (A&L: an account's own page); the donut ignores it. */
  href?: string;
  /** Under the line, before its actions (A&L: a goal's progress, an
   * asset's make-up, a loan's standing). The donut leaves it out. */
  detail?: React.ReactNode;
  /** Shown even where `detail` folds away with the actions (A&L, 29
   * October): the one line that says how the thing stands. */
  pinned?: React.ReactNode;
  actions?: React.ReactNode;
  /** Open this line's owner and category on arrival -- a deep link to it
   * (Today's Pay lands on a bill) when the groups otherwise start folded. */
  reveal?: boolean;
};
/** One hue per owner, in a fixed order -- Joint first, then each member in
 * the household's order -- so a person keeps their colour whichever Who is
 * picked. These are the expense-category hues, in the order they were run
 * through the colour-blindness validator in both themes (worst adjacent
 * pair 9.1 ΔE light, 8.4 dark); past seven owners the rest share the
 * neutral, as categories do. Owner and account names are always printed
 * beside their colour, so the colour never carries the meaning alone. */
const OWNER_HUES = [
  "var(--wealth-groceries)",
  "var(--wealth-utilities)",
  "var(--wealth-housing)",
  "var(--wealth-transport)",
  "var(--wealth-health)",
  "var(--wealth-dining)",
  "var(--wealth-shopping)",
];
const ownerHue = (slot: number) => OWNER_HUES[slot] ?? "var(--wealth-cat-other)";
/** An owner's second, third... account: the same hue, lighter, so the
 * slices of one person read as one run and each still stands apart. */
const accountShade = (slot: number, nth: number) => {
  const mix = [100, 72, 50][nth % 3];
  return mix === 100 ? ownerHue(slot) : `color-mix(in oklab, ${ownerHue(slot)} ${mix}%, var(--color-surface))`;
};

/** How a total splits, item by item, grouped by whose each is (Janine,
 * 22 October): accounts on the Accounts tab; on A&L, what is owned and what
 * is owed. The donut sits beside the headline figure;
 * under it, each owner's share and then each of their accounts with its
 * amount and percent. A tap on a slice or a row puts that account -- name,
 * owner, amount -- in the middle. Accounts at zero or below have no slice
 * (a pie can't hold a negative); they are named under the list instead. */
/** The breakdown every Wealth tab shares. A donut -- beside `head` when
 * given (a headline figure), else above -- then each owner as a heading
 * that folds (amount and share right-aligned, as in a report table), each
 * of their categories under it, then the lines.
 *
 * Colour follows the owner: their hue, a lighter step for each further
 * category of theirs. With one owner on screen (a Who view of one person,
 * or Family) each category takes its own hue instead, in `categoryOrder`.
 * Order is fixed -- owners by household slot (Family first), categories
 * by `categoryOrder`, lines largest first -- so nothing moves around as
 * amounts change. Lines below zero have no slice (a donut can't hold a
 * negative); they are named under the list. */
export function GroupedBreakdown({
  head,
  items,
  currency,
  storageKey,
  categoryOrder = [],
  center,
  emptyLine,
}: {
  head?: React.ReactNode;
  items: BreakdownItem[];
  currency: string;
  /** Prefix for each group's remembered open/folded state. */
  storageKey: string;
  categoryOrder?: readonly string[];
  /** The middle of the donut before a slice is tapped. */
  center?: { label: string; note?: string };
  emptyLine?: string;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const counted = items.filter((i) => i.amount > 0);
  const below = items.filter((i) => i.amount < 0);
  const total = counted.reduce((t, i) => t + i.amount, 0);
  const catRank = (c: string) => {
    const i = categoryOrder.indexOf(c);
    return i < 0 ? categoryOrder.length : i;
  };

  // An owner with nothing counted (a child whose only goal is still empty)
  // has no slice, so no legend row either: "ERYNNE — —" said nothing
  // (27 October). Nor a block in this breakdown. Their items still list in
  // the page's own sections further down, outside this component: A&L's
  // ASSETS, and Cash Flow's SPENDING BY PERSON, where an unpaid bill keeps
  // its Settle (so a Family with only open bills has no block here).
  const owners = [...new Set(items.filter((i) => i.amount > 0).map((i) => i.ownerKey))]
    .map((key) => {
      const mine = items.filter((i) => i.ownerKey === key && i.amount >= 0);
      const cats = [...new Set(mine.map((i) => i.category))].sort((x, y) => catRank(x) - catRank(y) || x.localeCompare(y));
      return {
        key,
        label: mine[0].ownerLabel,
        slot: mine[0].ownerSlot,
        sum: mine.reduce((t, i) => t + i.amount, 0),
        reveal: mine.some((i) => i.reveal),
        cats: cats.map((c) => {
          const lines = mine.filter((i) => i.category === c).sort((x, y) => y.amount - x.amount);
          return { name: c, lines, sum: lines.reduce((t, i) => t + i.amount, 0), reveal: lines.some((i) => i.reveal) };
        }),
      };
    })
    .sort((x, y) => x.slot - y.slot);
  const single = owners.length === 1;
  const allCats = [...new Set(items.map((i) => i.category))].sort((x, y) => catRank(x) - catRank(y) || x.localeCompare(y));
  const fillOf = (ownerSlot: number, nthCat: number, cat: string) => (single ? ownerHue(allCats.indexOf(cat)) : accountShade(ownerSlot, nthCat));
  const colored = owners.map((o) => ({ ...o, cats: o.cats.map((c, n) => ({ ...c, fill: fillOf(o.slot, n, c.name) })) }));
  const ring = colored.flatMap((o) => o.cats.flatMap((c) => c.lines.filter((l) => l.amount > 0).map((l) => ({ ...l, fill: c.fill }))));
  const picked = ring.find((l) => l.id === sel) ?? null;
  // "<1", not "0": a share that is there should never read as nothing.
  const pct = (v: number) => {
    if (!(v > 0) || total <= 0) return "—";
    const p = Math.round((v / total) * 100);
    return p === 0 ? "<1%" : `${p}%`;
  };

  const size = 176;
  const outer = 82;
  const inner = 56;
  const pad = 2 / ((outer + inner) / 2);
  // Beside a headline, a donut of one slice says nothing the figure doesn't;
  // on its own (Income, Expenses) it still shows the period at a glance.
  const showPie = counted.length >= (head ? 2 : 1);
  const figures = (amount: number, count?: number) => (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "0.5rem", flex: "none", fontSize: "0.8125rem", fontWeight: 600, letterSpacing: 0, textTransform: "none", color: "var(--color-text)" }}>
      {count !== undefined && <span style={{ ...muted, fontWeight: 400 }}>{count}</span>}
      <span style={tabular}>{amount !== 0 ? formatCurrency(amount, currency) : "—"}</span>
      <span style={{ ...tabular, width: "2.6rem", textAlign: "right", color: "var(--color-neutral-600)", fontWeight: 400 }}>{pct(amount)}</span>
    </span>
  );

  const pie = showPie && (
    <div style={{ flex: "0 0 auto", width: size, margin: "0 auto" }}>
      <p className="sr-only">
        {owners.map((o) => `${o.label} ${formatCurrency(o.sum, currency)} (${pct(o.sum)}): ${o.cats.map((c) => `${c.name} ${formatCurrency(c.sum, currency)}`).join(", ")}`).join("; ")}.
      </p>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
        <g transform={`translate(${size / 2},${size / 2})`}>
          <Pie data={ring} pieValue={(d) => d.amount} outerRadius={outer} innerRadius={inner} padAngle={pad} pieSort={null}>
            {(p) =>
              p.arcs.map((arc) => (
                <path
                  key={arc.data.id}
                  d={p.path(arc) ?? ""}
                  fill={arc.data.fill}
                  opacity={sel === null || sel === arc.data.id ? 1 : 0.28}
                  style={{ cursor: "pointer", transition: "opacity 160ms ease-out" }}
                  onClick={() => setSel(sel === arc.data.id ? null : arc.data.id)}
                />
              ))
            }
          </Pie>
          <text textAnchor="middle" y={-14} fontSize={9.5} letterSpacing=".04em" fill="var(--color-neutral-600)">
            {picked ? picked.ownerLabel.toUpperCase() : (center?.label ?? "TOTAL").toUpperCase()}
          </text>
          <text textAnchor="middle" y={4} fontSize={picked ? 11 : 14} fontWeight={600} fill="var(--color-text)" style={picked ? undefined : tabular}>
            {picked ? (picked.name.length > 18 ? `${picked.name.slice(0, 17)}…` : picked.name) : shortMoney(total, currency)}
          </text>
          <text textAnchor="middle" y={21} fontSize={10.5} fill="var(--color-neutral-600)" style={tabular}>
            {picked ? `${shortMoney(picked.amount, currency)} · ${pct(picked.amount)}` : (center?.note ?? "tap a slice")}
          </text>
        </g>
      </svg>
    </div>
  );

  return (
    <div>
      {head ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem 1rem" }}>
          <div style={{ flex: "1 1 15rem", minWidth: 0 }}>{head}</div>
          {pie}
        </div>
      ) : (
        pie
      )}
      {items.length === 0 && emptyLine && <p style={{ ...muted, margin: "0.5rem 0" }}>{emptyLine}</p>}
      {(head ? showPie : items.length > 0) && (
        <div style={head ? { marginTop: "0.5rem", borderTop: "1px solid var(--color-divider)" } : undefined}>
          {colored.map((o) => (
            // Folded on every visit, not as last left (Janine, 26 October):
            // the donut and the owner totals are the first read.
            <FoldableSection key={o.key} remember={false} defaultOpen={o.reveal} label={o.label.toUpperCase()} storageKey={`${storageKey}-${o.key}`} swatch={single ? undefined : ownerHue(o.slot)} right={figures(o.sum)}>
              {o.cats.map((c) => (
                <FoldableSection key={c.name} level={2} remember={false} defaultOpen={c.reveal} label={c.name.toUpperCase()} storageKey={`${storageKey}-${o.key}-${c.name}`} swatch={c.fill} right={figures(c.sum, c.lines.length)}>
                  {c.lines.map((l) => (
                    <div
                      key={l.id}
                      onClick={() => l.amount > 0 && setSel(sel === l.id ? null : l.id)}
                      style={{
                        padding: "0.4375rem 0.25rem 0.4375rem 1.5rem",
                        borderBottom: "1px solid var(--color-divider)",
                        borderRadius: 6,
                        background: sel === l.id ? "var(--color-neutral-200)" : "transparent",
                        cursor: l.amount > 0 ? "pointer" : "default",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.84375rem" }}>
                        <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: c.fill, flex: "none" }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {l.name}
                          {l.sub && <span style={{ ...muted, display: "block", fontSize: "0.71875rem" }}>{l.sub}</span>}
                        </span>
                        <span style={{ ...tabular, flex: "none" }}>{l.amount !== 0 ? formatCurrency(l.amount, currency) : "—"}</span>
                        <span style={{ ...tabular, width: "2.6rem", textAlign: "right", color: "var(--color-neutral-600)", flex: "none" }}>{pct(l.amount)}</span>
                      </div>
                      {l.actions && (
                        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginTop: "0.375rem", paddingLeft: "1rem" }}>
                          {l.actions}
                        </div>
                      )}
                    </div>
                  ))}
                </FoldableSection>
              ))}
            </FoldableSection>
          ))}
          {below.length > 0 && (
            <p style={{ ...muted, margin: "0.5rem 0 0" }}>
              Not in the chart (below {formatCurrency(0, currency)}): {below.map((l) => `${l.name} (${l.ownerLabel}) ${formatCurrency(l.amount, currency)}`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Under the net worth line: what moved it since last month, part by part
 * (Jonathan, 26 October) -- whether it rose from saving, from a value
 * going up, or from paying a loan down. Nothing until two months with
 * their parts have been kept. */
export function NetWorthMoves({ points, currency }: { points: NetWorthPoint[]; currency: string }) {
  const withParts = points.filter((p) => p.parts);
  if (withParts.length < 2) return null;
  const prev = withParts[withParts.length - 2];
  const cur = withParts[withParts.length - 1];
  const moves = netWorthMoves(prev.parts!, cur.parts!);
  if (moves.length === 0) return null;
  const signed = (n: number) => `${n > 0 ? "+" : "−"}${formatCurrency(Math.abs(n), currency)}`;
  return (
    <p style={{ ...muted, margin: "-0.25rem 0 0.875rem", lineHeight: 1.5 }}>
      Since {prev.longLabel}:{" "}
      {moves.map((m, i) => (
        <span key={m.label}>
          {i > 0 ? " · " : ""}
          {m.label}{" "}
          <span style={{ ...tabular, color: m.delta > 0 ? "var(--color-accent-700)" : "var(--color-text)", fontWeight: 600 }}>{signed(m.delta)}</span>
        </span>
      ))}
    </p>
  );
}
