import { Suspense } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { NextBillOffers } from "@/components/next-bill-offer";
import { toPickable } from "@/lib/account-picker";
import { getWealthPane, getAccountViewers, getNetWorth, getAccounts, getArchivedAccounts, getCashFlowPane, getNextBillOffers, getAttributableTargets, getLoanBillIds, getGoalsOnPlanner, getBudgetHistory, getSpendingByMember, getPrivateBudgetCount, getBudgetSharing, recordAndGetNetWorthHistory, keepNetWorthCurrent, type WealthScope, type LedgerEntry } from "@/lib/queries/wealth";
import { HubHeader } from "@/components/hub-header";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { AddAccountForm, AddExpenseForm, AddIncomeScheduleForm, BillReminderPicker, SetTargetControl, AllocationEditor, CategoryBudgetRow, BudgetVisibility } from "@/components/wealth-controls";
import {
  PayBillControl,
  ReceiveIncomeControl,
  GoalContributeControl,
  FundPaidControl,
  PendingEntryActions,
  LineEntries,
  type LineEntry,
  ValueUpdateControl,
  AssetBreakdownControl,
  LoanScheduleControl,
  RemoveButton,
  SetBalanceButton,
  EditSavingsGoalButton,
  LoanBillButton,
  AccountPrivacyToggle,
  MoveMoneyButton,
  IncludePrivateToggle,
  RestoreAccountButton,
  DeleteAccountButton,
} from "@/components/money-actions";
import { entryFor } from "@/lib/entry-for";
import { formatCurrency, formatDate, shortNames, selfLabel, selfPossessive } from "@/lib/format";
import { getMembers } from "@/lib/queries/family";
import { PickButton } from "@/components/pick-button";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  ASSET_KIND_LABELS,
  LIABILITY_KINDS,
  LIABILITY_KIND_LABELS,
  CASH_FLOW_RANGES,
  CASH_FLOW_RANGE_LABELS,
  INCOME_FREQUENCY_LABELS,
  INCOME_SOURCES,
  EXPENSE_CATEGORIES,
  categoryLabel,
  whoseOptions,
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
  isHouseholdScope,
  inScope,
  loanStatus,
  loanPaymentSplit,
  loanOriginStatus,
  paymentsLeftForBalance,
  cardDueDate,
  assetGroup,
  AL_CASH,
  AL_INVESTMENTS,
  AL_SET_ASIDE,
  AL_OWNED_ORDER,
  type LoanTerms,
} from "@/lib/wealth";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { familyDate, householdDateFormat } from "@/lib/format-family";
import { CollapsibleGroup, FoldableSection } from "@/components/collapsible-group";
import { ScrollIntoView } from "@/components/scroll-into-view";
import { GroupedBreakdown, CashFlowChart, CashTrendLine, NetWorthLine, NetWorthMoves, SpendingByPerson, type BreakdownItem } from "@/components/wealth-charts";
import { isGrownUp } from "@/lib/roles";
import { kinAiReady } from "@/lib/kin-ai";
import { LoanAssetPicker } from "@/components/loan-asset-picker";
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
        {seg !== "assets" && (
          <Suspense fallback={null}>
            <NetWorthKeeper familyId={me.family_id} memberId={me.id} />
          </Suspense>
        )}
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

/** An account as every breakdown names it: bank or e-wallet, then the
 * account -- "BPI - Payroll" (Janine, 23 October). */
function accountLabel(a: { name: string; institution?: string | null }) {
  return a.institution && a.institution.trim().toLowerCase() !== a.name.trim().toLowerCase() ? `${a.institution} - ${a.name}` : a.name;
}

/** The headline figure. `breakdown` puts a by-owner donut beside it and
 * each owner's items under it (Accounts: accounts; A&L: what is owned). */
