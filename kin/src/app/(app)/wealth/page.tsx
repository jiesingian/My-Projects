import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getWealthPane, getNetWorth, getAccounts, getCashFlowPane, type WealthScope, type LedgerEntry, type AccountWithBalance } from "@/lib/queries/wealth";
import { CashFlowSources } from "@/components/cashflow-sources";
import { HubHeader } from "@/components/hub-header";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { AddAccountForm, AddBillForm, AddIncomeScheduleForm, SetBudgetControl, SetTargetControl, AllocationEditor } from "@/components/wealth-controls";
import {
  PayBillControl,
  ReceiveIncomeControl,
  GoalContributeControl,
  PendingEntryActions,
  ValueUpdateControl,
  RemoveButton,
  AccountPrivacyToggle,
  type PickableAccount,
} from "@/components/money-actions";
import { formatCurrency, formatDate, shortNames, selfLabel, selfPossessive } from "@/lib/format";
import { getMembers } from "@/lib/queries/family";
import { PickButton } from "@/components/pick-button";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  ASSET_KIND_LABELS,
  LIABILITY_KIND_LABELS,
  CASH_FLOW_RANGES,
  CASH_FLOW_RANGE_LABELS,
  periodOverPeriodChange,
  cashBalanceTrend,
  billsDueWithin,
  expenseCategoryColor,
  timeSinceLabel,
  type AccountType,
  type AssetKind,
  type LiabilityKind,
  type CashFlowRange,
} from "@/lib/wealth";
import { familyDate, householdDateFormat } from "@/lib/format-family";
import { CollapsibleGroup } from "@/components/collapsible-group";
import { CashFlowChart } from "@/components/cashflow-chart";

/* Joint and Mine were the same page twice; they are one Accounts tab now,
   with a Who button of the kind the Planner uses. Bills moved into Cash
   Flow's Expenses area, and Goals into A&L — money set aside toward one is
   as much a part of what the household owns as anything else in there. */
const SEGMENTS = ["cashflow", "accounts", "assets"] as const;
type Seg = (typeof SEGMENTS)[number];
const SEGMENT_LABELS: Record<Seg, string> = { cashflow: "Cash Flow", accounts: "Accounts", assets: "A&L" };

export default async function WealthPage({ searchParams }: { searchParams: Promise<{ seg?: string; who?: string; range?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "cashflow";
  const who = sp.who ?? "all";
  const range: CashFlowRange = (CASH_FLOW_RANGES as readonly string[]).includes(sp.range ?? "") ? (sp.range as CashFlowRange) : "month";

  const segments = SEGMENTS.map((s) => ({ label: SEGMENT_LABELS[s], href: `/wealth?seg=${s}`, active: s === seg }));
  const currency = me.families.currency;

  return (
    <div>
      <HubHeader n="05" title="Wealth" segments={segments} dateFormat={me.families.date_format} />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        {seg === "cashflow" && <CashFlowPane familyId={me.family_id} memberId={me.id} currency={currency} range={range} scope={who} />}
        {seg === "accounts" && <ScopePane scope={who} familyId={me.family_id} memberId={me.id} currency={currency} range={range} />}
        {seg === "assets" && <AssetsPane familyId={me.family_id} memberId={me.id} currency={currency} scope={who} />}
      </div>
    </div>
  );
}

/** Everything the Who picker needs, built once and shared by every tab that
 * offers one -- Everyone plus each active member, "Me" in place of the
 * viewer's own name. `hrefFor` lets each tab keep its own other query
 * params (Cash Flow's range, in particular) when the picker changes who. */
async function whoPicker(familyId: string, memberId: string, scope: WealthScope, hrefFor: (who: string) => string) {
  const members = await getMembers(familyId);
  const active = members.filter((m) => m.status !== "pending" && m.status !== "removed");
  const labels = shortNames(active.map((m) => m.full_name)).map((l, i) => selfLabel(l, active[i].id === memberId));
  const whoLabel = scope === "all" ? "All" : (labels[active.findIndex((m) => m.id === scope)] ?? "All");
  const options = [
    { label: "Everyone", href: hrefFor("all"), active: scope === "all" },
    ...active.map((m, i) => ({ label: labels[i], href: hrefFor(m.id), active: scope === m.id })),
  ];
  return { active, labels, whoLabel, options };
}

/* --------------------------------------------------------------- shared bits */

function Hero({ label, amount, currency, caption, delta }: { label: string; amount: number; currency: string; caption?: string; delta?: React.ReactNode }) {
  return (
    <Blueprint style={{ padding: "0.9375rem", marginBottom: "0.875rem" }}>
      <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem", margin: "9px 0 0" }}>
        <span style={{ font: "600 2.375rem/1.05 var(--font-heading)", letterSpacing: "-.02em" }}>{formatCurrency(amount, currency)}</span>
        {delta}
      </div>
      {caption && <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.375rem" }}>{caption}</div>}
    </Blueprint>
  );
}

/** Turns a hero number into a judgment ("up ₱2,100 from last month") instead
 * of making anyone read the graph to find out -- the badge every net-worth
 * screen from Mint to Monarch leads with. `null` (fewer than two periods of
 * history, or no real change) renders nothing rather than a badge with
 * nothing to say. Up reads as the app's own accent, the way a positive
 * number already does elsewhere on this page; down stays neutral rather
 * than reaching for a red this app has never used -- a lighter grocery
 * month is not an error state. */
function DeltaBadge({ change, currency, noun }: { change: ReturnType<typeof periodOverPeriodChange>; currency: string; noun: string }) {
  if (!change || change.netDelta === 0) return null;
  const up = change.netDelta > 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.1875rem",
        padding: "0.1875rem 0.5625rem",
        borderRadius: 999,
        fontSize: "0.78125rem",
        fontFamily: "var(--font-numeric)",
        color: up ? "var(--color-accent-700)" : "var(--color-neutral-700)",
        background: up ? "var(--color-accent-100)" : "var(--color-neutral-200)",
      }}
    >
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {formatCurrency(Math.abs(change.netDelta), currency)}
      {change.pctChange !== null && ` (${Math.abs(Math.round(change.pctChange))}%)`}
      <span className="sr-only">
        {" "}
        {up ? "up" : "down"} from {noun}
      </span>
    </span>
  );
}

