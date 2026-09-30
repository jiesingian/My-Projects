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
import { formatCurrency } from "@/lib/format";
import { expenseCategoryColor } from "@/lib/wealth";
import { setMemberBudgetAction } from "@/lib/actions/wealth";

const OUT_COLOR = "color-mix(in srgb, var(--color-text) 40%, transparent)";
const BAND_COLOR = "color-mix(in srgb, var(--color-accent) 8%, transparent)";
const GRID_COLOR = "var(--color-neutral-200)";
const eyebrow: React.CSSProperties = { font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" };
const muted: React.CSSProperties = { fontSize: "0.78125rem", color: "var(--color-neutral-600)" };
const tabular: React.CSSProperties = { fontFamily: "var(--font-numeric)", fontVariantNumeric: "tabular-nums" };

function shortMoney(n: number, currency: string) {
  const sym = currency === "PHP" ? "₱" : "";
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

export type CategorySlice = { category: string; spent: number; budget: number };

/** Where the month's money went, as a donut (Jonathan's choice over a divided
 * bar). The list under it carries the exact figures, so nobody has to judge an
 * angle; a tap on a slice or a row puts that category, and how it stands
 * against its budget, in the middle. */
export function CategoryDonut({
  categories,
  currency,
  monthBudget,
  showList = true,
}: {
  categories: CategorySlice[];
  currency: string;
  monthBudget: number | null;
  /** Off where the page already lists the same categories right below, with
   * the same colour dots -- two lists of one thing is one too many. */
  showList?: boolean;
}) {
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
        Spending by category this month, total {formatCurrency(total, currency)}. {slices.map((c) => `${c.category}: ${formatCurrency(c.spent, currency)}, ${pct(c.spent)}%`).join("; ")}.
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
                    fill={expenseCategoryColor(arc.data.category)}
                    opacity={sel === null || sel === i ? 1 : 0.28}
                    style={{ cursor: "pointer", transition: "opacity 160ms ease-out" }}
                    onClick={() => setSel(sel === i ? null : i)}
                  />
                ))
              }
            </Pie>
            <text textAnchor="middle" y={-16} fontSize={10.5} letterSpacing=".06em" fill="var(--color-neutral-600)">
              {picked ? picked.category.toUpperCase() : "SPENT"}
            </text>
            <text textAnchor="middle" y={8} fontSize={20} fontWeight={600} fill="var(--color-text)" style={tabular}>
              {formatCurrency(picked ? picked.spent : total, currency)}
            </text>
            <text textAnchor="middle" y={27} fontSize={11} fill="var(--color-neutral-600)" style={tabular}>
              {picked
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
              <i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: expenseCategoryColor(c.category), flex: "none" }} />
              <span style={{ flex: 1, minWidth: 0 }}>{c.category}</span>
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

export type NetWorthPoint = { month: string; netWorth: number };

function monthName(key: string, long = false) {
  const [yy, mm] = key.split("-").map(Number);
  return new Date(yy, mm - 1, 1).toLocaleDateString("en-PH", long ? { month: "long", year: "numeric" } : { month: "short" });
}

/** Net worth month by month, from the snapshots this viewer's own visits
 * have kept (the line starts the month it shipped). Drag a finger along it,
 * or use the arrow keys, and the figure above follows. */
export function NetWorthLine({ points, currency }: { points: NetWorthPoint[]; currency: string }) {
  const [at, setAt] = useState<number | null>(null);
  if (points.length < 2) {
    return (
      <p style={{ ...muted, margin: "-0.25rem 0 0.875rem", lineHeight: 1.45 }}>
        Kin keeps your net worth each month from now on. The line draws once there are two months to join.
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
        <span style={eyebrow}>{at === null ? "OVER TIME" : monthName(points[i].month, true).toUpperCase()}</span>
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
            <span aria-hidden="true">{diff > 0 ? "▲" : "▼"}</span> {formatCurrency(Math.abs(diff), currency)} since {monthName(points[0].month)}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", marginTop: "0.375rem", touchAction: "pan-y", outline: "none" }}
        role="img"
        tabIndex={0}
        aria-label={`Net worth over ${points.length} months, from ${formatCurrency(first, currency)} in ${monthName(points[0].month, true)} to ${formatCurrency(values[values.length - 1], currency)}. Arrow keys step through the months.`}
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
            <text key={p.month} x={x(k)} y={H - 4} textAnchor={k === 0 ? "start" : k === points.length - 1 ? "end" : "middle"} fontSize={9.5} fill="var(--color-neutral-600)">
              {monthName(p.month).toUpperCase()}
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
export function SpendingByPerson({ people, currency, canSetBudgets }: { people: PersonSpending[]; currency: string; canSetBudgets: boolean }) {
  const hatchId = `kin-hatch-${useId().replace(/:/g, "")}`;
  const scale = Math.max(1, ...people.map((p) => Math.max(p.spent, p.budget ?? 0)));
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
        const pctOf = (v: number) => `${(v / scale) * 100}%`;
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
              </span>
            </div>
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
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
              <span style={{ ...muted, color: over ? "var(--color-accent-700)" : muted.color }}>
                {!p.hasVisibleAccounts
                  ? "Their accounts are private to them."
                  : p.budget === null
                    ? "No budget set"
                    : over
                      ? `Over by ${formatCurrency(p.spent - p.budget, currency)}`
                      : `${formatCurrency(p.budget - p.spent, currency)} left`}
              </span>
              {canSetBudgets && p.memberId && <BudgetEditor memberId={p.memberId} current={p.budget} label={p.label} />}
            </div>
          </div>
        );
      })}
      <p style={{ ...muted, marginTop: "0.75rem", lineHeight: 1.45 }}>
        The dark tick is each person&rsquo;s budget for the month. {canSetBudgets ? "Any grown-up can set one; the whole household sees it." : "A grown-up sets them."}
      </p>
    </div>
  );
}

function BudgetEditor({ memberId, current, label }: { memberId: string; current: number | null; label: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current ? String(current) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto", minHeight: "2rem", fontSize: "0.75rem", padding: "0 0.5rem" }} onClick={() => setOpen(true)}>
        {current ? "Change budget" : "Set budget"}
        <span className="sr-only"> for {label}</span>
      </button>
    );
  }
  return (
    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
      <input
        className="input"
        type="number"
        inputMode="decimal"
        min="0"
        step="100"
        aria-label={`Monthly budget for ${label}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ width: "7rem", minHeight: "2rem", fontSize: "0.8125rem" }}
      />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ minHeight: "2rem", fontSize: "0.75rem", padding: "0 0.625rem" }}
        onClick={() =>
          start(async () => {
            const res = await setMemberBudgetAction(memberId, Number(value) || 0);
            if (res.error) setError(res.error);
            else setOpen(false);
          })
        }
      >
        {pending ? "…" : "Save"}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: "0.75rem", color: "var(--color-accent-700)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
