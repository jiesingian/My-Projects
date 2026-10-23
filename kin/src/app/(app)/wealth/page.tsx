import Link from "next/link";
import { Icon } from "@/components/icons";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { NextBillOffers } from "@/components/next-bill-offer";
import { toPickable } from "@/lib/account-picker";
import { getWealthPane, getAccountViewers, getNetWorth, getAccounts, getArchivedAccounts, getCashFlowPane, getNextBillOffers, getBudgetHistory, getSpendingByMember, recordAndGetNetWorthHistory, type WealthScope, type LedgerEntry } from "@/lib/queries/wealth";
import { CashFlowSources } from "@/components/cashflow-sources";
import { HubHeader } from "@/components/hub-header";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { AddAccountForm, AddBillForm, AddIncomeScheduleForm, BillReminderPicker, SetBudgetControl, SetTargetControl, AllocationEditor } from "@/components/wealth-controls";
import {
  PayBillControl,
  ReceiveIncomeControl,
  GoalContributeControl,
  FundPaidControl,
  PendingEntryActions,
  ValueUpdateControl,
  AssetBreakdownControl,
  LoanScheduleControl,
  RemoveButton,
  AccountPrivacyToggle,
  MoveMoneyButton,
  IncludePrivateToggle,
  RestoreAccountButton,
  DeleteAccountButton,
} from "@/components/money-actions";
import { formatCurrency, formatDate, shortNames, selfLabel, selfPossessive } from "@/lib/format";
import { getMembers } from "@/lib/queries/family";
import { PickButton } from "@/components/pick-button";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  ASSET_KIND_LABELS,
  ASSET_KINDS,
  LIABILITY_KINDS,
  LIABILITY_KIND_LABELS,
  CASH_FLOW_RANGES,
  CASH_FLOW_RANGE_LABELS,
  INCOME_FREQUENCY_LABELS,
  INCOME_SOURCES,
  categoryLabel,
  incomeSourceColor,
  periodOverPeriodChange,
  cashBalanceTrend,
  billsDueWithin,
  DEFAULT_BILL_REMIND_DAYS,
  expenseCategoryColor,
  timeSinceLabel,
  type AccountType,
  type AccountAudienceMember,
  type AssetKind,
  type LiabilityKind,
  type CashFlowRange,
  WEALTH_FAMILY,
  TRANSFER_CATEGORY,
  isHouseholdScope,
  inScope,
  loanStatus,
} from "@/lib/wealth";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { familyDate, householdDateFormat } from "@/lib/format-family";
import { CollapsibleGroup, FoldableSection } from "@/components/collapsible-group";
import { ScrollIntoView } from "@/components/scroll-into-view";
import { OwnerBreakdownPie, CashFlowChart, CashTrendLine, CategoryDonut, NetWorthLine, SpendingByPerson, type BreakdownSlice } from "@/components/wealth-charts";
import { isGrownUp } from "@/lib/roles";
import { getUtang } from "@/lib/queries/utang";
import { instalmentPlan } from "@/lib/utang";
import { isGone } from "@/lib/member-status";
import { canMarkPaid, cycleStart, fundPlan, STATUS_TEXT } from "@/lib/sinking-fund";

/* Joint and Mine were the same page twice; they are one Accounts tab now,
   with a Who button of the kind the Planner uses. Bills moved into Cash
   Flow's Expenses area, and Goals into A&L — money set aside toward one is
   as much a part of what the household owns as anything else in there. */
const SEGMENTS = ["cashflow", "accounts", "assets"] as const;
type Seg = (typeof SEGMENTS)[number];
const SEGMENT_LABELS: Record<Seg, string> = { cashflow: "Cash Flow", accounts: "Accounts", assets: "A&L" };