/** `cap` may be null, which means there is no target to measure against --
 * not a target of nothing. Another member's target is private to them (the
 * row-level policy on wealth_targets says so), so it reads back as zero here;
 * rendering that as "0 of 0" and calling it their target was the page stating
 * a number it had never been allowed to see. */
function Meter({ label, value, cap, currency, note }: { label: string; value: number; cap: number | null; currency: string; note?: string }) {
  const pct = cap !== null && cap > 0 ? Math.min(100, Math.round((value / cap) * 100)) : 0;
  const over = cap !== null && cap > 0 && value > cap;
  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: "0.3125rem" }}>
        <span style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>{label}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: "0.8125rem" }}>
          {cap === null ? formatCurrency(value, currency) : `${formatCurrency(value, currency)} of ${formatCurrency(cap, currency)}`}
        </span>
      </div>
      <div style={{ height: 10, border: "1px solid var(--color-divider)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: over ? "var(--color-accent-700)" : "var(--color-accent)" }} />
      </div>
      {(note || over) && (
        <div style={{ fontSize: "0.78125rem", color: over ? "var(--color-accent-700)" : "var(--color-neutral-600)", marginTop: "0.25rem" }}>
          {over ? `Over by ${formatCurrency(value - cap, currency)}` : note}
        </div>
      )}
    </div>
  );
}

type HistoryPoint = { key: string; label: string; income: number; expense: number };

/** Money in against money out, over whatever stretch of history is handed
 * in — six fixed months on the Accounts tab, or the Cash Flow tab's
 * switchable week/month/year window. Two series, so each is named in the
 * legend and always sits in the same slot within its period — never told
 * apart by colour alone. */
function HistoryStrip({ history, currency, title = "LAST SIX MONTHS" }: { history: HistoryPoint[]; currency: string; title?: string }) {
  const peak = Math.max(1, ...history.flatMap((h) => [h.income, h.expense]));
  const busiest = history.reduce((a, b) => (b.expense > a.expense ? b : a), history[0]);

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      {/* A hover title on each bar is all a sighted mouse user gets today;
          this is the same information in words, for a screen reader or a
          keyboard user who can reach neither a hover nor the bars' shape. */}
      <p className="sr-only">
        {title}, {history.length} periods.{" "}
        {history.map((h) => `${h.label}: in ${formatCurrency(h.income, currency)}, out ${formatCurrency(h.expense, currency)}`).join("; ")}.
      </p>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: "0.5625rem" }}>
        <span style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>{title}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: "0.75rem", fontSize: "0.75rem", color: "var(--color-neutral-600)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <i style={{ width: 8, height: 8, background: "var(--color-accent)", display: "inline-block" }} /> In
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <i style={{ width: 8, height: 8, background: "color-mix(in srgb, var(--color-text) 40%, transparent)", display: "inline-block" }} /> Out
          </span>
        </span>
      </div>

      <div aria-hidden="true" style={{ display: "flex", gap: "0.375rem", alignItems: "flex-end", height: 62, borderBottom: "1px solid var(--color-divider)", paddingBottom: "0.0625rem" }}>
        {history.map((h) => (
          <div key={h.key} style={{ flex: 1, display: "flex", gap: "0.125rem", alignItems: "flex-end", height: "100%" }}>
            <span
              title={`In ${formatCurrency(h.income, currency)}`}
              style={{
                flex: 1,
                height: `${Math.max(h.income > 0 ? 3 : 0, (h.income / peak) * 100)}%`,
                background: "var(--color-accent)",
                borderRadius: "3px 3px 0 0",
              }}
            />
            <span
              title={`Out ${formatCurrency(h.expense, currency)}`}
              style={{
                flex: 1,
                height: `${Math.max(h.expense > 0 ? 3 : 0, (h.expense / peak) * 100)}%`,
                background: "color-mix(in srgb, var(--color-text) 40%, transparent)",
                borderRadius: "3px 3px 0 0",
              }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: "flex", gap: "0.375rem", marginTop: "0.3125rem" }}>
        {history.map((h) => (
          <div key={h.key} style={{ flex: 1, textAlign: "center", fontSize: "0.53125rem", letterSpacing: ".06em", color: "var(--color-neutral-600)" }}>
            {h.label}
          </div>
        ))}
      </div>
      {busiest && busiest.expense > 0 && (
        <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.4375rem" }}>
          Heaviest spend was {busiest.label} at {formatCurrency(busiest.expense, currency)}.
        </div>
      )}
    </div>
  );
}