function Hero({ label, amount, currency, caption, delta, breakdown }: { label: string; amount: number; currency: string; caption?: string; delta?: React.ReactNode; breakdown?: { items: BreakdownItem[]; storageKey: string; categoryOrder: readonly string[] } }) {
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
      {breakdown ? <GroupedBreakdown head={head} items={breakdown.items} currency={currency} storageKey={breakdown.storageKey} categoryOrder={breakdown.categoryOrder} /> : head}
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
  // Counted from the household's own day, as "overdue" below is -- the
  // server's clock is up to eight hours behind Manila's, so a bill could
  // enter the box a day early.
  const { bills: due, total } = billsDueWithin(bills, days, new Date(`${today}T00:00:00`));
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

/** The A&L group utang and paluwagan sit in, in both donuts. */
const UTANG_GROUP = "Lending & savings circles";

/* ----------------------------------------------------------------- cash flow */

/** Each utang's next instalment, under INCOME (lent: who owes us) or
 * EXPENSES (borrowed: whom we owe). Kin moves no money: these are what is
 * expected, and each opens the utang page where payments are recorded. */
function UtangInstalments({ heading, rows, currency, fmtDate }: {
  heading: string;
  rows: { id: string; direction: string; personName: string; next: { n: number; due: string; amount: number }; of: number; overdue: boolean }[];
  currency: string;
  fmtDate: (d: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <>
      <SectionLabel>{heading}</SectionLabel>
      {rows.map((u) => (
        <Link
          key={u.id}
          href="/wealth/utang"
          style={{ display: "flex", gap: "0.625rem", alignItems: "baseline", padding: "0.625rem 0", color: "inherit", textDecoration: "none", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: "0.875rem", display: "block" }}>{u.direction === "lent" ? `${u.personName} owes us` : `We owe ${u.personName}`}</span>
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
  );
}

async function CashFlowPane({ familyId, memberId, currency, range, scope, grownUp, plus = false, openExpenses = false, billId = null }: { familyId: string; memberId: string; currency: string; range: CashFlowRange; scope: WealthScope; grownUp: boolean; plus?: boolean; openExpenses?: boolean; billId?: string | null }) {
  const [fmtDate, dateFormat, today] = await Promise.all([familyDate(), householdDateFormat(), householdZone().then((tz) => familyDay(new Date(), tz))]);
  const [cf, budget, accounts, who, nextBills, targets] = await Promise.all([
    getCashFlowPane(familyId, range, scope),
    getWealthPane(familyId, memberId, scope),
    getAccounts(familyId),
    whoPicker(familyId, memberId, scope, (w) => `/wealth?seg=cashflow&range=${range}&who=${w}`),
    // "Add the next one?" for paid repeating bills: a grown-up's, on Plus.
    grownUp && plus ? getNextBillOffers(familyId) : Promise.resolve([]),
    // What an expense already paid can be for: a loan, an asset, a goal.
    getAttributableTargets(familyId),
  ]);
  // Utang in instalments (20261022180000), each one's next instalment on
  // its date: money lent coming back under INCOME, money borrowed going
  // out under EXPENSES. The household's, so under Who = everyone;
  // grown-ups'.
  const utang = grownUp ? await getUtang(familyId, memberId) : [];
  // Money lent and not yet all back: what Add income's "Paid back to me" picks from.
  const openLent = utang.filter((u) => u.direction === "lent" && !u.settled).map((u) => ({ id: u.id, personName: u.personName, left: u.amount - u.paid }));
  const instalmentsDue = grownUp && scope === "all"
    ? utang
        .filter((u) => !u.settled && u.instalments && u.instalmentFrequency && u.firstDueOn)
        .map((u) => {
          const plan = instalmentPlan(u.amount, u.instalments!, u.instalmentFrequency!, u.firstDueOn!, u.paid, today);
          const next = plan.find((i) => i.status !== "paid")!;
          return { id: u.id, direction: u.direction, personName: u.personName, next, of: plan.length, overdue: plan.some((i) => i.status === "overdue") };
        })
        .sort((a, b) => a.next.due.localeCompare(b.next.due))
    : [];
  const comingBack = instalmentsDue.filter((u) => u.direction === "lent");
  const toPayBack = instalmentsDue.filter((u) => u.direction === "borrowed");
  // The band behind the cash-flow bars: each month's budget, household or
  // personal to match the Who picker. Monthly only -- a budget is a month's.
  // Whose budgets these are, and whether the viewer may set them (26
  // October): Family's and a child's, any grown-up; a grown-up's, only
  // themselves; a child with a login, their own too. All is the sum, set
  // through its parts.
  const myRole = who.active.find((m) => m.id === memberId)?.role;
  const scopeRole = who.active.find((m) => m.id === scope)?.role;
  const canSetBudgets =
    scope === WEALTH_FAMILY ? grownUp
    : scope === memberId ? myRole !== "child_managed"
    : scope !== "all" && grownUp && !!scopeRole && !isGrownUp(scopeRole);
  // The same rule for each person's block under SPENDING BY PERSON.
  const canSetFor = (whoseId: string | null) => {
    if (whoseId === null) return grownUp;
    if (whoseId === memberId) return myRole !== "child_managed";
    const role = who.active.find((m) => m.id === whoseId)?.role;
    return grownUp && !!role && !isGrownUp(role);
  };
  const [budgetHistory, byPerson, privateBudgets, sharing] = await Promise.all([
    range === "month" ? getBudgetHistory(familyId, scope, cf.history.map((h) => h.key)) : Promise.resolve(new Map<string, number>()),
    getSpendingByMember(familyId, budget.year, budget.month),
    scope === "all" ? getPrivateBudgetCount(familyId, memberId) : Promise.resolve(0),
    grownUp && (scope === "all" || scope === memberId) ? getBudgetSharing(familyId, memberId) : Promise.resolve(null),
  ]);
  // Each person's spending by category, under their own name (Janine, 26
  // October): All lists everyone and Family; Who = one of them, just theirs.
  // Family stays for the grown-ups, who set its budgets, accounts or not.
  const people = byPerson
    .map((p) => {
      const i = p.memberId ? who.active.findIndex((m) => m.id === p.memberId) : -1;
      // Family first, then the grown-ups, then the children, each in the
      // household's own order (Janine, 26 October).
      const grown = i >= 0 && isGrownUp(who.active[i].role);
      return { ...p, label: p.memberId === null ? "Family" : (who.labels[i] ?? ""), order: p.memberId === null ? -1 : grown ? i : who.active.length + i };
    })
    .filter((p) => p.memberId === null || p.order >= 0)
    .filter((p) => p.memberId !== null || p.hasVisibleAccounts || p.budget !== null || grownUp)
    .filter((p) => scope === "all" || (scope === WEALTH_FAMILY ? p.memberId === null : p.memberId === scope))
    .sort((a, b) => a.order - b.order);
  if (scope !== "all" && people.length === 0 && scope !== WEALTH_FAMILY) {
    const i = who.active.findIndex((m) => m.id === scope);
    if (i >= 0) people.push({ memberId: scope, label: who.labels[i], order: i, spent: 0, hasVisibleAccounts: false, budget: null, categories: [] });
  }
  // Whoever has a bill open gets a block too (26 October, the Add expense
  // spec): the bill's line, with Settle and "did it go through?", lives
  // there and nowhere else, and a first bill can come before any spending.
  for (const bill of cf.openBills) {
    const whose = bill.is_joint !== false || !bill.owner_member_id ? null : bill.owner_member_id;
    if (people.some((p) => p.memberId === whose)) continue;
    if (scope !== "all" && (scope === WEALTH_FAMILY ? whose !== null : whose !== scope)) continue;
    const i = whose ? who.active.findIndex((m) => m.id === whose) : -1;
    if (whose && i < 0) continue;
    const grown = i >= 0 && isGrownUp(who.active[i].role);
    people.push({ memberId: whose, label: whose ? who.labels[i] : "Family", order: whose ? (grown ? i : who.active.length + i) : -1, spent: 0, hasVisibleAccounts: false, budget: null, categories: [] });
  }
  people.sort((a, b) => a.order - b.order);
  const audience = who.active.flatMap((m, i) => (m.id === memberId ? [] : [{ id: m.id, label: who.labels[i], grownUp: isGrownUp(m.role), hasLogin: m.role !== "child_managed" }]));
  // Over budget first, most over at the top, then the rest as budgeted,
  // then what was spent with no budget.
  const overBy = (c: { amount: number; spent: number }) => (c.amount > 0 ? Math.max(0, c.spent - c.amount) : 0);
  const pickable = toPickable(accounts, memberId);
  // Named as every breakdown names them -- "BPI - Payroll" -- no balances.
  const bareAccounts = pickable.map((a) => ({ id: a.id, name: accountLabel(a) }));
  const periodNoun = range === "day" ? "day" : range === "week" ? "week" : range === "year" ? "year" : "month";
  const mine = scope === memberId;
  const isJoint = isHouseholdScope(scope);
  const whosePossessive = selfPossessive(who.whoLabel, mine);
  // Same budget-vs-target data the Accounts tab used to show, moved here:
  // one is the household's spending ceiling (Expenses), the other a
  // member's own earning target (Income) -- both monthly by nature of the
  // tables behind them, independent of whichever graph range is active.
  const momChange = periodOverPeriodChange(cf.history);

  // "Whose is it?" on the add forms: You, each other member, Family.
  const whose = whoseOptions(who.active.map((m, i) => ({ id: m.id, label: who.labels[i] })), memberId);
  // INCOME and EXPENSES, as every Wealth tab breaks things down (Janine,
  // 23 October): whose first, then the category, then each line named
  // "Category - Source". A line's amount is what came in or went out this
  // period (transfers left out); what is still to come -- an income
  // expected, a bill due -- rides on its line, or stands as a line of its
  // own with nothing counted yet. No account names or balances here.
  const ownerOfRow = (isJoint: boolean | null, ownerId: string | null) => who.sliceOwner(ownerId, isJoint ?? true);
  const ownedHere = (o: { is_joint: boolean | null; owner_member_id: string | null }) => scope === "all" || o.is_joint === null || inScope({ is_joint: o.is_joint, owner_member_id: o.owner_member_id }, scope);
  // `entries` are the ledger entries a line adds up, opened from the line
  // to edit or remove one (25 October).
  type Line = BreakdownItem & { count: number; last: string | null; lead: string[]; tail: string[]; buttons: React.ReactNode[]; entries?: LineEntry[] };
  const finish = (lines: Map<string, Line>, noun: string): BreakdownItem[] =>
    [...lines.values()].map(({ count, last, lead, tail, buttons, entries = [], ...l }) => ({
      ...l,
      sub: [...lead, ...(count > 0 ? [`${count} ${noun}${count === 1 ? "" : "s"}${last ? ` · last ${fmtDate(last)}` : ""}`] : []), ...tail].join(" · ") || undefined,
      actions:
        buttons.length || entries.length ? (
          <>
            {buttons}
            <LineEntries entries={entries} accounts={pickable} targets={targets} currency={currency} dateFormat={dateFormat} />
          </>
        ) : undefined,
    }));
  const toLineEntry = (t: LedgerEntry): LineEntry => ({ id: t.id, particulars: t.particulars, amount: Number(t.amount), occurredOn: t.occurred_at.slice(0, 10), category: t.category, direction: t.direction, accountId: t.account_id, accountName: t.accountName, ...entryFor(t), principal: t.principal_amount == null ? null : Number(t.principal_amount), confirmed: t.status === "confirmed" });

  const incomeLines = new Map<string, Line>();
  for (const g of cf.incomeGroups.filter((x) => ownedHere(x.owner))) {
    const category = categoryLabel(g.category ?? "Other");
    incomeLines.set(`g:${g.id}`, {
      id: `g:${g.id}`,
      name: `${category} - ${g.name}`,
      amount: 0,
      category,
      ...ownerOfRow(g.owner.is_joint, g.owner.owner_member_id),
      count: 0,
      last: null,
      lead: [`Regular · ${INCOME_FREQUENCY_LABELS[g.frequency] ?? g.frequency} · usually ${formatCurrency(Number(g.usual_amount), currency)}`],
      tail: g.next?.next_date ? [`next ${fmtDate(g.next.next_date)}`] : [],
      buttons: [
        ...(g.next ? [<ReceiveIncomeControl key="receive" scheduleId={g.next.id} amount={Number(g.next.amount)} accounts={pickable} currency={currency} />] : []),
        <RemoveButton key="remove" id={g.id} kind="income_group" label={`Delete "${g.name}"`} />,
      ],
    });
  }
  for (const t of cf.periodIn) {
    const category = categoryLabel(t.category ?? "Other");
    const owner = ownerOfRow(t.is_joint, t.owner_member_id);
    const group = t.source_table === "income_schedules" && t.source_id ? cf.scheduleGroup[t.source_id] : undefined;
    const key = group && incomeLines.has(`g:${group}`) ? `g:${group}` : `n:${owner.ownerKey}:${category}:${t.particulars.trim().toLowerCase()}`;
    const line = incomeLines.get(key) ?? { id: key, name: `${category} - ${t.particulars.trim()}`, amount: 0, category, ...owner, count: 0, last: null, lead: [], tail: [], buttons: [] };
    line.amount += Number(t.amount);
    line.count += 1;
    line.entries = [...(line.entries ?? []), toLineEntry(t)];
    if (!line.last || t.occurred_at > line.last) line.last = t.occurred_at;
    incomeLines.set(key, line);
  }
  for (const x of cf.expectedIncome.filter((e) => !e.group_id)) {
    const category = categoryLabel(x.category ?? "Salary");
    incomeLines.set(`s:${x.id}`, {
      id: `s:${x.id}`,
      name: `${category} - ${x.name}`,
      amount: 0,
      category,
      ...ownerOfRow(x.is_joint, x.owner_member_id),
      count: 0,
      last: null,
      lead: [`${x.status === "pending" ? "Waiting on confirmation" : "Expected"}${x.next_date ? ` ${fmtDate(x.next_date)}` : ""} · ${formatCurrency(Number(x.amount), currency)}`],
      tail: [],
      buttons: [
        <ReceiveIncomeControl key="receive" scheduleId={x.id} amount={Number(x.amount)} accounts={pickable} currency={currency} />,
        <RemoveButton key="remove" id={x.id} kind="income_schedule" label={`Delete "${x.name}"`} />,
      ],
    });
  }
  // The donut and its breakdown are a report (Janine, 26 October), as on
  // Expenses: read only. Each line, with Receive, Delete and its entries to
  // edit or remove, sits under INCOME BY PERSON below it.
  const incomeLinesDone = finish(incomeLines, "payment");
  const incomeItems = incomeLinesDone.map(({ actions: _actions, ...item }) => item);

  const forLabel = (table: string | null, id: string | null): string | null =>
    !table || !id ? null : (table === "liabilities" ? targets.loans : table === "assets" ? targets.assets : targets.goals).find((x) => x.id === id)?.name ?? null;
  const expenseLines = new Map<string, Line>();
  for (const t of cf.periodOut) {
    const category = categoryLabel(t.category ?? "Other");
    const owner = ownerOfRow(t.is_joint, t.owner_member_id);
    const name = (t.source_table === "bills" && t.source_id ? cf.billName[t.source_id] : cf.billNameByPayment[t.id]) ?? t.particulars.trim();
    const key = `${owner.ownerKey}:${category}:${name.toLowerCase()}`;
    const line = expenseLines.get(key) ?? { id: key, name: `${category} - ${name}`, amount: 0, category, ...owner, count: 0, last: null, lead: [], tail: [], buttons: [] };
    line.amount += Number(t.amount);
    line.count += 1;
    line.entries = [...(line.entries ?? []), toLineEntry(t)];
    if (!line.last || t.occurred_at > line.last) line.last = t.occurred_at;
    expenseLines.set(key, line);
  }
  for (const bill of cf.openBills) {
    const category = categoryLabel(bill.category ?? "Utilities");
    const owner = ownerOfRow(bill.is_joint, bill.owner_member_id);
    const base = `${owner.ownerKey}:${category}:${bill.name.toLowerCase()}`;
    // A bill due again rides on what it already cost this period; a second
    // one of the same name still open stands on its own.
    const key = expenseLines.get(base)?.buttons.length ? `${base}:${bill.id}` : base;
    const line = expenseLines.get(key) ?? { id: key, name: `${category} - ${bill.name}`, amount: 0, category, ...owner, count: 0, last: null, lead: [], tail: [], buttons: [] };
    if (bill.id === billId) line.reveal = true;
    // The account it comes out of, when one was chosen on Add expense.
    const from = bill.account_id ? accounts.find((a) => a.id === bill.account_id) : null;
    // Its day come (Jonathan, 26 October): the line asks whether it went
    // through, and Settle opens on that question.
    const dueDay = bill.due_date?.slice(0, 10) ?? null;
    const due = bill.status !== "scheduled" && dueDay ? (dueDay < today ? "overdue" : dueDay === today ? "today" : null) : null;
    const when = bill.status === "scheduled" ? "Payment waiting on confirmation" : due === "today" ? "Due today" : due === "overdue" ? `Overdue since ${fmtDate(bill.due_date!)}` : `Due${bill.due_date ? ` ${fmtDate(bill.due_date)}` : ""}`;
    // What it is for, when it is: the loan it pays down, the asset, the goal.
    const forName = forLabel(bill.against_table, bill.against_id);
    line.tail.push(`${when} · ${formatCurrency(Number(bill.amount), currency)}${from ? ` · from ${from.name}` : ""}${forName ? ` · for ${forName}` : ""}${due ? " · did it go through?" : ""}`);
    // The id is what Today's Pay button lands on.
    line.buttons.push(
      <span key={bill.id} id={`bill-${bill.id}`} className="kin-bill-actions" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
        <PayBillControl billId={bill.id} amount={Number(bill.amount)} accounts={pickable} currency={currency} defaultAccountId={bill.account_id} due={due} autoOpen={bill.id === billId} loan={bill.against_table === "liabilities" ? (targets.loans.find((l) => l.id === bill.against_id) ?? null) : null} />
        {bill.due_date && <BillReminderPicker billId={bill.id} days={bill.remind_days_before ?? DEFAULT_BILL_REMIND_DAYS} weekly={bill.recurrence === "weekly"} />}
        <RemoveButton id={bill.id} kind="bill" label={`Delete "${bill.name}"`} />
      </span>,
    );
    expenseLines.set(key, line);
  }
  // Bills already settled: on the line of what they cost this period, or --
  // settled outside Kin, with nothing in the ledger -- a line of their own
  // with nothing counted, so a paid bill never just disappears.
  for (const bill of cf.settledBills) {
    const category = categoryLabel(bill.category ?? "Utilities");
    const owner = ownerOfRow(bill.is_joint, bill.owner_member_id);
    const key = `${owner.ownerKey}:${category}:${bill.name.toLowerCase()}`;
    const line = expenseLines.get(key) ?? { id: `${key}:settled`, name: `${category} - ${bill.name}`, amount: 0, category, ...owner, count: 0, last: null, lead: [], tail: [], buttons: [] };
    line.tail.push(`Settled${bill.paid_at ? ` ${fmtDate(bill.paid_at)}` : ""}${bill.transaction_id ? "" : ` · ${formatCurrency(Number(bill.amount), currency)} paid outside Kin`}`);
    expenseLines.set(expenseLines.has(key) ? key : line.id, line);
  }
  // The pie and its breakdown are a report (Janine, 26 October): read
  // only. Each line, with its entries to edit or remove and a bill's
  // Settle, Remind and Remove, sits under its category in its owner's block
  // under SPENDING BY PERSON instead.
  // "3 expenses · last 23 Oct": the category above counts expenses too.
  const expenseLinesDone = finish(expenseLines, "expense");
  const expenseItems = expenseLinesDone.map(({ actions: _actions, ...item }) => item);
  const linesFor = (memberId: string | null, category: string) =>
    expenseLinesDone.filter((l) => l.ownerKey === (memberId ?? "joint") && l.category === categoryLabel(category));
  const lineCategories = (memberId: string | null) =>
    [...new Set(expenseLinesDone.filter((l) => l.ownerKey === (memberId ?? "joint")).map((l) => l.category))];
  // Folded to start, but a link to an open bill (Today's Pay) opens its
  // owner's block, and a single person's view opens its one.
  const linkedBill = billId ? cf.openBills.find((b) => b.id === billId) : undefined;
  const openFirst = [
    ...(scope !== "all" && people[0] ? [people[0].memberId ?? "family"] : []),
    ...(linkedBill ? [linkedBill.is_joint !== false || !linkedBill.owner_member_id ? "family" : linkedBill.owner_member_id] : []),
  ];
  const personDetails = Object.fromEntries(
    people.map((p) => {
      const whoseKey = p.memberId ?? "family";
      const canEdit = canSetFor(p.memberId);
      // A category with only an open bill so far still gets its row.
      const extra = lineCategories(p.memberId)
        .filter((label) => !p.categories.some((c) => categoryLabel(c.category) === label))
        .map((label) => ({ category: EXPENSE_CATEGORIES.find((c) => categoryLabel(c) === label) ?? label, spent: 0, amount: 0 }));
      const cats = [...p.categories, ...extra].sort((a, b) => (a.amount > 0) === (b.amount > 0) ? overBy(b) - overBy(a) : a.amount > 0 ? -1 : 1);
      return [
        whoseKey,
        <>
          {p.memberId === memberId && sharing && <BudgetVisibility isPrivate={sharing.isPrivate} viewers={sharing.viewers} people={audience} />}
          {cats.length === 0 && <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem" }}>Nothing spent or budgeted yet this month.</p>}
          {cats.map((c) => (
            <CategoryBudgetRow key={c.category} whose={whoseKey} category={c.category} amount={c.amount} spent={c.spent} currency={currency} color={expenseCategoryColor(c.category)} canEdit={canEdit}>
              <CategoryLines lines={linesFor(p.memberId, c.category)} currency={currency} />
            </CategoryBudgetRow>
          ))}
          {canEdit && <AllocationEditor whose={whoseKey} budgeted={cats.filter((c) => c.amount > 0).map((c) => c.category)} />}
        </>,
      ];
    }),
  );
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", margin: "14px 0 4px" }}>
        <PickButton title="Who" icon="users" label={who.whoLabel} options={who.options} />
        <span style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
          {/* Cash Flow is by whose the money is, not whose account it moved
              through (entry_owner, 23 October); the caption says so. */}
          {scope === "all" ? "Everything you can see" : scope === WEALTH_FAMILY ? "The family's, in nobody's name" : mine ? "Your own income and expenses" : "Their income and expenses, as shared"}
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
      {incomeItems.length === 0 ? (
        <Empty icon={<Icon name="wallet" size={26} />} title="Nothing recorded yet" line="Salary, a regular gift, business revenue — expect it here so receiving it is one tap." />
      ) : (
        <>
          {/* In a card, as the donuts on Accounts and A&L are (26 October). */}
          <Blueprint style={{ padding: "0.9375rem", marginBottom: "0.875rem" }}>
            <GroupedBreakdown items={incomeItems} currency={currency} storageKey="kin-income" categoryOrder={INCOME_SOURCES.map(categoryLabel)} center={{ label: `this ${periodNoun}`, note: "money in" }} />
          </Blueprint>
          <SectionLabel>{scope === "all" ? "INCOME BY PERSON" : `${whosePossessive.toUpperCase()} INCOME`}</SectionLabel>
          <LinesByPerson lines={incomeLinesDone} currency={currency} categoryOrder={INCOME_SOURCES.map(categoryLabel)} noun="entry" />
        </>
      )}
      <UtangInstalments heading="MONEY LENT COMING BACK" rows={comingBack} currency={currency} fmtDate={fmtDate} />
      {/* Remittances and utang & paluwagan open from inside this sheet
          (22 October): they are ways money comes in, not rows of their own. */}
      <AddIncomeScheduleForm accounts={bareAccounts} whose={whose} openLent={openLent} currency={currency} grownUp={grownUp} today={today} />
      </CollapsibleGroup>

      <CollapsibleGroup title="EXPENSES" defaultOpen={openExpenses}>
      {/* The breakdown first, as on Income and Accounts (Janine, 26
          October): whose, then category, then each line. Then what is due
          in the next 30 days and the two reports, then Add expense
          (Jonathan, 26 October: the "where it came from" card, the family
          statements and the receipt row went; the rest moved up under the
          donut). Budgets, by person, follow. */}
      {billId && cf.openBills.some((b) => b.id === billId) && <ScrollIntoView targetId={`bill-${billId}`} />}
      {expenseItems.length === 0 ? (
        <Empty icon={<Icon name="receipt" size={26} />} title="Nothing recorded yet" line="Mortgage payments, groceries, checkups, meals, travel, fuel — anything the household spends on." />
      ) : (
        <Blueprint style={{ padding: "0.9375rem", marginBottom: "0.875rem" }}>
          <GroupedBreakdown
            items={expenseItems}
            currency={currency}
            storageKey="kin-expenses"
            categoryOrder={EXPENSE_CATEGORIES.map(categoryLabel)}
            center={{ label: "spent", note: budget.spendBudget > 0 && range === "month" ? `of ${formatCurrency(budget.spendBudget, currency)}` : `this ${periodNoun}` }}
          />
        </Blueprint>
      )}
      <UpcomingBills bills={cf.openBills} currency={currency} fmtDate={fmtDate} today={today} />
      {/* Last month in one page, for the grown-ups (19 October): the same
          page the push on the 1st opens. Then everything that repeats --
          monthly, quarterly, yearly -- and what it all comes to in a year,
          built from these same bills. */}
      <SectionLabel>REPORTS</SectionLabel>
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
      <Link
        href="/wealth/subscriptions"
        style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 0", fontSize: "0.875rem", color: "inherit", textDecoration: "none", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}
      >
        <Icon name="receipt" size={18} />
        <span style={{ flex: 1 }}>Subscriptions: what repeats, and its cost a year</span>
        <span aria-hidden="true" style={{ color: "var(--color-neutral-600)" }}>›</span>
      </Link>
      {/* The month's budget is its categories added up (26 October): no
          budget set, what was spent, against nothing. */}
      <Meter
        label={budget.spendBudget > 0 ? "Spent of budget" : "Spent this month"}
        value={budget.monthExpense}
        cap={budget.spendBudget > 0 ? budget.spendBudget : null}
        currency={currency}
        note={
          scope === "all"
            ? `Family's and everyone's category budgets, added up.${privateBudgets > 0 ? ` ${privateBudgets === 1 ? "1 person's budget is" : `${privateBudgets} people's budgets are`} private and not counted.` : ""}`
            : budget.spendBudget > 0
              ? "The category budgets below, added up."
              : canSetBudgets
                ? "Set a budget for a category below."
                : "No budget set."
        }
      />
      <SectionLabel>{scope === "all" ? "SPENDING BY PERSON" : `${whosePossessive.toUpperCase()} SPENDING`}</SectionLabel>
      {people.length === 0 ? (
        <Empty icon={<Icon name="activity" size={26} />} title="Nothing spent yet this month" line="Once money moves, this breaks it down by person and category so you can see where it actually goes." />
      ) : (
        <SpendingByPerson people={people} currency={currency} details={personDetails} openFirst={openFirst} />
      )}

      <UtangInstalments heading="MONEY BORROWED TO PAY BACK" rows={toPayBack} currency={currency} fmtDate={fmtDate} />
      {/* Last in the group (Jonathan, 26 October), under the budget and
          Spending by person, as Add income closes INCOME and Add account
          closes the Accounts list: the group reads top to bottom, then
          adds. Snap a receipt lives inside the sheet, and only once Kin AI
          has its key: with no key the page could only say it is off. */}
      <AddExpenseForm whose={whose} accounts={pickable} currency={currency} today={today} targets={targets} scan={kinAiReady()} />
      </CollapsibleGroup>
    </>
  );
}

/* ------------------------------------------------------------- accounts */

async function ScopePane({ scope, familyId, memberId, currency, range, newAccountId, includePrivate, grownUp }: { scope: WealthScope; familyId: string; memberId: string; currency: string; range: CashFlowRange; newAccountId?: string; includePrivate: boolean; grownUp: boolean }) {
  const [dateFormat, pane, cf, who, allArchived, viewers] = await Promise.all([
    householdDateFormat(),
    getWealthPane(familyId, memberId, scope, "account"),
    // Budget and target now live on Cash Flow -- this pane only still
    // needs getCashFlowPane for its own history strip, at whichever range
    // the picker below is set to.
    getCashFlowPane(familyId, range, scope, "account"),
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
  const breakdown = {
    items: pane.accounts.map((a): BreakdownItem => ({
      id: a.id,
      name: accountLabel(a),
      amount: a.balance,
      category: ACCOUNT_TYPE_LABELS[a.account_type as AccountType] ?? a.account_type,
      ...who.sliceOwner(a.owner_member_id, a.is_joint),
    })),
    storageKey: "kin-accounts-breakdown",
    categoryOrder: ACCOUNT_TYPES.map((t) => ACCOUNT_TYPE_LABELS[t]),
  };
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

/** Draws nothing: brings this month's net-worth point up to date from Cash
 * Flow and Accounts too, streamed so the page never waits on it. */
async function NetWorthKeeper({ familyId, memberId }: { familyId: string; memberId: string }) {
  const today = familyDay(new Date(), await householdZone());
  await keepNetWorthCurrent(familyId, memberId, today).catch(() => undefined);
  return null;
}

/* -------------------------------------------------------------------- A&L */

async function AssetsPane({ familyId, memberId, currency, scope }: { familyId: string; memberId: string; currency: string; scope: WealthScope }) {
  const [fmtDate, today] = await Promise.all([familyDate(), householdZone().then((tz) => familyDay(new Date(), tz))]);
  const [nw, who, allAccounts, loanBills, onPlanner] = await Promise.all([
    getNetWorth(familyId, scope, today),
    whoPicker(familyId, memberId, scope, (w) => `/wealth?seg=assets&who=${w}`),
    getAccounts(familyId),
    getLoanBillIds(familyId),
    getGoalsOnPlanner(familyId),
  ]);
  const { assets, liabilities, goals, cashAccounts, investmentAccounts, creditAccounts, assetTotal, liabilityTotal, goalTotal, cashTotal, investmentTotal, creditOwed, owedToUs, paluwaganIn, receivables, weOwe, paluwaganOwed, payables, netWorth } = nw;
  // Deliberately not `cashAccounts` -- that list is scoped to whoever the
  // Who picker is showing, but the account a contribution actually leaves
  // from has to be one the viewer themself can pay out of, regardless of
  // whose net worth they're looking at.
  const pickableCash = toPickable(allAccounts, memberId);
  const mine = scope === memberId;
  // What is still owed on each asset, from the loans linked to it
  // (20261023231000): its value less this is the household's equity in it.
  const owedOn = new Map<string, number>();
  for (const l of liabilities) if (l.asset_id) owedOn.set(l.asset_id, (owedOn.get(l.asset_id) ?? 0) + Number(l.balance));
  const assetChoices = assets.map((a) => ({ id: a.id, name: a.name }));
  const accountSub = (a: { account_type: string; institution: string | null }) => `${ACCOUNT_TYPE_LABELS[a.account_type as AccountType] ?? a.account_type}${a.institution ? ` · ${a.institution}` : ""}`;
  // An account's line opens its own page: that is where it is edited.
  const openAccount = (id: string) => `/wealth/accounts/${id}`;

  // The donut (a report, as on Accounts and Cash Flow): everything owned,
  // grouped by whose and then by what it is on a balance sheet (Jonathan,
  // 26 October). Cash and savings hold the accounts and, as "set aside",
  // every goal -- a goal is cash earmarked, not an asset of its own.
  // Investments hold the MP2s, time deposits and stocks beside an asset
  // recorded as an investment; then property, vehicles and the rest.
  const owned: BreakdownItem[] = [
    ...cashAccounts.map((a) => ({ id: `acct-${a.id}`, name: accountLabel(a), amount: a.balance, category: AL_CASH, ...who.sliceOwner(a.owner_member_id, a.is_joint) })),
    ...goals.map((g) => ({ id: `goal-${g.id}`, name: `Set aside: ${g.title}`, amount: Number(g.current_amount), category: AL_CASH, ...who.sliceOwner(g.owner_member_id, g.is_joint) })),
    ...investmentAccounts.map((a) => ({ id: `acct-${a.id}`, name: accountLabel(a), amount: a.balance, category: AL_INVESTMENTS, ...who.sliceOwner(a.owner_member_id, a.is_joint) })),
    ...assets.map((a) => ({ id: `asset-${a.id}`, name: a.name, amount: a.worth.total, category: assetGroup(a.kind), ...who.sliceOwner(a.owner_member_id, a.is_joint) })),
    // Utang and paluwagan count too (Janine, 23 October): money lent is
    // owed to us, a paluwagan holds what we have put in. Household records.
    ...(owedToUs > 0 ? [{ id: "utang-lent", name: "Money lent, owed to us", amount: owedToUs, category: UTANG_GROUP, ...who.sliceOwner(null, true) }] : []),
    ...(paluwaganIn > 0 ? [{ id: "paluwagan-in", name: "Savings circle, put in", amount: paluwaganIn, category: UTANG_GROUP, ...who.sliceOwner(null, true) }] : []),
  ];
  const owed: BreakdownItem[] = [
    ...liabilities.map((l) => ({ id: l.id, name: l.name, amount: Number(l.balance), category: LIABILITY_KIND_LABELS[l.kind as LiabilityKind] ?? l.kind, ...who.sliceOwner(l.owner_member_id, l.is_joint) })),
    // A credit card's balance below zero is money owed (26 October), not
    // cash with a minus on it.
    ...creditAccounts.map((a) => ({ id: `credit-${a.id}`, name: accountLabel(a), amount: a.owed, category: LIABILITY_KIND_LABELS.credit_card, ...who.sliceOwner(a.owner_member_id, a.is_joint) })),
    ...(weOwe > 0 ? [{ id: "utang-borrowed", name: "Money borrowed, we owe", amount: weOwe, category: UTANG_GROUP, ...who.sliceOwner(null, true) }] : []),
    ...(paluwaganOwed > 0 ? [{ id: "paluwagan-owed", name: "Savings circle pot taken early", amount: paluwaganOwed, category: UTANG_GROUP, ...who.sliceOwner(null, true) }] : []),
  ];

  // The editable side, as Income and Expenses have it (Janine, 26 October):
  // whose, then the same groups as the donut, then each holding with what
  // can be done to it. An account is read-only here -- its balance moves
  // with the ledger -- and opens on the Accounts tab.
  const ownedLines: BreakdownItem[] = [
    ...cashAccounts.map((a) => ({ id: `acct-${a.id}`, name: accountLabel(a), amount: a.balance, category: AL_CASH, ...who.sliceOwner(a.owner_member_id, a.is_joint), sub: accountSub(a), href: openAccount(a.id) })),
    ...goals.map((g) => ({
      id: `goal-${g.id}`,
      name: g.title,
      amount: Number(g.current_amount),
      category: AL_CASH,
      ...who.sliceOwner(g.owner_member_id, g.is_joint),
      sub: `${AL_SET_ASIDE}${g.sub_note ? ` · ${g.sub_note}` : ""}${onPlanner.has(g.id) ? " · a ring on Planner fills from it" : ""}`,
      detail: <GoalProgress goal={g} today={today} currency={currency} fmtDate={fmtDate} accounts={pickableCash} />,
      actions: (
        <>
          <GoalContributeControl goalId={g.id} accounts={pickableCash} currency={currency} linkedAccountId={g.linked_account_id} />
          {!!g.target_date && Number(g.current_amount) > 0 && canMarkPaid(g.target_date, today) && (
            <FundPaidControl goalId={g.id} title={g.title} accounts={pickableCash} currency={currency} saved={Number(g.current_amount)} target={Number(g.target_amount ?? 0)} linkedAccountId={g.linked_account_id} repeatsYearly={g.repeats_yearly} />
          )}
          <EditSavingsGoalButton goal={{ id: g.id, title: g.title, note: g.sub_note, target: Number(g.target_amount ?? 0), date: g.target_date, yearly: g.repeats_yearly }} currency={currency} />
          {onPlanner.has(g.id) && (
            <Link href="/planner?seg=goals" className="btn btn-secondary" style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              On Planner ›
            </Link>
          )}
          <RemoveButton id={g.id} kind="goal" label={`Delete "${g.title}"`} />
        </>
      ),
    })),
    ...investmentAccounts.map((a) => ({ id: `acct-${a.id}`, name: accountLabel(a), amount: a.balance, category: AL_INVESTMENTS, ...who.sliceOwner(a.owner_member_id, a.is_joint), sub: accountSub(a), href: openAccount(a.id) })),
    ...assets.map((a) => ({
      id: `asset-${a.id}`,
      name: a.name,
      amount: a.worth.total,
      category: assetGroup(a.kind),
      ...who.sliceOwner(a.owner_member_id, a.is_joint),
      sub: [ASSET_KIND_LABELS[a.kind as AssetKind] ?? a.kind, a.acquired_on ? `since ${fmtDate(a.acquired_on)}` : null, a.note, a.updated_at ? `updated ${timeSinceLabel(a.updated_at)}` : null].filter(Boolean).join(" · "),
      detail: (
        <>
          <AssetWorthLine asset={a} currency={currency} />
          {(owedOn.get(a.id) ?? 0) > 0 && (
            <div style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" }}>
              Still owed on it {formatCurrency(owedOn.get(a.id)!, currency)} · yours after the loan:{" "}
              <span style={{ fontFamily: "var(--font-numeric)", color: "var(--color-text)", fontWeight: 600 }}>{formatCurrency(a.worth.total - owedOn.get(a.id)!, currency)}</span>
            </div>
          )}
        </>
      ),
      actions: (
        <>
          <AssetBreakdownControl
            assetId={a.id}
            assetName={a.name}
            currency={currency}
            items={a.items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, cost: Number(i.cost), acquired_on: i.acquired_on, value_now: i.value_now == null ? null : Number(i.value_now), worth: i.worth }))}
          />
          <ValueUpdateControl id={a.id} current={Number(a.value)} kind="asset" yearlyChange={a.annual_change_pct == null ? null : Number(a.annual_change_pct)} />
          <RemoveButton id={a.id} kind="asset" label={`Remove "${a.name}"`} />
        </>
      ),
    })),
  ];
  const owedLines: BreakdownItem[] = [
    ...liabilities.map((l) => ({
      id: l.id,
      name: l.name,
      amount: Number(l.balance),
      category: LIABILITY_KIND_LABELS[l.kind as LiabilityKind] ?? l.kind,
      ...who.sliceOwner(l.owner_member_id, l.is_joint),
      sub: [
        l.lender,
        l.asset_id && assets.find((a) => a.id === l.asset_id) ? `on ${assets.find((a) => a.id === l.asset_id)!.name}` : null,
        l.monthly_payment ? `${formatCurrency(Number(l.monthly_payment), currency)}/mo` : null,
        l.updated_at ? `updated ${timeSinceLabel(l.updated_at)}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
      detail: <LoanLines loan={l} today={today} currency={currency} fmtDate={fmtDate} />,
      actions: (
        <>
          {/* Paying it from here splits the payment into interest and
              what pays the loan down, and lowers the balance
              (20261023220000). */}
          {Number(l.balance) > 0 && (
            <Link
              href={`/wealth/transact?mode=out&against=liabilities:${l.id}${l.monthly_payment ? `&amount=${Number(l.monthly_payment)}` : ""}`}
              className="btn btn-secondary"
              style={{ minHeight: "1.875rem", fontSize: "0.78125rem", padding: "0 0.5625rem", display: "inline-flex", alignItems: "center", textDecoration: "none" }}
            >
              Record a payment
            </Link>
          )}
          {/* The payment as a monthly bill (26 October): Today, the
              calendar and the reminder, with Settle paying the loan down. */}
          {Number(l.balance) > 0 && <LoanBillButton liabilityId={l.id} hasBill={loanBills.has(l.id)} />}
          <LoanAssetPicker liabilityId={l.id} assetId={l.asset_id} assets={assetChoices} />
          <LoanScheduleControl
            id={l.id}
            monthlyPayment={l.monthly_payment == null ? null : Number(l.monthly_payment)}
            nextPaymentDate={loanStatus(l, today).next}
            paymentsLeft={loanStatus(l, today).next ? loanStatus(l, today).left : null}
            interestRate={l.interest_rate == null ? null : Number(l.interest_rate)}
            originalAmount={l.original_amount == null ? null : Number(l.original_amount)}
            termMonths={l.term_months}
            rateFixedUntil={l.rate_fixed_until}
          />
          <ValueUpdateControl id={l.id} current={Number(l.balance)} kind="liability" />
          <RemoveButton id={l.id} kind="liability" label={`Remove "${l.name}"`} />
        </>
      ),
    })),
    ...creditAccounts.map((a) => ({
      id: `credit-${a.id}`,
      name: accountLabel(a),
      amount: a.owed,
      category: LIABILITY_KIND_LABELS.credit_card,
      ...who.sliceOwner(a.owner_member_id, a.is_joint),
      sub: `${accountSub(a)}${a.card_due_day ? ` · due ${fmtDate(cardDueDate(a.card_due_day, today))}` : ""}${a.card_min_payment ? ` · minimum ${formatCurrency(Number(a.card_min_payment), currency)}` : ""}${a.card_due_day ? "" : " · set its due day on the card's page to be reminded"}`,
      href: openAccount(a.id),
    })),
  ];

  const netWorthHistory = await recordAndGetNetWorthHistory(familyId, memberId, scope, {
    cash: cashTotal + investmentTotal,
    goals: goalTotal,
    assets: assetTotal + receivables,
    liabilities: liabilityTotal + payables + creditOwed,
    netWorth,
  });
  const captionParts = [
    `${formatCurrency(cashTotal + goalTotal, currency)} cash${goalTotal > 0 ? ` (${formatCurrency(goalTotal, currency)} of it set aside)` : ""}`,
    ...(investmentTotal !== 0 ? [`${formatCurrency(investmentTotal, currency)} invested`] : []),
    `${formatCurrency(assetTotal, currency)} owned`,
    ...(receivables > 0 ? [`${formatCurrency(receivables, currency)} owed to us`] : []),
  ];
  const addButton = { minHeight: "2.625rem", fontSize: "0.84375rem", letterSpacing: ".04em" } as const;

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
        caption={`${captionParts.join(" + ")} − ${formatCurrency(liabilityTotal + payables + creditOwed, currency)} owed`}
        breakdown={{ items: owned, storageKey: "kin-al-owned", categoryOrder: [...AL_OWNED_ORDER, UTANG_GROUP] }}
      />

      <NetWorthLine points={netWorthHistory} currency={currency} />
      <NetWorthMoves points={netWorthHistory} currency={currency} />

      <CollapsibleGroup title="ASSETS" defaultOpen={false}>
      {ownedLines.length === 0 ? (
        <Empty icon={<Icon name="house" size={26} />} title="Nothing recorded yet" line="Accounts come here on their own from the Accounts tab. Add property, a vehicle, anything the family owns that holds value, and it counts toward net worth." />
      ) : (
        <LinesByPerson lines={ownedLines} currency={currency} categoryOrder={[...AL_OWNED_ORDER]} noun="holding" storageKey="kin-al-assets" always />
      )}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
        <Link scroll={false} href="/wealth/assets/new?kind=asset" className="btn btn-primary" style={{ ...addButton, flex: 1 }}>
          + ASSET
        </Link>
        <Link scroll={false} href="/wealth/add" className="btn btn-secondary" style={{ ...addButton, flex: 1 }}>
          + GOAL
        </Link>
      </div>
      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "0.5rem 0 0" }}>
        A bank, e-wallet, cash or investment account is added on the <Link href="/wealth?seg=accounts">Accounts tab</Link> and counts here on its own. A goal is cash set aside: its money left a real account.
      </p>
      </CollapsibleGroup>

      <CollapsibleGroup title="LIABILITIES" defaultOpen={false}>
      {owed.length >= 2 && (
        <Blueprint style={{ padding: "0.9375rem", margin: "0.75rem 0 0.875rem" }}>
          <GroupedBreakdown
            head={
              <>
                <div className="kin-eyebrow">OWED · BY WHOSE</div>
                <div style={{ font: "600 1.5rem/1.1 var(--font-heading)", marginTop: 6 }}>{formatCurrency(liabilityTotal + payables + creditOwed, currency)}</div>
              </>
            }
            items={owed}
            currency={currency}
            storageKey="kin-al-owed"
            categoryOrder={[...LIABILITY_KINDS.map((k) => LIABILITY_KIND_LABELS[k]), UTANG_GROUP]}
          />
        </Blueprint>
      )}
      {/* Utang and paluwagan are kept on their own page; here, what they
          add to and take from net worth, one tap from the detail. */}
      {(receivables > 0 || payables > 0) && (
        <Link
          href="/wealth/utang"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 0", fontSize: "0.875rem", color: "inherit", textDecoration: "none", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}
        >
          <Icon name="users" size={18} />
          <span style={{ flex: 1 }}>
            Lending &amp; savings circles
            <span style={{ display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
              {receivables > 0 ? `${formatCurrency(receivables, currency)} owed to us` : ""}
              {receivables > 0 && payables > 0 ? " · " : ""}
              {payables > 0 ? `${formatCurrency(payables, currency)} we owe` : ""}
            </span>
          </span>
          <span aria-hidden="true" style={{ color: "var(--color-neutral-600)" }}>›</span>
        </Link>
      )}
      {owedLines.length === 0 && payables === 0 ? (
        <Empty icon={<Icon name="check" size={26} />} title="Nothing owed" line="No loans or debts on record. If that changes, adding them here keeps the net worth figure honest." />
      ) : (
        <LinesByPerson lines={owedLines} currency={currency} categoryOrder={LIABILITY_KINDS.map((k) => LIABILITY_KIND_LABELS[k])} noun="debt" storageKey="kin-al-liabilities" always />
      )}
      <Link scroll={false} href="/wealth/assets/new?kind=liability" className="btn btn-primary btn-block" style={{ ...addButton, marginTop: "0.25rem" }}>
        + LIABILITY
      </Link>
      </CollapsibleGroup>

      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "1rem" }}>
        Net worth counts every account balance, everything set aside toward a goal, plus what you own, less what you owe (a credit card&apos;s balance included).
        A house with a loan on it counts at its full value, and the loan at what is still owed: the difference is what is truly yours.
        Update a value whenever it changes.
      </div>
    </>
  );
}

/** A goal's progress under its line (26 October): the bar, what is saved of
 * the target, the date and the plan to reach it, and where it is kept. The
 * goal's card before it, less the title and the buttons, which the line
 * now carries. */
function GoalProgress({ goal: g, today, currency, fmtDate, accounts }: { goal: Awaited<ReturnType<typeof getNetWorth>>["goals"][number]; today: string; currency: string; fmtDate: (d: string) => string; accounts: { id: string; name: string }[] }) {
  const target = Number(g.target_amount ?? 0);
  const current = Number(g.current_amount);
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const plan = g.target_date && target > 0 ? fundPlan({ target, saved: current, due: g.target_date, today, cycleStart: cycleStart({ createdDay: g.created_at.slice(0, 10), due: g.target_date, repeatsYearly: g.repeats_yearly }) }) : null;
  const muted = { fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.3125rem" } as const;
  return (
    <div style={{ marginTop: "0.375rem" }}>
      <div style={{ height: 8, border: "1px solid var(--color-divider)", background: "var(--color-bg)" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-accent)" }} />
      </div>
      <div style={{ display: "flex", ...muted }}>
        <span>
          {formatCurrency(current, currency)} of {formatCurrency(target, currency)}
        </span>
        <span style={{ marginLeft: "auto" }}>{pct}%</span>
      </div>
      {g.target_date && (
        <div style={muted}>
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
      {g.linked_account_id && <div style={muted}>Saved in {accounts.find((a) => a.id === g.linked_account_id)?.name ?? "an account you can no longer see"}</div>}
    </div>
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

/** Under a loan's line: its schedule, how the next payment splits into
 * interest and what pays the loan down, and -- when what was borrowed and
 * the term are known (20261026170000) -- where it stands by its own terms:
 * payments made, interest paid so far and over the whole loan, the balance
 * the terms say should be owed against the one on record (with a tap to
 * take the terms' figure), and when a fixed rate ends. */
function LoanLines({
  loan,
  today,
  currency,
  fmtDate,
}: {
  loan: LoanTerms & { id: string };
  today: string;
  currency: string;
  fmtDate: (d: string) => string;
}) {
  const muted = { fontSize: "0.78125rem", color: "var(--color-neutral-600)", marginTop: "0.25rem" } as const;
  const balance = Number(loan.balance);
  const monthly = loan.monthly_payment == null ? null : Number(loan.monthly_payment);
  const rate = loan.interest_rate == null ? null : Number(loan.interest_rate);
  const split = monthly && monthly > 0 && rate != null && balance > 0 ? loanPaymentSplit(balance, rate, monthly) : null;
  const origin = loanOriginStatus(loan, today);
  const fixed = origin?.fixedMonthsLeft ?? null;
  return (
    <>
      <LoanScheduleLine loan={{ ...loan, monthly_payment: monthly, interest_rate: rate }} today={today} currency={currency} fmtDate={fmtDate} />
      {split && (
        <div style={muted}>
          Of the next {formatCurrency(monthly!, currency)}, about {formatCurrency(split.interest, currency)} is interest and {formatCurrency(split.principal, currency)} pays the loan down.
          {split.principal === 0 ? " It does not cover the interest, so nothing is paid down." : ""}
        </div>
      )}
      {origin && (
        <div style={muted}>
          Borrowed {formatCurrency(origin.original, currency)} over {origin.term} months · {origin.made} paid, {origin.left} left · interest so far about {formatCurrency(origin.interestPaid, currency)}, about {formatCurrency(origin.totalInterest, currency)} over the whole loan
        </div>
      )}
      {origin && Math.abs(origin.gap) >= 1 && (
        <div style={{ ...muted, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem" }}>
          <span>
            By its terms about {formatCurrency(origin.expectedBalance, currency)} should be owed now; {formatCurrency(balance, currency)} is on record, {formatCurrency(Math.abs(origin.gap), currency)} {origin.gap > 0 ? "more" : "less"} — extra payments, a rate that changed, or a balance from an older statement.
          </span>
          <SetBalanceButton id={loan.id} value={origin.expectedBalance} currency={currency} paymentsLeft={paymentsLeftForBalance(loan, balance)} />
        </div>
      )}
      {origin && Math.abs(origin.gap) < 1 && origin.made > 0 && <div style={muted}>The balance on record matches its terms.</div>}
      {loan.rate_fixed_until && (
        <div style={muted}>
          {fixed != null && fixed < 0
            ? `The fixed rate ended ${fmtDate(loan.rate_fixed_until)}: ask the bank what the rate is now and update it under Payments.`
            : `Rate fixed until ${fmtDate(loan.rate_fixed_until)}${fixed != null ? ` · ${fixed} month${fixed === 1 ? "" : "s"} more` : ""}, then the bank reprices${fixed != null && fixed <= 3 ? " — soon: ask for the new rate" : ""}.`}
        </div>
      )}
    </>
  );
}

/** The expenses under one category in a person's block (26 October): each
 * line as the breakdown names it, with its entries to edit or remove and an
 * open bill's own buttons. Folded away until opened, except when a bill on
 * it is still to be settled. */
function CategoryLines({ lines, currency, noun = "expense", open, always = false }: { lines: BreakdownItem[]; currency: string; noun?: string; open?: boolean; /** The lines are the content (A&L's holdings): no "N things" fold, always shown. */ always?: boolean }) {
  if (lines.length === 0) return null;
  const count = lines.length;
  // A Cash Flow line is named "Category - name"; the category is the
  // heading above, so the line shows the rest. Only that exact prefix goes:
  // "BPI - Payroll" is an account's whole name.
  const shown = (l: BreakdownItem) => (l.name.startsWith(`${l.category} - `) ? l.name.slice(l.category.length + 3) : l.name);
  const rows = lines.map((l) => (
    <div key={l.id} style={{ padding: "0.5rem 0 0.625rem", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
      <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.8125rem" }}>
        {l.href ? (
          <Link href={l.href} style={{ minWidth: 0, color: "inherit", textDecoration: "none" }}>
            {shown(l)} <span aria-hidden="true" style={{ color: "var(--color-neutral-600)" }}>›</span>
          </Link>
        ) : (
          <span style={{ minWidth: 0 }}>{shown(l)}</span>
        )}
        <span style={{ marginLeft: "auto", flex: "none", fontFamily: "var(--font-numeric)" }}>{l.amount > 0 ? formatCurrency(l.amount, currency) : "—"}</span>
      </div>
      {l.sub && <div style={{ fontSize: "0.71875rem", color: "var(--color-neutral-600)", marginTop: "0.125rem" }}>{l.sub}</div>}
      {l.detail}
      {l.actions && <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.375rem" }}>{l.actions}</div>}
    </div>
  ));
  if (always) return <div style={{ margin: "-0.25rem 0 0.75rem" }}>{rows}</div>;
  return (
    <details open={open ?? lines.some((l) => !!l.actions && /Due|waiting/.test(l.sub ?? ""))} style={{ margin: "-0.375rem 0 0.75rem" }}>
      <summary style={{ fontSize: "0.75rem", color: "var(--color-switch-on)", cursor: "pointer", minHeight: "1.75rem", display: "flex", alignItems: "center" }}>
        {count} {count === 1 ? noun : noun.replace(/y$/, "ie") + "s"}
      </summary>
      {rows}
    </details>
  );
}

/** Where income is added to and taken from (Janine, 26 October): each
 * owner, folded, then their categories, then each line with Receive,
 * Delete and its entries to edit or remove -- the editable side of the
 * read-only donut above it. */
function LinesByPerson({ lines, currency, categoryOrder, noun, storageKey = "kin-income-person", always = false }: { lines: BreakdownItem[]; currency: string; categoryOrder: string[]; noun: string; storageKey?: string; /** Every line shown, no fold per category (A&L). */ always?: boolean }) {
  const rank = (c: string) => (categoryOrder.indexOf(c) < 0 ? categoryOrder.length : categoryOrder.indexOf(c));
  const owners = [...new Set(lines.map((l) => l.ownerKey))]
    .map((key) => {
      const mine = lines.filter((l) => l.ownerKey === key);
      const cats = [...new Set(mine.map((l) => l.category))].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
      return { key, label: mine[0].ownerLabel, slot: mine[0].ownerSlot, sum: mine.reduce((t, l) => t + l.amount, 0), cats: cats.map((c) => ({ name: c, lines: mine.filter((l) => l.category === c).sort((x, y) => y.amount - x.amount) })) };
    })
    .sort((x, y) => x.slot - y.slot);
  const total = (n: number) => <span style={{ fontFamily: "var(--font-numeric)" }}>{n !== 0 ? formatCurrency(n, currency) : "—"}</span>;
  return (
    <div style={{ marginBottom: "1rem" }}>
      {owners.map((o) => (
        <FoldableSection key={o.key} remember={false} defaultOpen={owners.length === 1} label={o.label.toUpperCase()} storageKey={`${storageKey}-${o.key}`} right={total(o.sum)}>
          {o.cats.map((c) => (
            <div key={c.name} style={{ paddingLeft: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.8125rem", fontWeight: 600, margin: "0.5rem 0 0.25rem" }}>
                <span style={{ minWidth: 0 }}>{c.name}</span>
                <span style={{ marginLeft: "auto", flex: "none" }}>{total(c.lines.reduce((t, l) => t + l.amount, 0))}</span>
              </div>
              <CategoryLines lines={c.lines} currency={currency} noun={noun} open={c.lines.length === 1} always={always} />
            </div>
          ))}
        </FoldableSection>
      ))}
    </div>
  );
}