export default async function WealthPage({ searchParams }: { searchParams: Promise<{ seg?: string; who?: string; range?: string; new?: string; open?: string; bill?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const sp = await searchParams;
  // `open=expenses&bill=<id>` arrives from Today's Pay button: the group has
  // to be open on first paint, and the row is scrolled to once it is there
  // (a `#` anchor landed only when the streamed pane beat the browser to it).
  const openExpenses = sp.open === "expenses";
  const billId = sp.bill?.trim() || null;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "cashflow";
  const who = sp.who ?? "all";
  const range: CashFlowRange = (CASH_FLOW_RANGES as readonly string[]).includes(sp.range ?? "") ? (sp.range as CashFlowRange) : "month";

  const segments = SEGMENTS.map((s) => ({ label: SEGMENT_LABELS[s], href: `/wealth?seg=${s}`, active: s === seg }));
  const currency = me.families.currency;

  return (
    <div>
      <HubHeader n="05" title="Wealth" segments={segments} dateFormat={me.families.date_format} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        {seg === "cashflow" && <CashFlowPane familyId={me.family_id} memberId={me.id} currency={currency} range={range} scope={who} grownUp={isGrownUp(me.role)} plus={readAccess(me.families).plus} openExpenses={openExpenses} billId={billId} />}
        {seg === "accounts" && <ScopePane scope={who} familyId={me.family_id} memberId={me.id} currency={currency} range={range} newAccountId={sp.new} includePrivate={me.wealth_include_private} grownUp={isGrownUp(me.role)} />}
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
  const active = members.filter((m) => m.status !== "pending" && !isGone(m.status));
  const labels = shortNames(active.map((m) => m.full_name)).map((l, i) => selfLabel(l, active[i].id === memberId));
  const whoLabel = scope === "all" ? "All" : scope === WEALTH_FAMILY ? "Family" : (labels[active.findIndex((m) => m.id === scope)] ?? "All");
  // All: every member's and the family's together. Family: joint and
  // unassigned only (WEALTH_FAMILY). The same two words as the Planner's.
  const options = [
    { label: "All", href: hrefFor("all"), active: scope === "all" },
    { label: "Family", href: hrefFor(WEALTH_FAMILY), active: scope === WEALTH_FAMILY },
    ...active.map((m, i) => ({ label: labels[i], href: hrefFor(m.id), active: scope === m.id })),
  ];
  // Whose a thing is, for lists that mix people (All, Family): two
  // "BDO - Savings" read as one account without it. Null when the row has
  // no owner to name, or one who has left.
  const ownerOf = (ownerId: string | null, isJoint: boolean): string | null => {
    if (isJoint) return "Joint";
    if (!ownerId) return null;
    if (ownerId === memberId) return "Yours";
    const i = active.findIndex((m) => m.id === ownerId);
    return i < 0 ? null : `${labels[i]}\u2019s`;
  };
  // Whose a slice of a breakdown donut is. Slots follow the household, not
  // the view -- Joint 0, then each member in order -- so a person's colour
  // doesn't change with the Who picker. A departed member's falls to Family.
  const sliceOwner = (ownerId: string | null, isJoint: boolean | null) => {
    const i = isJoint || !ownerId ? -1 : active.findIndex((m) => m.id === ownerId);
    return {
      ownerKey: i < 0 ? "joint" : ownerId!,
      ownerLabel: i < 0 ? "Family (joint)" : ownerId === memberId ? "You" : labels[i],
      ownerSlot: i + 1,
    };
  };
  return { active, labels, whoLabel, options, ownerOf, sliceOwner };
}

/* --------------------------------------------------------------- shared bits */

/** The headline figure. `breakdown` puts a by-owner donut beside it and
 * each owner's items under it (Accounts: accounts; A&L: what is owned). */
function Hero({ label, amount, currency, caption, delta, breakdown, noun }: { label: string; amount: number; currency: string; caption?: string; delta?: React.ReactNode; breakdown?: BreakdownSlice[]; noun?: string }) {
  const head = (
    <>
      <div className="kin-eyebrow">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "0.5rem", margin: "9px 0 0" }}>
        <span style={{ font: "600 min(2.375rem, 10vw)/1.05 var(--font-heading)", letterSpacing: "-.02em" }}>{formatCurrency(amount, currency)}</span>
        {delta}
      </div>
      {caption && <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.375rem" }}>{caption}</div>}
    </>
  );
  return (
    <Blueprint style={{ padding: "0.9375rem", marginBottom: "0.875rem" }}>
      {breakdown ? <OwnerBreakdownPie head={head} slices={breakdown} currency={currency} noun={noun} /> : head}
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
 * month is not an error state.
 *
 * It shows last period's net, not the difference between the two nets. The
 * difference was right and read wrong: after a salary month, "▼ ₱132,119.5
 * (101%)" looked like ₱132k had vanished when October was simply −₱1,890
 * against September's +₱130,229 (21 October audit). The arrow still says
 * which way it went; the number is one a family can check against the bar. */
function DeltaBadge({ change, currency, noun }: { change: ReturnType<typeof periodOverPeriodChange>; currency: string; noun: string }) {
  if (!change || change.netDelta === 0) return null;
  const up = change.netDelta > 0;
  const prev = change.previousNet;
  const prevLabel = `${prev > 0 ? "+" : prev < 0 ? "−" : ""}${formatCurrency(Math.abs(prev), currency)}`;
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
      {noun} {prevLabel}
      <span className="sr-only">
        {" "}
        — {up ? "up" : "down"} from {noun}
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
      <div aria-hidden="true" className="kin-cf-labels" style={{ display: "flex", gap: "0.375rem", marginTop: "0.3125rem" }}>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="kin-eyebrow" style={{ margin: "20px 0 8px" }}>{children}</div>
  );
}

function EntryRow({ entry, currency, dateFormat, showAccount, owner }: { entry: LedgerEntry; currency: string; dateFormat: string; showAccount?: boolean; owner?: string | null }) {
  const isIn = entry.direction === "in";
  return (
    <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline", padding: "0.625rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: "0.875rem", display: "block" }}>{entry.particulars}</span>
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {formatDate(entry.occurred_at, dateFormat)}
          {entry.category ? ` · ${categoryLabel(entry.category)}` : ""}
          {showAccount && entry.accountName ? ` · ${entry.accountName}${owner ? ` (${owner})` : ""}` : ""}
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
  today,
  days = 30,
}: {
  bills: T[];
  currency: string;
  fmtDate: (d: string) => string;
  /** The household's today, YYYY-MM-DD. */
  today: string;
  days?: number;
}) {
  const { bills: due, total } = billsDueWithin(bills, days);
  if (due.length === 0) return null;

  return (
    <Blueprint style={{ padding: "0.8125rem", marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <span style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>NEXT {days} DAYS</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-numeric)", fontSize: "0.9375rem", fontWeight: 600 }}>{formatCurrency(total, currency)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4375rem", marginTop: "0.5625rem" }}>
        {due.map((b) => {
          // Overdue from the day after it is due, in the household's own day
          // (new Date("2026-10-22") is midnight UTC, 08:00 in Manila, so the
          // bill read "overdue" on its own due day).
          const overdue = b.due_date !== null && b.due_date.slice(0, 10) < today;
          return (
            // Wraps rather than squeezing the name to a few letters a line
            // when the amount and date are wide (Simple Kin's larger text).
            <div key={b.id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", columnGap: "0.625rem", rowGap: "0.125rem", fontSize: "0.84375rem" }}>
              <span>
                {b.name}
                {overdue && <span style={{ color: "var(--color-accent-700)" }}> · overdue</span>}
              </span>
              <span style={{ fontFamily: "var(--font-numeric)", flex: "none", marginLeft: "auto" }}>
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

/* ----------------------------------------------------------------- cash flow */

async function CashFlowPane({ familyId, memberId, currency, range, scope, grownUp, plus = false, openExpenses = false, billId = null }: { familyId: string; memberId: string; currency: string; range: CashFlowRange; scope: WealthScope; grownUp: boolean; plus?: boolean; openExpenses?: boolean; billId?: string | null }) {
  const [fmtDate, dateFormat, today] = await Promise.all([familyDate(), householdDateFormat(), householdZone().then((tz) => familyDay(new Date(), tz))]);
  const [cf, budget, accounts, who, nextBills] = await Promise.all([
    getCashFlowPane(familyId, range, scope),
    getWealthPane(familyId, memberId, scope),
    getAccounts(familyId),
    whoPicker(familyId, memberId, scope, (w) => `/wealth?seg=cashflow&range=${range}&who=${w}`),
    // "Add the next one?" for paid repeating bills: a grown-up's, on Plus.
    grownUp && plus ? getNextBillOffers(familyId) : Promise.resolve([]),
  ]);
  // Money lent in instalments, each one expected back on its date
  // (20261022180000): the household's, so under Who = everyone; grown-ups'.
  const comingBack = grownUp && scope === "all"
    ? (await getUtang(familyId, memberId))
        .filter((u) => u.direction === "lent" && !u.settled && u.instalments && u.instalmentFrequency && u.firstDueOn)
        .map((u) => {
          const plan = instalmentPlan(u.amount, u.instalments!, u.instalmentFrequency!, u.firstDueOn!, u.paid, today);
          const next = plan.find((i) => i.status !== "paid")!;
          return { id: u.id, personName: u.personName, next, of: plan.length, overdue: plan.some((i) => i.status === "overdue") };
        })
        .sort((a, b) => a.next.due.localeCompare(b.next.due))
    : [];
  // The band behind the cash-flow bars: each month's budget, household or
  // personal to match the Who picker. Monthly only -- a budget is a month's.
  const [budgetHistory, byPerson] = await Promise.all([
    range === "month" ? getBudgetHistory(familyId, scope, cf.history.map((h) => h.key)) : Promise.resolve(new Map<string, number>()),
    scope === "all" ? getSpendingByMember(familyId, budget.year, budget.month) : Promise.resolve([]),
  ]);
  const people = byPerson
    .map((p) => {
      const i = p.memberId ? who.active.findIndex((m) => m.id === p.memberId) : -1;
      return { ...p, label: p.memberId === null ? "Family" : (who.labels[i] ?? ""), order: p.memberId === null ? who.active.length : i };
    })
    .filter((p) => p.memberId === null || p.order >= 0)
    .filter((p) => p.memberId !== null || p.hasVisibleAccounts)
    .sort((a, b) => a.order - b.order);
  const pickable = toPickable(accounts, memberId);
  const bareAccounts = pickable.map((a) => ({ id: a.id, name: a.name }));
  const periodNoun = range === "day" ? "day" : range === "week" ? "week" : range === "year" ? "year" : "month";
  const mine = scope === memberId;
  const isJoint = isHouseholdScope(scope);
  const whosePossessive = selfPossessive(who.whoLabel, mine);
  // Same budget-vs-target data the Accounts tab used to show, moved here:
  // one is the household's spending ceiling (Expenses), the other a
  // member's own earning target (Income) -- both monthly by nature of the
  // tables behind them, independent of whichever graph range is active.
  const categories = [...budget.allocations, ...budget.unbudgeted];
  const momChange = periodOverPeriodChange(cf.history);

  // INCOME's groups: the sources in their own order, then any other
  // source a row carries (an older or imported one) after them.
  const usedSources = [...cf.incomeGroups.map((g) => g.category ?? "Other"), ...cf.expectedIncome.map((x) => x.category ?? "Salary"), ...cf.receivedIncome.map((x) => x.category ?? "Salary"), ...cf.recentIncome.map((e) => e.category ?? "Other")];
  const incomeSources = [...INCOME_SOURCES, ...[...new Set(usedSources)].filter((c) => !(INCOME_SOURCES as readonly string[]).includes(c)).sort()];
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "14px 0 4px" }}>
        <PickButton title="Who" icon="users" label={who.whoLabel} options={who.options} />
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {scope === "all" ? "Everything you can see" : scope === WEALTH_FAMILY ? "Joint, and not in anyone's name" : mine ? "Your own accounts" : "Their accounts, as shared"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", margin: "4px 0 10px" }}>
        <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
          {cf.net > 0
            ? `More came in than went out this ${periodNoun}: net +${formatCurrency(cf.net, currency)}.`
            : cf.net < 0
              ? `More went out than came in this ${periodNoun}: net −${formatCurrency(Math.abs(cf.net), currency)}.`
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
      <CashFlowChart history={cf.history} currency={currency} periodNoun={periodNoun} budgets={Object.fromEntries(budgetHistory)} />

      {/* Open, above the groups: in EXPENSES they sat in a group that is
          closed unless opened, so a paid repeating bill's "Add next
          month's?" went unseen on Cash Flow (22 October). The cards are the
          household's, so they show under Who = everyone only; the sheet a
          payment raises lives here too, under any Who. */}
      {grownUp && plus && <NextBillOffers offers={scope === "all" ? nextBills : []} currency={currency} heading="Next bills to add" />}
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
      {/* One set of groups for the donut and the list (Janine, 22 October):
          each income source is a group -- its regular incomes, what is
          expected and received, and other money in -- in INCOME_SOURCES'
          order, each folding on a tap; the donut has a slice per group in
          the group's colour, so its own list would only repeat them. */}
      <CategoryDonut categories={cf.incomeByCategory.map((c) => ({ category: c.category, spent: c.earned, budget: 0 }))} currency={currency} monthBudget={null} kind="income" showList={false} />
      {cf.expectedIncome.length === 0 && cf.receivedIncome.length === 0 && cf.recentIncome.length === 0 && (
        <Empty icon={<Icon name="wallet" size={26} />} title="Nothing recorded yet" line="Salary, a regular gift, business revenue — expect it here so receiving it is one tap." />
      )}
      {incomeSources.map((source) => {
        const groups = cf.incomeGroups.filter((g) => (g.category ?? "Other") === source);
        const expected = cf.expectedIncome.filter((s) => (s.category ?? "Salary") === source);
        const received = cf.receivedIncome.filter((s) => (s.category ?? "Salary") === source);
        const recent = cf.recentIncome.filter((e) => (e.category ?? "Other") === source);
        const count = groups.length + expected.length + received.length + recent.length;
        if (count === 0) return null;
        const earned = cf.incomeByCategory.find((c) => c.category === source)?.earned ?? 0;
        return (
          <FoldableSection key={source} label={`${categoryLabel(source).toUpperCase()} · ${count} · ${formatCurrency(earned, currency)}`} storageKey={`kin-income-${source}`} swatch={incomeSourceColor(source)}>
            {groups.map((g) => {
            const cap = g.monthly_target ? Number(g.monthly_target) : null;
            const pct = cap ? Math.min(100, Math.round((g.thisMonth / cap) * 100)) : 0;
            return (
              <div key={g.id} style={{ padding: "0.625rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
                <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>{g.name}</span>
                    <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                      {categoryLabel(g.category ?? "Other")} · {INCOME_FREQUENCY_LABELS[g.frequency] ?? g.frequency} · usually {formatCurrency(Number(g.usual_amount), currency)}
                      {g.next?.next_date ? ` · next ${fmtDate(g.next.next_date)}` : ""}
                    </span>
                  </span>
                  <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", textAlign: "right", flex: "none" }}>
                    {formatCurrency(g.thisMonth, currency)}
                    {cap ? ` / ${formatCurrency(cap, currency)}` : ""}
                    <span style={{ display: "block", fontSize: "0.71875rem", color: "var(--color-neutral-600)" }}>this month</span>
                  </span>
                </div>
                {cap && (
                  <div style={{ height: 6, background: "var(--color-neutral-200)", marginTop: "0.375rem" }} role="img" aria-label={`${pct}% of this month's target`}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-accent-700)" }} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.25rem" }}>
                  <RemoveButton id={g.id} kind="income_group" label={`Delete "${g.name}"`} />
                </div>
              </div>
            );
            })}
            {expected.map((s) => (
        <div key={s.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: "0.6875rem", alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1.0625rem/1.1 var(--font-heading)", display: "block" }}>{s.name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {categoryLabel(s.category ?? "Salary")}
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
            {received.map((s) => (
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
            {recent.map((e) => (
            <EntryRow key={e.id} entry={e} currency={currency} dateFormat={dateFormat} showAccount owner={isJoint ? who.ownerOf(e.accountOwnerId, e.accountIsJoint) : null} />
            ))}
          </FoldableSection>
        );
      })}
      {comingBack.length > 0 && (
        <>
          <SectionLabel>UTANG COMING BACK</SectionLabel>
          {comingBack.map((u) => (
            <Link
              key={u.id}
              href="/wealth/utang"
              style={{ display: "flex", gap: "0.625rem", alignItems: "baseline", padding: "0.625rem 0", color: "inherit", textDecoration: "none", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: "0.875rem", display: "block" }}>{u.personName}</span>
                <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
                  Instalment {u.next.n} of {u.of} · due {fmtDate(u.next.due)}
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {u.overdue && <Tag variant="accent">OVERDUE</Tag>}
                <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem" }}>{formatCurrency(u.next.amount, currency)}</span>
              </span>
            </Link>
          ))}
        </>
      )}
      {/* Remittances and utang & paluwagan open from inside this sheet
          (22 October): they are ways money comes in, not rows of their own. */}
      <AddIncomeScheduleForm accounts={bareAccounts} grownUp={grownUp} />
      </CollapsibleGroup>

      <CollapsibleGroup title="EXPENSES" defaultOpen={openExpenses}>
      {isJoint && (
        <>
          <Meter label="Spent of budget" value={budget.monthExpense} cap={budget.budgetAmount} currency={currency} note="Set the month's ceiling below." />
          <SetBudgetControl month={budget.month} year={budget.year} current={budget.budgetAmount} />
        </>
      )}

      <SectionLabel>{isJoint ? "BUDGET VS SPEND BY CATEGORY" : "WHERE IT WENT THIS MONTH"}</SectionLabel>
      {categories.length === 0 && (
        <Empty icon={<Icon name="activity" size={26} />} title="Nothing spent yet this month" line="Once money moves, this breaks it down by category so you can see where it actually goes." />
      )}
      <CategoryDonut
        categories={categories.filter((c) => c.category !== TRANSFER_CATEGORY).map((c) => ({ category: c.category, spent: c.spent, budget: c.amount }))}
        currency={currency}
        monthBudget={isJoint && budget.budgetAmount > 0 ? budget.budgetAmount : null}
        showList={false}
      />
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
              <span>{categoryLabel(c.category)}</span>
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

      {people.length > 0 && (
        <>
          <SectionLabel>SPENDING BY PERSON</SectionLabel>
          <SpendingByPerson people={people} currency={currency} canSetBudgets={grownUp} />
        </>
      )}

      <SectionLabel>BILLS</SectionLabel>
      <CashFlowSources sources={cf.sources} currency={currency} />
      {/* Last month in one page, for the grown-ups (19 October): the same
          page the push on the 1st opens. */}
      {grownUp && (
        <Link
          href="/wealth/recap"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 0", fontSize: "0.875rem", color: "inherit", textDecoration: "none", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}
        >
          <Icon name="calendarDays" size={18} />
          <span style={{ flex: 1 }}>Monthly recap: last month against its budget</span>
          <span aria-hidden="true" style={{ color: "var(--color-neutral-600)" }}>›</span>
        </Link>
      )}

      {/* Snap a receipt or an e-wallet screenshot (20 October, Kin Plus):
          Kin AI reads it, the member checks it, an expense or bill is saved. */}
      <Link
        href="/wealth/scan"
        style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 0", fontSize: "0.875rem", color: "inherit", textDecoration: "none", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}
      >
        <Icon name="camera" size={18} />
        <span style={{ flex: 1 }}>Snap a receipt or GCash screenshot</span>
        <span aria-hidden="true" style={{ color: "var(--color-neutral-600)" }}>›</span>
      </Link>

      {/* Everything that repeats -- monthly, quarterly, yearly -- and what it
          all comes to in a year, built from these same bills. */}
      <Link
        href="/wealth/subscriptions"
        style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 0", fontSize: "0.875rem", color: "inherit", textDecoration: "none", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}
      >
        <Icon name="receipt" size={18} />
        <span style={{ flex: 1 }}>Subscriptions: what repeats, and its cost a year</span>
        <span aria-hidden="true" style={{ color: "var(--color-neutral-600)" }}>›</span>
      </Link>

      <UpcomingBills bills={cf.openBills} currency={currency} fmtDate={fmtDate} today={today} />
      {cf.openBills.length === 0 && cf.settledBills.length === 0 && cf.recentExpense.length === 0 && (
        <Empty icon={<Icon name="receipt" size={26} />} title="Nothing recorded yet" line="Mortgage payments, groceries, checkups, meals, travel, fuel — anything the household spends on." />
      )}
      {billId && cf.openBills.some((b) => b.id === billId) && <ScrollIntoView targetId={`bill-${billId}`} />}
      {cf.openBills.map((b) => (
        // The id is what Today's Pay button lands on.
        <div key={b.id} id={`bill-${b.id}`} style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: "0.6875rem", alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1.0625rem/1.1 var(--font-heading)", display: "block" }}>{b.name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {categoryLabel(b.category ?? "Utilities")}
                {b.due_date ? ` · due ${fmtDate(b.due_date)}` : ""}
              </span>
            </span>
            <span style={{ textAlign: "right", flex: "none" }}>
              <span style={{ font: "600 1rem/1 var(--font-heading)", display: "block" }}>{formatCurrency(Number(b.amount), currency)}</span>
              <Tag variant={b.status === "scheduled" ? "outline" : "accent"}>{b.status.toUpperCase()}</Tag>
            </span>
          </div>
          {/* Wraps: in Simple Kin at 320px, Settle, the reminder and Remove are
              wider than the phone on one line (#833's checks, 22 October).
              kin-bill-actions: Simple Kin's 44px, over their inline 2rem. */}
          <div className="kin-bill-actions" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <PayBillControl billId={b.id} amount={Number(b.amount)} accounts={pickable} currency={currency} />
            {b.due_date && <BillReminderPicker billId={b.id} days={b.remind_days_before ?? DEFAULT_BILL_REMIND_DAYS} />}
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
            <EntryRow key={e.id} entry={e} currency={currency} dateFormat={dateFormat} showAccount owner={isJoint ? who.ownerOf(e.accountOwnerId, e.accountIsJoint) : null} />
          ))}
        </>
      )}
      <AddBillForm />
      </CollapsibleGroup>
    </>
  );
}

/* ------------------------------------------------------------- accounts */

async function ScopePane({ scope, familyId, memberId, currency, range, newAccountId, includePrivate, grownUp }: { scope: WealthScope; familyId: string; memberId: string; currency: string; range: CashFlowRange; newAccountId?: string; includePrivate: boolean; grownUp: boolean }) {
  const [dateFormat, pane, cf, who, allArchived, viewers] = await Promise.all([
    householdDateFormat(),
    getWealthPane(familyId, memberId, scope),
    // Budget and target now live on Cash Flow -- this pane only still
    // needs getCashFlowPane for its own history strip, at whichever range
    // the picker below is set to.
    getCashFlowPane(familyId, range, scope),
    whoPicker(familyId, memberId, scope, (w) => `/wealth?seg=accounts&range=${range}&who=${w}`),
    getArchivedAccounts(familyId),
    getAccountViewers(familyId),
  ]);
  const archived = allArchived.filter((a) => inScope(a, scope));
  // Whom an account of yours can be shown to: everyone else in the
  // household. A managed child is listed but can't be ticked -- with no
  // login of their own there is nothing to show it to yet.
  const people: AccountAudienceMember[] = who.active.flatMap((m, i) =>
    m.id === memberId ? [] : [{ id: m.id, label: who.labels[i], grownUp: isGrownUp(m.role), hasLogin: m.role !== "child_managed" }],
  );
  const isJoint = isHouseholdScope(scope);
  const mine = scope === memberId;
  const whosePossessive = selfPossessive(who.whoLabel, mine);
  const monthLabel = new Date(pane.year, pane.month - 1, 1).toLocaleString("en-PH", { month: "long", year: "numeric" }).toUpperCase();
  const periodNoun = range === "day" ? "day" : range === "week" ? "week" : range === "year" ? "year" : "month";
  const momChange = periodOverPeriodChange(cf.history);
  const cashTrend = cashBalanceTrend(cf.history, pane.total);
  // The hero's donut: each account in this view, labelled with whose it is.
  const breakdown: BreakdownSlice[] = pane.accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance, ...who.sliceOwner(a.owner_member_id, a.is_joint) }));
  const accountGroups = ACCOUNT_TYPES.map((t) => ({
    type: t,
    accounts: pane.accounts.filter((a) => (a.account_type as AccountType) === t),
  })).filter((g) => g.accounts.length > 0);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "14px 0 4px" }}>
        <PickButton title="Who" icon="users" label={who.whoLabel} options={who.options} />
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {scope === "all"
            ? includePrivate
              ? "Everything you can see"
              : "Everything you can see, except your Only-you accounts"
            : scope === WEALTH_FAMILY
              ? "Joint, and not in anyone's name"
              : mine
                ? "Your own accounts"
                : "Their accounts, as shared"}
        </span>
      </div>
      {scope === "all" && <IncludePrivateToggle include={includePrivate} />}

      <Hero
        label={scope === WEALTH_FAMILY ? "FAMILY ACCOUNTS · COMBINED" : isJoint ? "ALL ACCOUNTS · COMBINED" : `${whosePossessive.toUpperCase()} ACCOUNTS · COMBINED`}
        amount={pane.total}
        currency={currency}
        delta={<DeltaBadge change={momChange} currency={currency} noun={`last ${periodNoun}`} />}
        caption={`${pane.accounts.length} account${pane.accounts.length === 1 ? "" : "s"} · ${monthLabel}`}
        breakdown={breakdown}
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

      <PendingBlock pending={pane.pending} currency={currency} dateFormat={dateFormat} />

      <SectionLabel>{scope === WEALTH_FAMILY ? "FAMILY ACCOUNTS" : isJoint ? "ACCOUNTS" : `${whosePossessive.toUpperCase()} ACCOUNTS`}</SectionLabel>
      {pane.accounts.length === 0 && (
        <Empty icon={<Icon name="wallet" size={26} />} title="No accounts yet" line="Add the accounts the household actually uses — a bank, a wallet, the cash in the drawer — and Kin keeps the running balance." />
      )}
      {/* Just saved from the form below: its group opens (the key makes it
          remount, so defaultOpen applies even if it was already on screen
          closed), the row is tinted and marked NEW, and the page scrolls to it. */}
      {accountGroups.map((group) => {
        const holdsNew = !!newAccountId && group.accounts.some((a) => a.id === newAccountId);
        return (
          <CollapsibleGroup key={holdsNew ? `${group.type}-${newAccountId}` : group.type} title={`${ACCOUNT_TYPE_LABELS[group.type].toUpperCase()} · ${group.accounts.length}`} defaultOpen={holdsNew}>
            {group.accounts.map((a) => (
              <Link
                key={a.id}
                id={`account-${a.id}`}
                href={`/wealth/accounts/${a.id}`}
                style={{
                  display: "flex",
                  gap: "0.625rem",
                  alignItems: "center",
                  padding: "0.75rem 0",
                  borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
                  textDecoration: "none",
                  color: "inherit",
                  ...(a.id === newAccountId ? { background: "var(--color-accent-100)", margin: "0 calc(-1 * 0.5rem)", padding: "0.75rem 0.5rem", borderRadius: 6 } : null),
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>
                    {a.name}
                    {a.id === newAccountId && (
                      <span style={{ marginLeft: "0.5rem", verticalAlign: "middle" }}>
                        <Tag variant="accent">NEW</Tag>
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                    {a.institution ? a.institution : ACCOUNT_TYPE_LABELS[a.account_type as AccountType] ?? a.account_type}
                    {a.sub_note ? ` · ${a.sub_note}` : ""}
                  </span>
                  {/* Whose it is, where the list mixes people (All), then who can
                      see it and -- if it is yours -- a tap to change that. Two
                      "BDO - Savings" rows read as one account without the name. */}
                  <span style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginTop: "0.3125rem" }}>
                    {isJoint && !a.is_joint && who.ownerOf(a.owner_member_id, false) && (
                      <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--color-neutral-700)" }}>{who.ownerOf(a.owner_member_id, false)}</span>
                    )}
                    <AccountPrivacyToggle
                      accountId={a.id}
                      isPrivate={a.is_private}
                      isJoint={a.is_joint}
                      ownerId={a.owner_member_id}
                      canChange={!a.is_joint && a.owner_member_id === memberId}
                      viewers={viewers.get(a.id) ?? []}
                      people={people}
                      me={memberId}
                    />
                  </span>
                </span>
                <span style={{ textAlign: "right", flex: "none" }}>
                  <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", display: "block" }}>{formatCurrency(a.balance, currency)}</span>
                  {a.pendingCount > 0 && <Tag variant="outline">{a.pendingCount} PENDING</Tag>}
                  <span style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end", marginTop: "0.375rem" }}>
                    <MoveMoneyButton accountId={a.id} accountName={a.name} />
                  </span>
                </span>
              </Link>
            ))}
          </CollapsibleGroup>
        );
      })}
      {newAccountId && pane.accounts.some((a) => a.id === newAccountId) && <ScrollIntoView targetId={`account-${newAccountId}`} />}
      {/* Offered on every Who; whose it is is asked, not taken from the tab:
          you, the family, or a child whose profile you keep -- never another
          grown-up. */}
      <AddAccountForm
        owners={[
          { value: "me", label: "Mine" },
          { value: "joint", label: "Family (joint)" },
          ...(grownUp
            ? who.active.flatMap((m, i) => (m.role === "child_managed" ? [{ value: m.id, label: `${who.labels[i]} (managed)` }] : []))
            : []),
        ]}
        defaultOwner={scope === WEALTH_FAMILY ? "joint" : grownUp && who.active.some((m) => m.id === scope && m.role === "child_managed") ? scope : "me"}
        returnWho={scope}
        grownUp={grownUp}
        people={people}
      />

      {/* Archive hides an account and keeps its history; this is where they
          wait, to be restored or deleted. */}
      {archived.length > 0 && (
        <CollapsibleGroup title={`ARCHIVED · ${archived.length}`} defaultOpen={false}>
          <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "0.5rem 0", lineHeight: 1.45 }}>
            Hidden from every list and balance total above. Their entries still count in the months they happened. Restore brings one back; Delete removes the account for good, keeping or deleting its entries as you choose.
          </p>
          {archived.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: "0.625rem", alignItems: "center", padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
              <Link href={`/wealth/accounts/${a.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
                <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>{a.name}</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                  {formatCurrency(a.balance, currency)} · {a.movementCount} movement{a.movementCount === 1 ? "" : "s"}
                </span>
              </Link>
              <span style={{ display: "flex", gap: "0.375rem", flex: "none", alignItems: "flex-start" }}>
                <RestoreAccountButton accountId={a.id} />
                <DeleteAccountButton
                  accountId={a.id}
                  accountName={a.name}
                  balance={a.balance}
                  movementCount={a.movementCount}
                  pendingCount={a.pendingCount}
                  archived
                  currency={currency}
                  dateFormat={dateFormat}
                  compact
                />
              </span>
            </div>
          ))}
        </CollapsibleGroup>
      )}

      {pane.recent.length > 0 && (
        <FoldableSection label="RECENT ACTIVITY" storageKey="kin-wealth-recent-activity">
          {pane.recent.map((e) => (
            <EntryRow key={e.id} entry={e} currency={currency} dateFormat={dateFormat} showAccount owner={isJoint ? who.ownerOf(e.accountOwnerId, e.accountIsJoint) : null} />
          ))}
        </FoldableSection>
      )}

      <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.875rem", lineHeight: 1.45 }}>
        A personal account is private until its owner opens it to the family. Nobody else sees a private account, its
        history or its balance — not in a list and not in any total — because the database never sends it to them. Its
        owner can also leave it out of their own All totals with the switch at the top.
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- A&L */

async function AssetsPane({ familyId, memberId, currency, scope }: { familyId: string; memberId: string; currency: string; scope: WealthScope }) {
  const [fmtDate, today] = await Promise.all([familyDate(), householdZone().then((tz) => familyDay(new Date(), tz))]);
  const [{ assets, liabilities, goals, cashAccounts, assetTotal, liabilityTotal, goalTotal, cashTotal, netWorth }, who, allAccounts] = await Promise.all([
    getNetWorth(familyId, scope, today),
    whoPicker(familyId, memberId, scope, (w) => `/wealth?seg=assets&who=${w}`),
    getAccounts(familyId),
  ]);
  // Deliberately not `cashAccounts` -- that list is scoped to whoever the
  // Who picker is showing, but the account a contribution actually leaves
  // from has to be one the viewer themself can pay out of, regardless of
  // whose net worth they're looking at.
  const pickableCash = toPickable(allAccounts, memberId);
  const mine = scope === memberId;
  const ownerOf = (ownerId: string | null, isJoint: boolean | null) => (isHouseholdScope(scope) ? who.ownerOf(ownerId, !!isJoint) : null);
  // What is owned and what is owed, each as a donut grouped by owner.
  const owned: BreakdownSlice[] = [
    ...cashAccounts.map((a) => ({ id: `acct-${a.id}`, name: a.name, balance: a.balance, detail: "Cash", ...who.sliceOwner(a.owner_member_id, a.is_joint) })),
    ...goals.map((g) => ({ id: `goal-${g.id}`, name: g.title, balance: Number(g.current_amount), detail: "Goal", ...who.sliceOwner(g.owner_member_id, g.is_joint) })),
    ...assets.map((a) => ({ id: `asset-${a.id}`, name: a.name, balance: a.worth.total, detail: ASSET_KIND_LABELS[a.kind as AssetKind] ?? a.kind, ...who.sliceOwner(a.owner_member_id, a.is_joint) })),
  ];
  const owed: BreakdownSlice[] = liabilities.map((l) => ({ id: l.id, name: l.name, balance: Number(l.balance), detail: LIABILITY_KIND_LABELS[l.kind as LiabilityKind] ?? l.kind, ...who.sliceOwner(l.owner_member_id, l.is_joint) }));
  // Each kind its own group, folded or open as the viewer last left it; a
  // kind the list doesn't know is shown under Other.
  const assetKindOf = (k: string): AssetKind => ((ASSET_KINDS as readonly string[]).includes(k) ? (k as AssetKind) : "other");
  const liabilityKindOf = (k: string): LiabilityKind => ((LIABILITY_KINDS as readonly string[]).includes(k) ? (k as LiabilityKind) : "other");
  const groupLabel = (name: string, count: number, total: number) => `${name.toUpperCase()} · ${count} · ${formatCurrency(total, currency)}`;
  const netWorthHistory = await recordAndGetNetWorthHistory(familyId, memberId, scope, {
    cash: cashTotal,
    goals: goalTotal,
    assets: assetTotal,
    liabilities: liabilityTotal,
    netWorth,
  });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "14px 0 4px" }}>
        <PickButton title="Who" icon="users" label={who.whoLabel} options={who.options} />
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {scope === "all" ? "Everything you can see" : scope === WEALTH_FAMILY ? "Joint, and not in anyone's name" : mine ? "Your own" : "Theirs, as shared"}
        </span>
      </div>

      <Hero
        label="Net worth"
        amount={netWorth}
        currency={currency}
        caption={`${formatCurrency(cashTotal, currency)} cash + ${formatCurrency(goalTotal, currency)} in goals + ${formatCurrency(assetTotal, currency)} owned − ${formatCurrency(liabilityTotal, currency)} owed`}
        breakdown={owned}
        noun="owned"
      />

      <NetWorthLine points={netWorthHistory} currency={currency} />

      <CollapsibleGroup title="ASSETS" defaultOpen={false}>
      <FoldableSection label={groupLabel("Cash & savings", cashAccounts.length, cashTotal)} storageKey="kin-al-cash">
      {cashAccounts.length === 0 && (
        <Empty icon={<Icon name="wallet" size={26} />} title="No accounts yet" line="Every account you can see shows up here automatically once it exists — add one from the Accounts tab." />
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
              {ownerOf(a.owner_member_id, a.is_joint) ? ` · ${ownerOf(a.owner_member_id, a.is_joint)}` : ""}
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
      </FoldableSection>

      <FoldableSection label={groupLabel("Savings goals", goals.length, goalTotal)} storageKey="kin-al-goals">
      {goals.length === 0 && (
        <Empty icon={<Icon name="target" size={26} />} title="No goals yet" line="A trip, a deposit, an emergency fund. Name what you are saving for and every contribution counts toward it." />
      )}
      {goals.map((g) => {
        const target = Number(g.target_amount ?? 0);
        const current = Number(g.current_amount);
        const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        const owner = (g.owner as unknown as { full_name: string } | null)?.full_name?.split(" ")[0]?.toUpperCase();
        const plan = g.target_date && target > 0 ? fundPlan({ target, saved: current, due: g.target_date, today, cycleStart: cycleStart({ createdDay: g.created_at.slice(0, 10), due: g.target_date, repeatsYearly: g.repeats_yearly }) }) : null;
        const payable = !!g.target_date && current > 0 && canMarkPaid(g.target_date, today);
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
                {g.repeats_yearly ? "Due every year · next" : "Target date"} {fmtDate(g.target_date)}
                {target > current ? ` · ${formatCurrency(target - current, currency)} to go` : " · funded"}
              </div>
            )}
            {plan && plan.status !== "funded" && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", fontSize: "0.78125rem", marginTop: "0.3125rem" }}>
                <span style={{ flex: 1, color: "var(--color-neutral-600)" }}>
                  {plan.status === "overdue"
                    ? "The date has passed. Record the payment, or put the rest in."
                    : plan.paydays === 0
                      ? `Set aside ${formatCurrency(plan.perPayday, currency)} now — no payday left before it’s due`
                      : `Set aside ${formatCurrency(plan.perPayday, currency)} a payday (15th and end of month) · ${formatCurrency(plan.perMonth, currency)} a month`}
                  {plan.status === "behind" ? ` · ${formatCurrency(plan.shouldHave, currency)} by now keeps it on track` : ""}
                </span>
                <Tag variant={plan.status === "on_track" ? "accent" : "neutral"}>{STATUS_TEXT[plan.status].toUpperCase()}</Tag>
              </div>
            )}
            {g.linked_account_id && (
              <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>
                Saved in {pickableCash.find((a) => a.id === g.linked_account_id)?.name ?? "an account you can no longer see"}
              </div>
            )}
            <GoalContributeControl goalId={g.id} accounts={pickableCash} currency={currency} linkedAccountId={g.linked_account_id} />
            {payable && <FundPaidControl goalId={g.id} title={g.title} accounts={pickableCash} currency={currency} saved={current} target={target} linkedAccountId={g.linked_account_id} repeatsYearly={g.repeats_yearly} />}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <RemoveButton id={g.id} kind="goal" label={`Delete "${g.title}"`} />
            </div>
          </Blueprint>
        );
      })}
      <Link href="/wealth/add" className="btn btn-secondary btn-block" style={{ minHeight: "2.625rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginBottom: "1.25rem" }}>
        + ADD GOAL
      </Link>
      </FoldableSection>

      {assets.length === 0 && <SectionLabel>OTHER ASSETS</SectionLabel>}
      {assets.length === 0 && (
        <Empty icon={<Icon name="house" size={26} />} title="Nothing recorded yet" line="Property, a vehicle, anything the family owns that holds value. Recorded here, it counts toward your net worth." />
      )}
      {ASSET_KINDS.map((kind) => {
        const group = assets.filter((a) => assetKindOf(a.kind) === kind);
        if (group.length === 0) return null;
        return (
          <FoldableSection key={kind} label={groupLabel(ASSET_KIND_LABELS[kind], group.length, group.reduce((t, a) => t + a.worth.total, 0))} storageKey={`kin-al-asset-${kind}`}>
            {group.map((a) => (
        <div key={a.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>{a.name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {ASSET_KIND_LABELS[a.kind as AssetKind] ?? a.kind}
                {ownerOf(a.owner_member_id, a.is_joint) ? ` · ${ownerOf(a.owner_member_id, a.is_joint)}` : ""}
                {a.acquired_on ? ` · since ${fmtDate(a.acquired_on)}` : ""}
                {a.note ? ` · ${a.note}` : ""}
                {a.updated_at ? ` · updated ${timeSinceLabel(a.updated_at)}` : ""}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none" }}>{formatCurrency(a.worth.total, currency)}</span>
          </div>
          <AssetWorthLine asset={a} currency={currency} />
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.4375rem" }}>
            <AssetBreakdownControl
              assetId={a.id}
              assetName={a.name}
              currency={currency}
              items={a.items.map((i) => ({
                id: i.id,
                name: i.name,
                kind: i.kind,
                cost: Number(i.cost),
                acquired_on: i.acquired_on,
                value_now: i.value_now == null ? null : Number(i.value_now),
                worth: i.worth,
              }))}
            />
            <ValueUpdateControl id={a.id} current={Number(a.value)} kind="asset" yearlyChange={a.annual_change_pct == null ? null : Number(a.annual_change_pct)} />
            <RemoveButton id={a.id} kind="asset" label={`Remove "${a.name}"`} />
          </div>
        </div>
                  ))}
          </FoldableSection>
        );
      })}
      <Link href="/wealth/assets/new?kind=asset" className="btn btn-secondary btn-block" style={{ minHeight: "2.625rem", fontSize: "0.84375rem", letterSpacing: ".04em", marginTop: "0.25rem" }}>
        + ASSET
      </Link>
      </CollapsibleGroup>

      <CollapsibleGroup title="LIABILITIES" defaultOpen={false}>
      {owed.length >= 2 && (
        <div style={{ margin: "0.75rem 0" }}>
          <OwnerBreakdownPie
            head={
              <>
                <div className="kin-eyebrow">OWED · BY WHOSE</div>
                <div style={{ font: "600 1.5rem/1.1 var(--font-heading)", marginTop: 6 }}>{formatCurrency(liabilityTotal, currency)}</div>
              </>
            }
            slices={owed}
            currency={currency}
            noun="debts"
          />
        </div>
      )}
      {liabilities.length === 0 && (
        <Empty icon={<Icon name="check" size={26} />} title="Nothing owed" line="No loans or debts on record. If that changes, adding them here keeps the net worth figure honest." />
      )}
      {LIABILITY_KINDS.map((kind) => {
        const group = liabilities.filter((l) => liabilityKindOf(l.kind) === kind);
        if (group.length === 0) return null;
        return (
          <FoldableSection key={kind} label={groupLabel(LIABILITY_KIND_LABELS[kind], group.length, group.reduce((t, l) => t + Number(l.balance), 0))} storageKey={`kin-al-liability-${kind}`}>
            {group.map((l) => (
        <div key={l.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
          <div style={{ display: "flex", gap: "0.625rem", alignItems: "baseline" }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>{l.name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {LIABILITY_KIND_LABELS[l.kind as LiabilityKind] ?? l.kind}
                {ownerOf(l.owner_member_id, l.is_joint) ? ` · ${ownerOf(l.owner_member_id, l.is_joint)}` : ""}
                {l.lender ? ` · ${l.lender}` : ""}
                {l.monthly_payment ? ` · ${formatCurrency(Number(l.monthly_payment), currency)}/mo` : ""}
                {l.updated_at ? ` · updated ${timeSinceLabel(l.updated_at)}` : ""}
              </span>
              <LoanScheduleLine loan={l} today={today} currency={currency} fmtDate={fmtDate} />
            </span>
            <span style={{ fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", flex: "none", color: "var(--color-accent-700)" }}>
              −{formatCurrency(Number(l.balance), currency)}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.4375rem" }}>
            <LoanScheduleControl
              id={l.id}
              monthlyPayment={l.monthly_payment == null ? null : Number(l.monthly_payment)}
              nextPaymentDate={loanStatus(l, today).next}
              paymentsLeft={loanStatus(l, today).next ? loanStatus(l, today).left : null}
              interestRate={l.interest_rate == null ? null : Number(l.interest_rate)}
            />
            <ValueUpdateControl id={l.id} current={Number(l.balance)} kind="liability" />
            <RemoveButton id={l.id} kind="liability" label={`Remove "${l.name}"`} />
          </div>
        </div>
                  ))}
          </FoldableSection>
        );
      })}
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

/** Where a loan's payments stand: the next one and what it comes to, how
 * many are left and when the last falls, and the interest rate. Nothing when
 * no schedule was given; "Paid off" once the last date has passed. */

/** Under an asset's name: how its total splits between the place itself and
 * what is in it, and which way time has moved it (against everything put in,
 * fees included). Nothing for an asset with no breakdown and no yearly change. */
function AssetWorthLine({
  asset,
  currency,
}: {
  asset: { value: number; annual_change_pct: number | null; items: unknown[]; worth: { property: number; items: number; total: number; putIn: number } };
  currency: string;
}) {
  const pct = asset.annual_change_pct == null ? null : Number(asset.annual_change_pct);
  if (asset.items.length === 0 && !pct) return null;
  const parts: string[] = [];
  if (asset.items.length > 0) {
    parts.push(`Itself ${formatCurrency(asset.worth.property, currency)} + ${asset.items.length} ${asset.items.length === 1 ? "thing" : "things"} in it ${formatCurrency(asset.worth.items, currency)}`);
  }
  if (pct) parts.push(`${pct > 0 ? "+" : ""}${pct}% a year`);
  const moved = asset.worth.total - asset.worth.putIn;
  if (asset.items.length > 0 && Math.abs(moved) >= 1) {
    parts.push(`${moved > 0 ? "up" : "down"} ${formatCurrency(Math.abs(moved), currency)} on ${formatCurrency(asset.worth.putIn, currency)} put in`);
  }
  return <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" }}>{parts.join(" · ")}</div>;
}

function LoanScheduleLine({
  loan,
  today,
  currency,
  fmtDate,
}: {
  loan: { next_payment_date: string | null; payments_remaining: number | null; monthly_payment: number | null; interest_rate: number | null };
  today: string;
  currency: string;
  fmtDate: (d: string) => string;
}) {
  const status = loanStatus(loan, today);
  const rate = loan.interest_rate == null ? null : `${Number(loan.interest_rate)}% a year`;
  if (!loan.next_payment_date && !rate) return null;
  const parts: string[] = [];
  if (status.next) {
    const amount = loan.monthly_payment ? `${formatCurrency(Number(loan.monthly_payment), currency)} ` : "";
    parts.push(`Next ${amount}due ${fmtDate(status.next)}`);
    parts.push(`${status.left} payment${status.left === 1 ? "" : "s"} left${status.last && status.left > 1 ? `, last ${fmtDate(status.last)}` : ""}`);
  } else if (loan.next_payment_date && loan.payments_remaining) {
    parts.push("Paid off — no payments left");
  } else if (loan.next_payment_date) {
    parts.push(`Next due ${fmtDate(loan.next_payment_date)}`);
  }
  if (rate) parts.push(rate);
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "0.3125rem", fontSize: "0.78125rem", color: "var(--color-neutral-700)", marginTop: "0.1875rem" }}>
      <Icon name="calendarDays" size={12} style={{ flex: "none" }} />
      <span>{parts.join(" · ")}</span>
    </span>
  );
}