/** Cash balance across the same window the history strip already covers --
 * the trend line every net-worth screen from Mint to Monarch leads with,
 * reconstructed from cashBalanceTrend (lib/wealth.ts) rather than stored.
 * Cash only: assets, liabilities and goals don't carry a per-period history
 * the way transactions do, so a full net-worth trend needs a stored monthly
 * snapshot -- a migration, not this. */
function CashTrendLine({ trend, currency }: { trend: { key: string; label: string; balance: number }[]; currency: string }) {
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
          <span aria-hidden="true">{up ? "▲" : "▼"}</span> {formatCurrency(Math.abs(changed), currency)} over {trend.length} periods
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
        Cash trend, {trend.length} periods, {formatCurrency(trend[0].balance, currency)} to {formatCurrency(trend[trend.length - 1].balance, currency)}.{" "}
        {trend.map((t) => `${t.label}: ${formatCurrency(t.balance, currency)}`).join("; ")}.
      </p>
    </div>
  );
}

/** Where this period's spend actually went, as one bar instead of a column
 * of separate ones -- proportion reads faster from a single divided bar
 * than from five stacked progress meters (a donut would say the same thing,
 * but a stacked bar is the steadier form for part-to-whole and doesn't run
 * into the same colour-adjacency limits a pie's wedges do). Categories
 * beyond the seven coloured ones share the neutral rather than a colour
 * nobody could tell apart from its neighbour (expenseCategoryColor). */
function CategorySpendBar({ categories, currency }: { categories: { category: string; spent: number }[]; currency: string }) {
  const spent = categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent);
  const total = spent.reduce((sum, c) => sum + c.spent, 0);
  if (total <= 0) return null;

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div aria-hidden="true" style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: "0.125rem" }}>
        {spent.map((c) => (
          <span
            key={c.category}
            title={`${c.category}: ${formatCurrency(c.spent, currency)}`}
            style={{ width: `${(c.spent / total) * 100}%`, minWidth: 3, background: expenseCategoryColor(c.category) }}
          />
        ))}
      </div>
      <div aria-hidden="true" style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem 0.875rem", marginTop: "0.5625rem" }}>
        {spent.map((c) => (
          <span key={c.category} style={{ display: "flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.75rem", color: "var(--color-neutral-700)" }}>
            <i style={{ width: 8, height: 8, borderRadius: "50%", background: expenseCategoryColor(c.category), display: "inline-block" }} />
            {c.category} · {Math.round((c.spent / total) * 100)}%
          </span>
        ))}
      </div>
      <p className="sr-only">
        Spending by category this period, total {formatCurrency(total, currency)}.{" "}
        {spent.map((c) => `${c.category}: ${formatCurrency(c.spent, currency)}, ${Math.round((c.spent / total) * 100)}%`).join("; ")}.
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)", margin: "20px 0 8px" }}>{children}</div>
  );
}

function EntryRow({ entry, currency, dateFormat, showAccount }: { entry: LedgerEntry; currency: string; dateFormat: string; showAccount?: boolean }) {
  const isIn = entry.direction === "in";
  return (
    <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline", padding: "0.625rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: "0.875rem", display: "block" }}>{entry.particulars}</span>
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {formatDate(entry.occurred_at, dateFormat)}
          {entry.category ? ` · ${entry.category}` : ""}
          {showAccount && entry.accountName ? ` · ${entry.accountName}` : ""}
        </span>
      </span>
      <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none", color: isIn ? "var(--color-accent-700)" : "inherit" }}>
        {isIn ? "+" : "−"}
        {formatCurrency(Number(entry.amount), currency)}
      </span>
    </div>
  );
}

function PendingBlock({ pending, currency, dateFormat }: { pending: LedgerEntry[]; currency: string; dateFormat: string }) {
  if (pending.length === 0) return null;
  return (
    <>
      <SectionLabel>WAITING ON YOU</SectionLabel>
      {pending.map((p) => (
        <Blueprint key={p.id} style={{ padding: "0.75rem", marginBottom: "0.625rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.875rem" }}>{p.particulars}</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: "0.8125rem" }}>
              {p.direction === "in" ? "+" : "−"}
              {formatCurrency(Number(p.amount), currency)}
            </span>
          </div>
          <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.1875rem" }}>
            {p.accountName} · started {formatDate(p.occurred_at, dateFormat)} · not counted yet
          </div>
          <PendingEntryActions transactionId={p.id} />
        </Blueprint>
      ))}
    </>
  );
}

/** What's actually coming due, not just what's unpaid -- the "upcoming" view
 * Copilot and YNAB build for exactly this question: not "here is every open
 * bill" (the full list sits right below, sorted the same way) but "here is
 * what you'll need in the next {days} days, and how much, together". An
 * overdue bill is still owed, so it leads the list rather than being left
 * off for being in the past (billsDueWithin, lib/wealth.ts). */
function UpcomingBills<T extends { id: string; name: string; amount: number | string; due_date: string | null; status: string }>({
  bills,
  currency,
  fmtDate,
  days = 30,
}: {
  bills: T[];
  currency: string;
  fmtDate: (d: string) => string;
  days?: number;
}) {
  const { bills: due, total } = billsDueWithin(bills, days);
  if (due.length === 0) return null;
  const today = new Date();

  return (
    <Blueprint style={{ padding: "0.8125rem", marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <span style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>NEXT {days} DAYS</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: "0.9375rem", fontWeight: 600 }}>{formatCurrency(total, currency)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4375rem", marginTop: "0.5625rem" }}>
        {due.map((b) => {
          const overdue = b.due_date !== null && new Date(b.due_date) < today;
          return (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: "0.625rem", fontSize: "0.84375rem" }}>
              <span>
                {b.name}
                {overdue && <span style={{ color: "var(--color-accent-700)" }}> · overdue</span>}
              </span>
              <span style={{ fontFamily: "var(--font-numeric)", flex: "none" }}>
                {formatCurrency(Number(b.amount), currency)}
                {b.due_date && ` · ${fmtDate(b.due_date)}`}
              </span>
            </div>
          );
        })}
      </div>
    </Blueprint>
  );
}

function QuickActions() {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.125rem" }}>
      {[
        { label: "MONEY IN", mode: "in" },
        { label: "MONEY OUT", mode: "out" },
        { label: "TRANSFER", mode: "transfer" },
      ].map((a) => (
        <Link
          key={a.mode}
          href={`/wealth/transact?mode=${a.mode}`}
          className="btn btn-secondary"
          style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.8125rem", letterSpacing: ".04em", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {a.label}
        </Link>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- cash flow */

async function CashFlowPane({ familyId, memberId, currency, range, scope }: { familyId: string; memberId: string; currency: string; range: CashFlowRange; scope: WealthScope }) {
  const [fmtDate, dateFormat] = await Promise.all([familyDate(), householdDateFormat()]);
  const [cf, budget, accounts, who] = await Promise.all([
    getCashFlowPane(familyId, range, scope),
    getWealthPane(familyId, memberId, scope),
    getAccounts(familyId),
    whoPicker(familyId, memberId, scope, (w) => `/wealth?seg=cashflow&range=${range}&who=${w}`),
  ]);
  const pickable = toPickable(accounts, memberId);
  const bareAccounts = pickable.map((a) => ({ id: a.id, name: a.name }));
  const periodNoun = range === "day" ? "day" : range === "week" ? "week" : range === "year" ? "year" : "month";
  const mine = scope === memberId;
  const isJoint = scope === "all";
  const whosePossessive = selfPossessive(who.whoLabel, mine);
  // Same budget-vs-target data the Accounts tab used to show, moved here:
  // one is the household's spending ceiling (Expenses), the other a
  // member's own earning target (Income) -- both monthly by nature of the
  // tables behind them, independent of whichever graph range is active.
  const categories = [...budget.allocations, ...budget.unbudgeted];
  const momChange = periodOverPeriodChange(cf.history);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "14px 0 4px" }}>
        <PickButton title="Who" icon="users" label={who.whoLabel} options={who.options} />
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {scope === "all" ? "Everything you can see" : mine ? "Your own accounts" : "Their accounts, as shared"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", margin: "4px 0 10px" }}>
        <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
          {cf.net > 0
            ? `More came in than went out this ${periodNoun}.`
            : cf.net < 0
              ? `More went out than came in this ${periodNoun}.`
              : `Income and expenses came out even this ${periodNoun}.`}
        </span>
        <DeltaBadge change={momChange} currency={currency} noun={`last ${periodNoun}`} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "0 0 10px" }}>
        <PickButton
          title="Graph range"
          icon="calendarDays"
          label={CASH_FLOW_RANGE_LABELS[range]}
          options={CASH_FLOW_RANGES.map((r) => ({ label: CASH_FLOW_RANGE_LABELS[r], href: `/wealth?seg=cashflow&range=${r}&who=${scope}`, active: range === r }))}
        />
      </div>
      <CashFlowChart history={cf.history} currency={currency} periodNoun={periodNoun} />

      <CollapsibleGroup title="INCOME" defaultOpen={false}>
      {!isJoint && (
        <>
          <Meter
            label={mine ? "EARNED OF TARGET" : "EARNED THIS MONTH"}
            value={budget.monthIncome}
            cap={mine ? budget.budgetAmount : null}
            currency={currency}
            note={mine ? "Your own revenue target this month." : `${whosePossessive} target is theirs to see.`}
          />
          {/* Only your own target is yours to set. */}
          {scope === memberId && <SetTargetControl month={budget.month} year={budget.year} current={budget.budgetAmount} />}
        </>
      )}
      {cf.expectedIncome.length === 0 && cf.receivedIncome.length === 0 && cf.recentIncome.length === 0 && (
        <Empty icon="💰" title="Nothing recorded yet" line="Salary, a regular gift, business revenue — expect it here so receiving it is one tap." />
      )}
      {cf.expectedIncome.map((s) => (
        <div key={s.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: "0.6875rem", alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1.0625rem/1.1 var(--font-heading)", display: "block" }}>{s.name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {s.category ?? "Salary"}
                {s.next_date ? ` · expected ${fmtDate(s.next_date)}` : ""}
              </span>
            </span>
            <span style={{ textAlign: "right", flex: "none" }}>
              <span style={{ font: "600 1rem/1 var(--font-heading)", display: "block" }}>{formatCurrency(Number(s.amount), currency)}</span>
              <Tag variant={s.status === "pending" ? "outline" : "accent"}>{s.status.toUpperCase()}</Tag>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <ReceiveIncomeControl scheduleId={s.id} amount={Number(s.amount)} accounts={pickable} currency={currency} />
            <span style={{ marginLeft: "auto" }}>
              <RemoveButton id={s.id} kind="income_schedule" label={`Delete "${s.name}"`} />
            </span>
          </div>
        </div>
      ))}
      {cf.receivedIncome.map((s) => (
        <div key={s.id} style={{ display: "flex", gap: "0.625rem", alignItems: "baseline", padding: "0.625rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "0.875rem", display: "block" }}>{s.name}</span>
            <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>{s.received_at ? `received ${fmtDate(s.received_at)}` : "received"}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Tag variant="outline">SETTLED</Tag>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", color: "var(--color-accent-700)" }}>+{formatCurrency(Number(s.amount), currency)}</span>
          </span>
        </div>
      ))}
      {cf.recentIncome.length > 0 && (
        <>
          <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "12px 0 2px" }}>OTHER RECENT ACTIVITY</div>
          {cf.recentIncome.map((e) => (
            <EntryRow key={e.id} entry={e} currency={currency} dateFormat={dateFormat} showAccount />
          ))}
        </>
      )}
      <AddIncomeScheduleForm accounts={bareAccounts} />
      </CollapsibleGroup>

      <CollapsibleGroup title="EXPENSES" defaultOpen={false}>
      {isJoint && (
        <>
          <Meter label="SPENT OF BUDGET" value={budget.monthExpense} cap={budget.budgetAmount} currency={currency} note="Set the month's ceiling below." />
          <SetBudgetControl month={budget.month} year={budget.year} current={budget.budgetAmount} />
        </>
      )}

      <SectionLabel>{isJoint ? "BUDGET VS SPEND BY CATEGORY" : "WHERE IT WENT THIS MONTH"}</SectionLabel>
      {categories.length === 0 && (
        <Empty icon="📊" title="Nothing spent yet this month" line="Once money moves, this breaks it down by category so you can see where it actually goes." />
      )}
      <CategorySpendBar categories={categories} currency={currency} />
      {categories.map((c) => {
        const cap = c.amount > 0 ? c.amount : c.spent;
        const pct = cap > 0 ? Math.min(100, Math.round((c.spent / cap) * 100)) : 0;
        const over = c.amount > 0 && c.spent > c.amount;
        return (
          <div key={c.id} style={{ marginBottom: "0.6875rem" }}>
            <div style={{ display: "flex", alignItems: "center", fontSize: "0.84375rem", marginBottom: "0.25rem" }}>
              <i
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: "50%", background: expenseCategoryColor(c.category), display: "inline-block", marginRight: "0.4375rem", flex: "none" }}
              />
              <span>{c.category}</span>
              {c.amount === 0 && <span style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", marginLeft: "0.375rem" }}>no budget</span>}
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: "0.8125rem" }}>
                {formatCurrency(c.spent, currency)}
                {c.amount > 0 ? ` / ${formatCurrency(c.amount, currency)}` : ""}
              </span>
            </div>
            <div style={{ height: 7, background: "var(--color-neutral-200)" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: over ? "var(--color-accent-700)" : expenseCategoryColor(c.category) }} />
            </div>
          </div>
        );
      })}
      {isJoint && <div style={{ marginTop: "0.75rem" }}><AllocationEditor budgeted={budget.allocations.map((a) => a.category)} /></div>}

      <SectionLabel>BILLS</SectionLabel>
      <CashFlowSources sources={cf.sources} currency={currency} />

      <UpcomingBills bills={cf.openBills} currency={currency} fmtDate={fmtDate} />
      {cf.openBills.length === 0 && cf.settledBills.length === 0 && cf.recentExpense.length === 0 && (
        <Empty icon="🧾" title="Nothing recorded yet" line="Mortgage payments, groceries, checkups, meals, travel, fuel — anything the household spends on." />
      )}
      {cf.openBills.map((b) => (
        <div key={b.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: "0.6875rem", alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1.0625rem/1.1 var(--font-heading)", display: "block" }}>{b.name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {b.category ?? "Utilities"}
                {b.due_date ? ` · due ${fmtDate(b.due_date)}` : ""}
              </span>
            </span>
            <span style={{ textAlign: "right", flex: "none" }}>
              <span style={{ font: "600 1rem/1 var(--font-heading)", display: "block" }}>{formatCurrency(Number(b.amount), currency)}</span>
              <Tag variant={b.status === "scheduled" ? "outline" : "accent"}>{b.status.toUpperCase()}</Tag>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <PayBillControl billId={b.id} amount={Number(b.amount)} accounts={pickable} currency={currency} />
            <span style={{ marginLeft: "auto" }}>
              <RemoveButton id={b.id} kind="bill" label={`Delete "${b.name}"`} />
            </span>
          </div>
        </div>
      ))}
      {cf.settledBills.map((b) => (
        <div key={b.id} style={{ display: "flex", gap: "0.625rem", alignItems: "baseline", padding: "0.625rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "0.875rem", display: "block" }}>{b.name}</span>
            <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
              {b.paid_at ? `paid ${fmtDate(b.paid_at)}` : "paid"}
              {b.paidFromName ? ` from ${b.paidFromName}` : ""}
            </span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Tag variant="outline">SETTLED</Tag>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem" }}>{formatCurrency(Number(b.amount), currency)}</span>
          </span>
        </div>
      ))}
      {cf.recentExpense.length > 0 && (
        <>
          <div style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "16px 0 2px" }}>OTHER RECENT ACTIVITY</div>
          {cf.recentExpense.map((e) => (
            <EntryRow key={e.id} entry={e} currency={currency} dateFormat={dateFormat} showAccount />
          ))}
        </>
      )}
      <AddBillForm />
      </CollapsibleGroup>
    </>
  );
}

/* ------------------------------------------------------------- accounts */

async function ScopePane({ scope, familyId, memberId, currency, range }: { scope: WealthScope; familyId: string; memberId: string; currency: string; range: CashFlowRange }) {
  const [dateFormat, pane, cf, who] = await Promise.all([
    householdDateFormat(),
    getWealthPane(familyId, memberId, scope),
    // Budget and target now live on Cash Flow -- this pane only still
    // needs getCashFlowPane for its own history strip, at whichever range
    // the picker below is set to.
    getCashFlowPane(familyId, range, scope),
    whoPicker(familyId, memberId, scope, (w) => `/wealth?seg=accounts&range=${range}&who=${w}`),
  ]);
  const isJoint = scope === "all";
  const mine = scope === memberId;
  const whosePossessive = selfPossessive(who.whoLabel, mine);
  const monthLabel = new Date(pane.year, pane.month - 1, 1).toLocaleString("en-PH", { month: "long", year: "numeric" }).toUpperCase();
  const periodNoun = range === "day" ? "day" : range === "week" ? "week" : range === "year" ? "year" : "month";
  const momChange = periodOverPeriodChange(cf.history);
  const cashTrend = cashBalanceTrend(cf.history, pane.total);
  const accountGroups = ACCOUNT_TYPES.map((t) => ({
    type: t,
    accounts: pane.accounts.filter((a) => (a.account_type as AccountType) === t),
  })).filter((g) => g.accounts.length > 0);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "14px 0 4px" }}>
        <PickButton title="Who" icon="users" label={who.whoLabel} options={who.options} />
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {isJoint ? "Everything you can see" : mine ? "Your own accounts" : "Their accounts, as shared"}
        </span>
      </div>

      <Hero
        label={isJoint ? "ALL ACCOUNTS · COMBINED" : `${whosePossessive.toUpperCase()} ACCOUNTS · COMBINED`}
        amount={pane.total}
        currency={currency}
        delta={<DeltaBadge change={momChange} currency={currency} noun={`last ${periodNoun}`} />}
        caption={`${pane.accounts.length} account${pane.accounts.length === 1 ? "" : "s"} · ${monthLabel}`}
      />

      <CashTrendLine trend={cashTrend} currency={currency} />

      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "0 0 4px" }}>
        <PickButton
          title="Graph range"
          icon="calendarDays"
          label={CASH_FLOW_RANGE_LABELS[range]}
          options={CASH_FLOW_RANGES.map((r) => ({ label: CASH_FLOW_RANGE_LABELS[r], href: `/wealth?seg=accounts&range=${r}&who=${scope}`, active: range === r }))}
        />
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>Money in against money out, grouped by {CASH_FLOW_RANGE_LABELS[range].toLowerCase()}</span>
      </div>
      <HistoryStrip history={cf.history} currency={currency} title={`BY ${CASH_FLOW_RANGE_LABELS[range].toUpperCase()}`} />

      <QuickActions />

      <PendingBlock pending={pane.pending} currency={currency} dateFormat={dateFormat} />

      <SectionLabel>{isJoint ? "ACCOUNTS" : `${whosePossessive.toUpperCase()} ACCOUNTS`}</SectionLabel>
      {pane.accounts.length === 0 && (
        <Empty icon="🏦" title="No accounts yet" line="Add the accounts the household actually uses — a bank, a wallet, the cash in the drawer — and Kin keeps the running balance." />
      )}
      {accountGroups.map((group) => (
        <CollapsibleGroup key={group.type} title={`${ACCOUNT_TYPE_LABELS[group.type].toUpperCase()} · ${group.accounts.length}`} defaultOpen={false}>
          {group.accounts.map((a) => (
            <Link
              key={a.id}
              href={`/wealth/accounts/${a.id}`}
              style={{ display: "flex", gap: "0.625rem", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", textDecoration: "none", color: "inherit" }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>{a.name}</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                  {a.institution ? a.institution : ACCOUNT_TYPE_LABELS[a.account_type as AccountType] ?? a.account_type}
                  {a.sub_note ? ` · ${a.sub_note}` : ""}
                </span>
                {/* Who can see it, and — if it is yours — a tap to change that. */}
                <span style={{ display: "inline-flex", marginTop: "0.3125rem" }}>
                  <AccountPrivacyToggle
                    accountId={a.id}
                    isPrivate={a.is_private}
                    isJoint={a.is_joint}
                    canChange={!a.is_joint && a.owner_member_id === memberId}
                  />
                </span>
              </span>
              <span style={{ textAlign: "right", flex: "none" }}>
                <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", display: "block" }}>{formatCurrency(a.balance, currency)}</span>
                {a.pendingCount > 0 && <Tag variant="outline">{a.pendingCount} PENDING</Tag>}
                <span style={{ display: "block", marginTop: "0.375rem" }}>
                  <RemoveButton id={a.id} kind="account" label={`Archive "${a.name}"`} />
                </span>
              </span>
            </Link>
          ))}
        </CollapsibleGroup>
      ))}
      {/* A new account is opened in your own name, so it is only offered
          where that is what you would mean. */}
      {(isJoint || mine) && <AddAccountForm isJoint={isJoint} />}

      {pane.recent.length > 0 && (
        <>
          <SectionLabel>RECENT ACTIVITY</SectionLabel>
          {pane.recent.map((e) => (
            <EntryRow key={e.id} entry={e} currency={currency} dateFormat={dateFormat} showAccount />
          ))}
        </>
      )}

      <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.875rem", lineHeight: 1.45 }}>
        A personal account is private until its owner opens it to the family. Private ones are not hidden from you by the
        app — the database never sends them, so nobody sees them but their owner.
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- A&L */

async function AssetsPane({ familyId, memberId, currency, scope }: { familyId: string; memberId: string; currency: string; scope: WealthScope }) {
  const fmtDate = await familyDate();
  const [{ assets, liabilities, goals, cashAccounts, assetTotal, liabilityTotal, goalTotal, cashTotal, netWorth }, who, allAccounts] = await Promise.all([
    getNetWorth(familyId, scope),
    whoPicker(familyId, memberId, scope, (w) => `/wealth?seg=assets&who=${w}`),
    getAccounts(familyId),
  ]);
  // Deliberately not `cashAccounts` -- that list is scoped to whoever the
  // Who picker is showing, but the account a contribution actually leaves
  // from has to be one the viewer themself can pay out of, regardless of
  // whose net worth they're looking at.
  const pickableCash = toPickable(allAccounts, memberId);
  const mine = scope === memberId;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "14px 0 4px" }}>
        <PickButton title="Who" icon="users" label={who.whoLabel} options={who.options} />
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {scope === "all" ? "Everything you can see" : mine ? "Your own" : "Theirs, as shared"}
        </span>
      </div>

      <Hero
        label="NET WORTH"
        amount={netWorth}
        currency={currency}
        caption={`${formatCurrency(cashTotal, currency)} cash + ${formatCurrency(goalTotal, currency)} in goals + ${formatCurrency(assetTotal, currency)} owned − ${formatCurrency(liabilityTotal, currency)} owed`}
      />

      <CollapsibleGroup title="ASSETS" defaultOpen={false}>
      <SectionLabel>CASH & SAVINGS</SectionLabel>
      {cashAccounts.length === 0 && (
        <Empty icon="🏦" title="No accounts yet" line="Every account you can see shows up here automatically once it exists — add one from the Accounts tab." />
      )}
      {cashAccounts.map((a) => (
        <Link
          key={a.id}
          href={`/wealth/accounts/${a.id}`}
          style={{ display: "flex", gap: "0.625rem", alignItems: "baseline", padding: "0.625rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", textDecoration: "none", color: "inherit" }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "0.9375rem", display: "block" }}>{a.name}</span>
            <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
              {ACCOUNT_TYPE_LABELS[a.account_type as AccountType] ?? a.account_type}
              {a.institution ? ` · ${a.institution}` : ""}
            </span>
          </span>
          <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none" }}>{formatCurrency(a.balance, currency)}</span>
        </Link>
      ))}
      {cashAccounts.length > 0 && (
        <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.5rem" }}>
          Read-only here — open an account from the Accounts tab to edit or add one.
        </div>
      )}

      <SectionLabel>SAVINGS GOALS</SectionLabel>
      {goals.length === 0 && (
        <Empty icon="🎯" title="No goals yet" line="A trip, a deposit, an emergency fund. Name what you are saving for and every contribution counts toward it." />
      )}
      {goals.map((g) => {
        const target = Number(g.target_amount ?? 0);
        const current = Number(g.current_amount);
        const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        const owner = (g.owner as unknown as { full_name: string } | null)?.full_name?.split(" ")[0]?.toUpperCase();
        return (
          <Blueprint key={g.id} style={{ padding: "0.8125rem", marginBottom: "0.8125rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span style={{ font: "600 1.125rem/1.05 var(--font-heading)" }}>{g.title}</span>
              <Tag variant={g.is_joint ? "accent" : "neutral"} className="ml-auto">
                {g.is_joint ? "JOINT" : owner ?? "MINE"}
              </Tag>
            </div>
            {g.sub_note && <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "4px 0 9px" }}>{g.sub_note}</div>}
            <div style={{ height: 8, border: "1px solid var(--color-divider)", background: "var(--color-bg)", marginTop: "0.5rem" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-accent)" }} />
            </div>
            <div style={{ display: "flex", fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>
              <span>
                {formatCurrency(current, currency)} of {formatCurrency(target, currency)}
              </span>
              <span style={{ marginLeft: "auto" }}>{pct}%</span>
            </div>
            {g.target_date && (
              <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>
                Target date {fmtDate(g.target_date)}
                {target > current ? ` · ${formatCurrency(target - current, currency)} to go` : " · funded"}
              </div>
            )}
            {g.linked_account_id && (
              <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>
                Saved in {pickableCash.find((a) => a.id === g.linked_account_id)?.name ?? "an account you can no longer see"}
              </div>
            )}
            <GoalContributeControl goalId={g.id} accounts={pickableCash} currency={currency} linkedAccountId={g.linked_account_id} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <RemoveButton id={g.id} kind="goal" label={`Delete "${g.title}"`} />
            </div>
          </Blueprint>
        );
      })}
      <Link href="/wealth/add" className="btn btn-secondary btn-block" style={{ minHeight: "2.625rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginBottom: "1.25rem" }}>
        + ADD GOAL
      </Link>

      <SectionLabel>OTHER ASSETS</SectionLabel>
      {assets.length === 0 && (
        <Empty icon="🏠" title="Nothing recorded yet" line="Property, a vehicle, anything the family owns that holds value. Recorded here, it counts toward your net worth." />
      )}
      {assets.map((a) => (
        <div key={a.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>{a.name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {ASSET_KIND_LABELS[a.kind as AssetKind] ?? a.kind}
                {a.acquired_on ? ` · since ${fmtDate(a.acquired_on)}` : ""}
                {a.note ? ` · ${a.note}` : ""}
                {a.updated_at ? ` · updated ${timeSinceLabel(a.updated_at)}` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none" }}>{formatCurrency(Number(a.value), currency)}</span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.4375rem" }}>
            <ValueUpdateControl id={a.id} current={Number(a.value)} kind="asset" />
            <RemoveButton id={a.id} kind="asset" label={`Remove "${a.name}"`} />
          </div>
        </div>
      ))}
      <Link href="/wealth/assets/new?kind=asset" className="btn btn-secondary btn-block" style={{ minHeight: "2.625rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginTop: "0.25rem" }}>
        + ASSET
      </Link>
      </CollapsibleGroup>

      <CollapsibleGroup title="LIABILITIES" defaultOpen={false}>
      {liabilities.length === 0 && (
        <Empty icon="✅" title="Nothing owed" line="No loans or debts on record. If that changes, adding them here keeps the net worth figure honest." />
      )}
      {liabilities.map((l) => (
        <div key={l.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>{l.name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {LIABILITY_KIND_LABELS[l.kind as LiabilityKind] ?? l.kind}
                {l.lender ? ` · ${l.lender}` : ""}
                {l.monthly_payment ? ` · ${formatCurrency(Number(l.monthly_payment), currency)}/mo` : ""}
                {l.updated_at ? ` · updated ${timeSinceLabel(l.updated_at)}` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none", color: "var(--color-accent-700)" }}>
              −{formatCurrency(Number(l.balance), currency)}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.4375rem" }}>
            <ValueUpdateControl id={l.id} current={Number(l.balance)} kind="liability" />
            <RemoveButton id={l.id} kind="liability" label={`Remove "${l.name}"`} />
          </div>
        </div>
      ))}
      <Link href="/wealth/assets/new?kind=liability" className="btn btn-secondary btn-block" style={{ minHeight: "2.625rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginTop: "0.25rem" }}>
        + LIABILITY
      </Link>
      </CollapsibleGroup>

      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "1rem" }}>
        Net worth counts every account balance, everything saved toward a goal, plus what you own, less what you owe.
        Update a value whenever it changes.
      </div>
    </>
  );
}

function toPickable(accounts: AccountWithBalance[], memberId: string): PickableAccount[] {
  return accounts
    .filter((a) => a.is_joint || a.owner_member_id === memberId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      linked_app_url: a.linked_app_url,
      balance: a.balance,
      is_joint: a.is_joint,
    }));
}
