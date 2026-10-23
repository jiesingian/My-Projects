import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { getCurrentMember } from "@/lib/session";
import { catchUpOffers, type NextBillOffer } from "@/lib/bill-roll";
import { familyDay } from "@/lib/time";
import { householdZone } from "@/lib/household-zone";
import { monthKey, recentMonths, signedAmount, recentPeriods, periodKey, periodHistory, cashFlowRangeCount, inScope, inTotalsScope, assetWorth, itemWorth, isHouseholdScope, TRANSFER_CATEGORY, type CashFlowRange, type WealthScope } from "@/lib/wealth";

// Re-exported so the page keeps importing its scope type from the module it
// already imports the queries from.
export type { WealthScope };

/** movementCount is every entry on the account, pending included -- what
 * decides whether Delete Account has entries to ask about. */
export type AccountWithBalance = Tables<"accounts"> & { balance: number; pendingCount: number; movementCount: number; shared: boolean };

/** Accounts named on account_viewers: a private account its owner has shared
 * with someone, so not "Only you" (inTotalsScope). */
async function sharedAccountIds(familyId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("account_viewers").select("account_id").eq("family_id", familyId);
  return new Set((data ?? []).map((r) => r.account_id));
}

export type LedgerEntry = Tables<"wealth_transactions"> & {
  accountName: string;
  /** Whose account it moved through -- so a list mixing people can say. */
  accountOwnerId: string | null;
  accountIsJoint: boolean;
  recordedByName: string | null;
};

function currentPeriod() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/** Balances are never stored — an account is its opening balance plus every
 * confirmed movement since, so a bill paid in Household and a transfer made
 * here can never disagree. */
async function loadAccounts(familyId: string, archived = false): Promise<AccountWithBalance[]> {
  const supabase = await createClient();
  const [{ data: accounts }, { data: movements }, shared] = await Promise.all([
    // A deleted account (deleted_at, 20261022150000) is archived too, so the
    // live list already leaves it out; the Archived list has to as well --
    // it can't be restored, only its kept entries remain.
    supabase.from("accounts").select("*").eq("family_id", familyId).eq("is_archived", archived).is("deleted_at", null).order("created_at"),
    supabase.from("wealth_transactions").select("account_id, direction, amount, status").eq("family_id", familyId),
    sharedAccountIds(familyId),
  ]);

  const delta = new Map<string, number>();
  const pending = new Map<string, number>();
  const count = new Map<string, number>();
  for (const m of movements ?? []) {
    count.set(m.account_id, (count.get(m.account_id) ?? 0) + 1);
    delta.set(m.account_id, (delta.get(m.account_id) ?? 0) + signedAmount(m));
    if (m.status === "pending") pending.set(m.account_id, (pending.get(m.account_id) ?? 0) + 1);
  }

  return (accounts ?? []).map((a) => ({
    ...a,
    balance: Number(a.opening_balance) + (delta.get(a.id) ?? 0),
    pendingCount: pending.get(a.id) ?? 0,
    movementCount: count.get(a.id) ?? 0,
    shared: shared.has(a.id),
  }));
}

/** The viewer's member id if they've chosen to leave their own private
 * accounts out of All, else null -- what inTotalsScope takes. */
async function privateLeftOutOfAll(): Promise<string | null> {
  const me = await getCurrentMember();
  return me && me.wealth_include_private === false ? me.id : null;
}

/** Which ledger rows a Who view counts in its money in and out: rows on an
 * account the viewer can see (with their own private ones left out of All
 * if they chose), then by whose the row is -- Janine's salary paid into the
 * joint account is Janine's (20261023210000). A row from before that, with
 * no owner of its own yet, falls back to its account's. */
/** "entry": by whose each row is (Cash Flow). "account": by whose account
 * it moved through (the Accounts tab, whose figures are its accounts'). */
export type FlowBy = "entry" | "account";

function flowFilter(
  accounts: { id: string; is_joint: boolean | null; owner_member_id: string | null; is_private: boolean | null; shared?: boolean }[],
  scope: WealthScope,
  leaveOut: string | null,
  by: FlowBy,
) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return (t: { account_id: string; is_joint: boolean | null; owner_member_id: string | null }) => {
    const a = byId.get(t.account_id);
    if (!a) return false;
    // The Accounts tab walks its cash trend back from these accounts'
    // balances, so there a row is whoever's account it moved through.
    if (by === "account") return inTotalsScope(a, scope, leaveOut);
    if (!inTotalsScope(a, "all", scope === "all" ? leaveOut : null)) return false;
    return inScope(t.is_joint === null ? a : { is_joint: t.is_joint, owner_member_id: t.owner_member_id }, scope);
  };
}

/** Archived accounts, deleted ones included (a deleted account is archived
 * too). Their balance is in no total -- the account is put away or closed --
 * but the money that moved through them really moved: their entries still
 * count in the months they happened, so every monthly figure (money in and
 * out, spending, the recap) reads the ledger across these as well as the
 * live accounts. */
export async function getArchivedAccountsForFlow(familyId: string) {
  const supabase = await createClient();
  const [{ data }, shared] = await Promise.all([
    supabase.from("accounts").select("id, is_joint, owner_member_id, is_private").eq("family_id", familyId).eq("is_archived", true),
    sharedAccountIds(familyId),
  ]);
  return (data ?? []).map((a) => ({ ...a, shared: shared.has(a.id) }));
}

export async function getAccounts(familyId: string): Promise<AccountWithBalance[]> {
  return loadAccounts(familyId);
}

/** Archived accounts the viewer can see, for the Accounts tab's ARCHIVED
 * list -- where they can be restored or deleted. Kept out of every other
 * list and every balance total; their entries still count in monthly
 * figures (getArchivedAccountsForFlow). */
export async function getArchivedAccounts(familyId: string): Promise<AccountWithBalance[]> {
  return loadAccounts(familyId, true);
}

/** Everything the Joint and Mine panes render: the combined balance across
 * that scope's accounts, this month's flow against its budget, where the
 * money actually went, and six months of history behind it. */
export async function getWealthPane(familyId: string, memberId: string, scope: WealthScope, by: FlowBy = "entry") {
  // Whose target to measure against when one person is named — their own.
  const targetMemberId = isHouseholdScope(scope) ? memberId : scope;
  const supabase = await createClient();
  const { month, year } = currentPeriod();
  const months = recentMonths(6);
  const historyStart = new Date(year, month - 6, 1);

  const [allAccounts, archivedAccounts, { data: period }, { data: target }, { data: transactions }] = await Promise.all([
    loadAccounts(familyId),
    getArchivedAccountsForFlow(familyId),
    supabase
      .from("budget_periods")
      .select("*, budget_allocations(*)")
      .eq("family_id", familyId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle(),
    supabase
      .from("wealth_targets")
      .select("*")
      .eq("member_id", targetMemberId)
      .eq("period_month", month)
      .eq("period_year", year)
      .maybeSingle(),
    supabase
      .from("wealth_transactions")
      .select("*, accounts(name, owner_member_id, is_joint, is_archived, deleted_at), members:recorded_by(full_name)")
      .eq("family_id", familyId)
      .gte("occurred_at", historyStart.toISOString())
      .order("occurred_at", { ascending: false }),
  ]);

  const leaveOut = await privateLeftOutOfAll();
  const accounts = allAccounts.filter((a) => inTotalsScope(a, scope, leaveOut));
  const scoped = (transactions ?? []).filter(flowFilter([...allAccounts, ...archivedAccounts], scope, leaveOut, by));
  const thisMonth = scoped.filter((t) => t.status === "confirmed" && monthKey(t.occurred_at) === monthKey(new Date()));

  const spentByCategory = new Map<string, number>();
  for (const t of thisMonth) {
    if (t.direction !== "out") continue;
    const key = t.category ?? "Other";
    spentByCategory.set(key, (spentByCategory.get(key) ?? 0) + Number(t.amount));
  }

  const history = months.map((m) => {
    const rows = scoped.filter((t) => t.status === "confirmed" && monthKey(t.occurred_at) === m.key);
    return {
      ...m,
      income: rows.filter((t) => t.direction === "in").reduce((sum, t) => sum + Number(t.amount), 0),
      expense: rows.filter((t) => t.direction === "out").reduce((sum, t) => sum + Number(t.amount), 0),
    };
  });

  const allocations = (period?.budget_allocations ?? []).map((a) => ({
    id: a.id,
    category: a.category,
    amount: Number(a.amount),
    spent: spentByCategory.get(a.category) ?? 0,
  }));
  const unbudgeted = [...spentByCategory.entries()]
    .filter(([category]) => !allocations.some((a) => a.category === category))
    .map(([category, spent]) => ({ id: `unbudgeted-${category}`, category, amount: 0, spent }))
    .sort((a, b) => b.spent - a.spent);

  return {
    scope,
    month,
    year,
    accounts,
    total: accounts.reduce((sum, a) => sum + a.balance, 0),
    monthIncome: thisMonth.filter((t) => t.direction === "in").reduce((sum, t) => sum + Number(t.amount), 0),
    monthExpense: thisMonth.filter((t) => t.direction === "out").reduce((sum, t) => sum + Number(t.amount), 0),
    // All is measured against the household's budget; one person against
    // the target they set for themselves.
    budgetAmount: isHouseholdScope(scope) ? Number(period?.budget_amount ?? 0) : Number(target?.target_amount ?? 0),
    allocations,
    unbudgeted,
    history,
    pending: scoped.filter((t) => t.status === "pending").map(toLedgerEntry),
    recent: scoped.filter((t) => t.status === "confirmed").slice(0, 8).map(toLedgerEntry),
  };
}

type RawLedgerRow = Tables<"wealth_transactions"> & {
  accounts: { name: string; owner_member_id: string | null; is_joint: boolean; is_archived: boolean; deleted_at: string | null } | null;
  members: { full_name: string } | null;
};

function toLedgerEntry(row: unknown): LedgerEntry {
  const t = row as RawLedgerRow;
  return { ...t, accountName: t.accounts ? (t.accounts.deleted_at ? `${t.accounts.name} (deleted)` : t.accounts.is_archived ? `${t.accounts.name} (archived)` : t.accounts.name) : "", accountOwnerId: t.accounts?.owner_member_id ?? null, accountIsJoint: !!t.accounts?.is_joint, recordedByName: t.members?.full_name ?? null };
}

export async function getAccountDetail(familyId: string, accountId: string) {
  const supabase = await createClient();
  const [accounts, { data: transactions }] = await Promise.all([
    loadAccounts(familyId),
    supabase
      .from("wealth_transactions")
      .select("*, accounts(name, owner_member_id, is_joint, is_archived, deleted_at), members:recorded_by(full_name)")
      .eq("account_id", accountId)
      .eq("family_id", familyId)
      .order("occurred_at", { ascending: false })
      .limit(200),
  ]);

  // An archived account still has a page -- its history is what archiving
  // kept -- so look there before calling it gone.
  const account = accounts.find((a) => a.id === accountId) ?? (await loadAccounts(familyId, true)).find((a) => a.id === accountId) ?? null;
  return { account, entries: (transactions ?? []).map(toLedgerEntry) };
}

/** One account's money in and out per period, over the same window the
 * Accounts tab's graph covers -- what its own cash trend is drawn from.
 * Queried by date rather than read off getAccountDetail's entries, which
 * stop at the latest 200. */
export async function getAccountHistory(familyId: string, accountId: string, range: CashFlowRange) {
  const supabase = await createClient();
  const periods = recentPeriods(range, cashFlowRangeCount(range));
  const { data } = await supabase
    .from("wealth_transactions")
    .select("occurred_at, direction, amount, status")
    .eq("family_id", familyId)
    .eq("account_id", accountId)
    .eq("status", "confirmed")
    .gte("occurred_at", periods[0].start.toISOString());
  return periodHistory(data ?? [], range, periods);
}

/** Account numbers the viewer may see, by account id. Which ones those are
 * is account_numbers' row-level security (owner; grown-ups for a joint or
 * shared account), so nothing here filters. Read only where a number is
 * shown -- never with the account lists. */
export async function getAccountNumbers(familyId: string, accountIds?: string[]): Promise<Map<string, string>> {
  const supabase = await createClient();
  let query = supabase.from("account_numbers").select("account_id, number").eq("family_id", familyId);
  if (accountIds) query = query.in("account_id", accountIds);
  const { data } = await query;
  return new Map((data ?? []).map((r) => [r.account_id, r.number]));
}

export async function getBills(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bills")
    .select("*, paid_from:paid_from_account_id(name)")
    .eq("family_id", familyId)
    .order("due_date", { nullsFirst: false });
  return (data ?? []).map((b) => ({
    ...b,
    paidFromName: (b.paid_from as unknown as { name: string } | null)?.name ?? null,
  }));
}

/** Paid repeating bills with no next one yet, for "Add the next one?" on
 * Cash Flow and Today (lib/bill-roll.ts). A bill paid from an account the
 * viewer cannot see is left out, as on Cash Flow. */
export async function getNextBillOffers(familyId: string): Promise<NextBillOffer[]> {
  const supabase = await createClient();
  const [bills, { data: seen }, tz] = await Promise.all([getBills(familyId), supabase.from("accounts").select("id").eq("family_id", familyId), householdZone()]);
  const canSee = new Set((seen ?? []).map((a) => a.id));
  const offers = catchUpOffers(bills, familyDay(new Date(), tz));
  const hidden = new Set(bills.filter((b) => b.paid_from_account_id && !canSee.has(b.paid_from_account_id)).map((b) => b.id));
  return offers.filter((o) => !hidden.has(o.billId));
}

export async function getGoals(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("goals")
    .select("*, owner:owner_member_id(full_name)")
    .eq("family_id", familyId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Assets less liabilities — the number the whole A&L tab exists to move.
 *
 * Cash accounts and goals both count toward it, not just the standalone
 * `assets` table. A goal's current_amount is money that has already left a
 * cash account (contributeToGoalAction records it as a direction="out"
 * ledger entry) -- so before this counted goals, that money simply vanished
 * from net worth the moment it was earmarked, which is wrong: it is still
 * the household's, just set aside rather than spent. Adding it back does not
 * double-count, because cashTotal only sums the accounts the viewer can see,
 * already reduced by whatever left them, while goalTotal is money that may
 * have left a private account they cannot see the balance of at all.
 *
 * `scope` narrows all four collections the same way the Accounts tab's Who
 * picker narrows accounts -- "all" is everything visible, naming a member
 * is that member's own things only, joint included under "all" alone. So a
 * joint asset or a joint goal shows only under Everyone, matching how a
 * joint account already works. */
export async function getNetWorth(familyId: string, scope: WealthScope = "all", today: string = new Date().toISOString().slice(0, 10)) {
  const supabase = await createClient();
  const [{ data: rawAssets }, { data: assetItems }, { data: liabilities }, { data: goals }, accounts] = await Promise.all([
    supabase.from("assets").select("*, owner:owner_member_id(full_name)").eq("family_id", familyId),
    supabase.from("asset_items").select("*").eq("family_id", familyId).order("acquired_on", { ascending: false, nullsFirst: false }),
    supabase.from("liabilities").select("*, owner:owner_member_id(full_name)").eq("family_id", familyId).order("balance", { ascending: false }),
    supabase.from("goals").select("*, owner:owner_member_id(full_name)").eq("family_id", familyId).order("created_at", { ascending: false }),
    loadAccounts(familyId),
  ]);

  // An asset is worth the place itself plus everything in it, each aged to
  // today (assetWorth); that total is what counts, and what it sorts by.
  const assets = (rawAssets ?? [])
    .map((a) => {
      const items = (assetItems ?? [])
        .filter((i) => i.asset_id === a.id)
        .map((i) => ({ ...i, worth: itemWorth(i, today, a.annual_change_pct) }));
      return { ...a, items, worth: assetWorth(a, items, today) };
    })
    .sort((x, y) => y.worth.total - x.worth.total);
  const scopedAssets = assets.filter((a) => inScope(a, scope));
  const scopedLiabilities = (liabilities ?? []).filter((l) => inScope(l, scope));
  const scopedGoals = (goals ?? []).filter((g) => inScope(g, scope));
  const leaveOut = await privateLeftOutOfAll();
  const cashAccounts = accounts.filter((a) => inTotalsScope(a, scope, leaveOut));

  const assetTotal = scopedAssets.reduce((sum, a) => sum + a.worth.total, 0);
  const liabilityTotal = scopedLiabilities.reduce((sum, l) => sum + Number(l.balance), 0);
  const goalTotal = scopedGoals.reduce((sum, g) => sum + Number(g.current_amount), 0);
  const cashTotal = cashAccounts.reduce((sum, a) => sum + a.balance, 0);

  return {
    scope,
    assets: scopedAssets,
    liabilities: scopedLiabilities,
    goals: scopedGoals,
    cashAccounts,
    assetTotal,
    liabilityTotal,
    goalTotal,
    cashTotal,
    netWorth: cashTotal + assetTotal + goalTotal - liabilityTotal,
  };
}

export async function getIncomeSchedules(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("income_schedules")
    .select("*, account:account_id(name)")
    .eq("family_id", familyId)
    .order("next_date", { nullsFirst: false });
  return (data ?? []).map((s) => ({
    ...s,
    accountName: (s.account as unknown as { name: string } | null)?.name ?? null,
  }));
}

/** The household's regular incomes (income_groups). Grown-ups only by RLS:
 * anyone else gets none. */
export async function getIncomeGroups(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("income_groups").select("*").eq("family_id", familyId).order("created_at");
  return data ?? [];
}

/** Everything the Cash Flow tab renders: net money in vs. out for the
 * selected period, a history strip at whatever granularity (week/month/year)
 * the household switched to, expected and recently-received income, and
 * bills alongside recent ad-hoc spend.
 *
 * `scope` narrows the ledger side of this exactly like the Accounts tab's
 * Who picker narrows accounts -- naming a member shows the flow through
 * their own accounts only. Bills and income schedules stay unscoped: they
 * are the household's shared plans, not tied to one person's account, the
 * same way a bill has never had an owner.
 *
 * Except where one points at an account the viewer cannot see -- an income
 * that lands in, or a bill paid from, someone's private account. That row
 * is left out for everyone but whoever can see the account (accounts RLS,
 * read as the viewer), as on Subscriptions: a private account is its
 * owner's alone (e2e/private-accounts.spec.ts). */
export async function getCashFlowPane(familyId: string, range: CashFlowRange, scope: WealthScope = "all", by: FlowBy = "entry") {
  const supabase = await createClient();
  const count = cashFlowRangeCount(range);
  const periods = recentPeriods(range, count);
  const historyStart = periods[0].start;

  const [allAccounts, archivedAccounts, { data: transactions }, bills, incomeSchedules, incomeGroups] = await Promise.all([
    loadAccounts(familyId),
    getArchivedAccountsForFlow(familyId),
    supabase
      .from("wealth_transactions")
      .select("*, accounts(name, owner_member_id, is_joint, is_archived, deleted_at), members:recorded_by(full_name)")
      .eq("family_id", familyId)
      .gte("occurred_at", historyStart.toISOString())
      .order("occurred_at", { ascending: false }),
    getBills(familyId),
    getIncomeSchedules(familyId),
    getIncomeGroups(familyId),
  ]);
  // Archived accounts too: a bill paid from one is still the viewer's to see.
  const { data: seen } = await supabase.from("accounts").select("id").eq("family_id", familyId);
  const canSee = new Set((seen ?? []).map((a) => a.id));
  const visibleBills = bills.filter((b) => !b.paid_from_account_id || canSee.has(b.paid_from_account_id));
  const visibleIncome = incomeSchedules.filter((s) => !s.account_id || canSee.has(s.account_id));

  const leaveOut = await privateLeftOutOfAll();
  const rows = (transactions ?? []).map(toLedgerEntry).filter(flowFilter([...allAccounts, ...archivedAccounts], scope, leaveOut, by));
  const confirmed = rows.filter((t) => t.status === "confirmed");
  const thisPeriodKey = periodKey(new Date(), range);
  const thisPeriod = confirmed.filter((t) => periodKey(t.occurred_at, range) === thisPeriodKey);

  const history = periodHistory(confirmed, range, periods);

  // Money in this period by source -- the same groups INCOME lists its
  // rows under, so a slice and its group always agree (Janine, 22
  // October). A regular income's payments count under its source.
  // Transfers between the household's own accounts are not income.
  const slices = new Map<string, { category: string; earned: number }>();
  for (const t of thisPeriod) {
    if (t.direction !== "in" || t.category === TRANSFER_CATEGORY) continue;
    const key = t.category ?? "Other";
    const slice = slices.get(key) ?? { category: key, earned: 0 };
    slice.earned += Number(t.amount);
    slices.set(key, slice);
  }
  const thisMonthKey = periodKey(new Date(), "month");
  const receivedAmount = new Map(confirmed.map((t) => [t.id, Number(t.amount)]));

  const periodIncome = thisPeriod.filter((t) => t.direction === "in").reduce((sum, t) => sum + Number(t.amount), 0);
  const periodExpense = thisPeriod.filter((t) => t.direction === "out").reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    range,
    periodIncome,
    periodExpense,
    net: periodIncome - periodExpense,
    history,
    expectedIncome: visibleIncome.filter((s) => s.status !== "received"),
    receivedIncome: visibleIncome.filter((s) => s.status === "received").slice(0, 12),
    recentIncome: confirmed.filter((t) => t.direction === "in" && t.source_table !== "income_schedules").slice(0, 8),
    incomeByCategory: [...slices.values()],
    // Each regular income with what it brought in this calendar month.
    incomeGroups: incomeGroups.map((g) => ({
      ...g,
      thisMonth: visibleIncome
        .filter((s) => s.group_id === g.id && s.status === "received" && s.received_at && periodKey(s.received_at, "month") === thisMonthKey)
        // What actually arrived, where the ledger row is in hand; the
        // amount expected otherwise.
        .reduce((sum, s) => sum + (receivedAmount.get(s.transaction_id ?? "") ?? Number(s.amount)), 0),
      next: visibleIncome.find((s) => s.group_id === g.id && s.status !== "received") ?? null,
    })),
    openBills: visibleBills.filter((b) => b.status !== "paid"),
    settledBills: visibleBills.filter((b) => b.status === "paid").slice(0, 12),
    recentExpense: confirmed.filter((t) => t.direction === "out" && t.source_table !== "bills").slice(0, 8),
    // What this period's money was actually tied to -- an asset, a goal, a
    // bill -- rather than only how much of it there was.
    sources: await summariseSources(familyId, thisPeriod),
  };
}

/** Where a period's money actually came from and went to.
 *
 * wealth_transactions has carried source_table and source_id since the hubs
 * started posting into the ledger, and nothing ever read it back -- so the
 * cashflow pane could tell a household how much went out but not that half
 * of it was the car, or a goal they are saving into. This is that column
 * finally being asked a question.
 *
 * Assets were missing from the union entirely, so an expense against a
 * vehicle or a property had nowhere to say so and was recorded as an
 * ordinary payment. They are a source now, which is the other half of
 * "consider if expenses or income is from an asset". */
export type CashFlowSource = {
  kind: "assets" | "goals" | "bills" | "routines" | "income_schedules" | "accounts" | "direct";
  label: string;
  name: string;
  income: number;
  expense: number;
};

const SOURCE_LABEL: Record<string, string> = {
  assets: "Asset",
  goals: "Goal",
  bills: "Bill",
  routines: "Routine",
  income_schedules: "Income",
  events: "Event",
  buy_items: "Shopping",
  health_appointments: "Health",
};

/** Names for the rows, fetched in one round trip per table rather than one
 * per transaction. A period with forty payments against the same three
 * things should not be forty selects. */
async function nameSources(
  familyId: string,
  wanted: Map<string, Set<string>>,
): Promise<Map<string, string>> {
  const supabase = await createClient();
  const names = new Map<string, string>();
  // Each of these tables names its row differently, which is why this is a
  // list rather than a loop over a single column.
  // Each of these names its row in its own column, and they genuinely
  // differ -- goals and routines and events say "title", assets and bills
  // and income schedules say "name". Checked against the generated types
  // rather than assumed; an earlier version guessed "name" for goals and
  // "source" for income schedules and both were wrong.
  const columns: Record<string, string> = {
    assets: "name",
    goals: "title",
    bills: "name",
    routines: "title",
    income_schedules: "name",
    events: "title",
  };

  await Promise.all(
    [...wanted.entries()].map(async ([table, ids]) => {
      const column = columns[table];
      if (!column || ids.size === 0) return;
      const { data } = await supabase
        .from(table as "assets")
        .select(`id, ${column}`)
        .eq("family_id", familyId)
        .in("id", [...ids]);
      for (const row of (data ?? []) as unknown as Record<string, string>[]) {
        names.set(`${table}:${row.id}`, row[column] ?? "Untitled");
      }
    }),
  );
  return names;
}

export async function summariseSources(familyId: string, rows: LedgerEntry[]): Promise<CashFlowSource[]> {
  const wanted = new Map<string, Set<string>>();
  for (const t of rows) {
    if (!t.source_table || !t.source_id) continue;
    if (!wanted.has(t.source_table)) wanted.set(t.source_table, new Set());
    wanted.get(t.source_table)!.add(t.source_id);
  }
  const names = await nameSources(familyId, wanted);

  const buckets = new Map<string, CashFlowSource>();
  for (const t of rows) {
    // A transaction with no source is money somebody entered by hand. That
    // is a real category, not a gap, and lumping it in with the rest would
    // make the breakdown add up to less than the total.
    const key = t.source_table && t.source_id ? `${t.source_table}:${t.source_id}` : "direct";
    const existing =
      buckets.get(key) ??
      {
        kind: (t.source_table ?? "direct") as CashFlowSource["kind"],
        label: t.source_table ? (SOURCE_LABEL[t.source_table] ?? "Other") : "Entered directly",
        name: t.source_table && t.source_id ? (names.get(key) ?? "No longer here") : "Entered directly",
        income: 0,
        expense: 0,
      };
    if (t.direction === "in") existing.income += Number(t.amount);
    else existing.expense += Number(t.amount);
    buckets.set(key, existing);
  }

  return [...buckets.values()]
    .filter((b) => b.income > 0 || b.expense > 0)
    .sort((a, b) => b.income + b.expense - (a.income + a.expense));
}

/** Just enough of the assets and goals to fill a picker. The full loaders
 * bring owners and balances that a dropdown has no use for. */
export async function getAttributableTargets(familyId: string): Promise<{ assets: { id: string; name: string }[]; goals: { id: string; name: string }[] }> {
  const supabase = await createClient();
  const [{ data: assets }, { data: goals }] = await Promise.all([
    supabase.from("assets").select("id, name").eq("family_id", familyId).order("name"),
    supabase.from("goals").select("id, title").eq("family_id", familyId).order("title"),
  ]);
  // A goal's name lives in `title`. The picker wants one shape, so the
  // difference is flattened here rather than in the component.
  return { assets: assets ?? [], goals: (goals ?? []).map((g) => ({ id: g.id, name: g.title })) };
}

export type RemittanceWithAllocations = Tables<"remittances"> & { allocations: Tables<"remittance_allocations">[] };

/** Every remittance this grown-up may see, newest first, with what each one
 * went to. Row-level security decides "may see": a child gets none, and a
 * "Just me" row reaches only whoever recorded it. `since` (YYYY-MM-DD) bounds
 * the list for pages that only want recent months. */
export async function getRemittances(familyId: string, since?: string): Promise<RemittanceWithAllocations[]> {
  const supabase = await createClient();
  let query = supabase.from("remittances").select("*").eq("family_id", familyId).order("sent_on", { ascending: false }).order("created_at", { ascending: false });
  if (since) query = query.gte("sent_on", since);
  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];
  const { data: allocations } = await supabase
    .from("remittance_allocations")
    .select("*")
    .in("remittance_id", rows.map((r) => r.id))
    .order("created_at");
  const byRemittance = new Map<string, Tables<"remittance_allocations">[]>();
  for (const a of allocations ?? []) byRemittance.set(a.remittance_id, [...(byRemittance.get(a.remittance_id) ?? []), a]);
  return rows.map((r) => ({ ...r, allocations: byRemittance.get(r.id) ?? [] }));
}

/* ------------------------------------------------------------ chart data */

/** Each person's spending budget for one month, as a grown-up set it
 * (member_budgets). The whole household may read these, so this is the same
 * map for every viewer. A person with no budget that month is absent. */
export async function getMemberBudgets(familyId: string, year: number, month: number): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("member_budgets").select("member_id, amount").eq("family_id", familyId).eq("period_year", year).eq("period_month", month);
  return new Map((data ?? []).map((b) => [b.member_id, Number(b.amount)]));
}

export type MemberSpending = {
  /** null is the household's joint (or unassigned) accounts. */
  memberId: string | null;
  spent: number;
  /** Whether the viewer can see any account of theirs at all. False for
   * someone whose accounts are all private, or who has none: the page then
   * says nothing about their spending rather than showing a zero. */
  hasVisibleAccounts: boolean;
  budget: number | null;
};

/** Spending per person this month, against their budget -- the shared helper
 * for Wealth's per-person chart and Today's member card.
 *
 * Spending is money out of the person's own accounts, confirmed, in the month,
 * transfers between accounts left out (moving money is not spending it). Only
 * accounts the viewer can see count: another member's private account never
 * reaches this function, so it never reaches a total either. */
export async function getSpendingByMember(familyId: string, year: number, month: number): Promise<MemberSpending[]> {
  const supabase = await createClient();
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);
  const [accounts, archivedAccounts, budgets, { data: rows }] = await Promise.all([
    loadAccounts(familyId),
    getArchivedAccountsForFlow(familyId),
    getMemberBudgets(familyId, year, month),
    supabase
      .from("wealth_transactions")
      .select("account_id, amount, category, is_joint, owner_member_id")
      .eq("family_id", familyId)
      .eq("direction", "out")
      .eq("status", "confirmed")
      .gte("occurred_at", from.toISOString())
      .lt("occurred_at", to.toISOString()),
  ]);
  const ownerOf = new Map([...accounts, ...archivedAccounts].map((a) => [a.id, a.is_joint ? null : a.owner_member_id]));
  const spent = new Map<string | null, number>();
  for (const r of rows ?? []) {
    if (r.category === TRANSFER_CATEGORY || !ownerOf.has(r.account_id)) continue;
    // Whose the spending is (20261023210000), not whose account paid it.
    const who = r.is_joint === null ? (ownerOf.get(r.account_id) ?? null) : r.is_joint ? null : r.owner_member_id;
    spent.set(who, (spent.get(who) ?? 0) + Number(r.amount));
  }
  const owners = new Set<string | null>(accounts.map((a) => (a.is_joint ? null : a.owner_member_id)));
  for (const id of budgets.keys()) owners.add(id);
  return [...owners].map((memberId) => ({
    memberId,
    spent: spent.get(memberId) ?? 0,
    hasVisibleAccounts: accounts.some((a) => (a.is_joint ? null : a.owner_member_id) === memberId),
    budget: memberId ? (budgets.get(memberId) ?? null) : null,
  }));
}

/** The budget each month in `keys` (YYYY-MM) was measured against: the
 * household's (budget_periods) for All and Family, the person's own
 * (member_budgets) for one person. Months with none are absent. */
export async function getBudgetHistory(familyId: string, scope: WealthScope, keys: string[]): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const supabase = await createClient();
  const years = [...new Set(keys.map((k) => Number(k.slice(0, 4))))];
  const wanted = new Set(keys);
  const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  if (isHouseholdScope(scope)) {
    const { data } = await supabase.from("budget_periods").select("period_year, period_month, budget_amount").eq("family_id", familyId).in("period_year", years);
    return new Map((data ?? []).filter((b) => wanted.has(key(b.period_year, b.period_month)) && Number(b.budget_amount) > 0).map((b) => [key(b.period_year, b.period_month), Number(b.budget_amount)]));
  }
  const { data } = await supabase.from("member_budgets").select("period_year, period_month, amount").eq("family_id", familyId).eq("member_id", scope).in("period_year", years);
  return new Map((data ?? []).filter((b) => wanted.has(key(b.period_year, b.period_month)) && Number(b.amount) > 0).map((b) => [key(b.period_year, b.period_month), Number(b.amount)]));
}

export type NetWorthPoint = { month: string; netWorth: number };

/** How old this month's household-wide ("all") point may get before a visit
 * to Cash Flow or Accounts brings it up to date. */
const NET_WORTH_FRESH_MS = 6 * 60 * 60 * 1000;

/** Keep this month's net-worth point current from any visit to Wealth, not
 * only from A&L. The monthly recap reads the "all" point for each month, and
 * a household that never opened A&L had no change to show (the feature guide,
 * 23 October). One small read per visit; the sums are worked out at most
 * every six hours. Best effort, like the line itself. */
export async function keepNetWorthCurrent(familyId: string, viewerMemberId: string, today: string): Promise<void> {
  const supabase = await createClient();
  const month = `${monthKey(new Date())}-01`;
  const { data: row } = await supabase
    .from("net_worth_snapshots")
    .select("updated_at")
    .eq("viewer_member_id", viewerMemberId)
    .eq("scope", "all")
    .eq("month", month)
    .maybeSingle();
  if (row && Date.now() - new Date(row.updated_at).getTime() < NET_WORTH_FRESH_MS) return;
  const { cashTotal, goalTotal, assetTotal, liabilityTotal, netWorth } = await getNetWorth(familyId, "all", today);
  await supabase.from("net_worth_snapshots").upsert(
    {
      viewer_member_id: viewerMemberId,
      family_id: familyId,
      scope: "all",
      month,
      cash: cashTotal,
      goals: goalTotal,
      assets: assetTotal,
      liabilities: liabilityTotal,
      net_worth: netWorth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "viewer_member_id,scope,month" },
  );
}

/** What this viewer's net worth was, month by month, for one Who choice --
 * and this month's row brought up to date with `current` first. Each row is
 * the viewer's own (row-level security reads and writes nobody else's), so
 * the line only ever shows what that person could see. Best effort: on Kin
 * Free, or with the table not there yet, the write is refused and the line
 * simply has what it had. */
export async function recordAndGetNetWorthHistory(
  familyId: string,
  viewerMemberId: string,
  scope: WealthScope,
  current: { cash: number; goals: number; assets: number; liabilities: number; netWorth: number },
): Promise<NetWorthPoint[]> {
  const supabase = await createClient();
  const scopeKey: string = scope;
  const now = new Date();
  const month = `${monthKey(now)}-01`;
  await supabase.from("net_worth_snapshots").upsert(
    {
      viewer_member_id: viewerMemberId,
      family_id: familyId,
      scope: scopeKey,
      month,
      cash: current.cash,
      goals: current.goals,
      assets: current.assets,
      liabilities: current.liabilities,
      net_worth: current.netWorth,
      updated_at: now.toISOString(),
    },
    { onConflict: "viewer_member_id,scope,month" },
  );
  const { data } = await supabase
    .from("net_worth_snapshots")
    .select("month, net_worth")
    .eq("viewer_member_id", viewerMemberId)
    .eq("scope", scopeKey)
    .order("month", { ascending: false })
    .limit(24);
  return (data ?? []).reverse().map((r) => ({ month: r.month.slice(0, 7), netWorth: Number(r.net_worth) }));
}

/** Who each account is shared with, by account id. Read as the viewer, so it
 * holds the full list for their own accounts and only themselves on anyone
 * else's (account_viewers RLS). */
export async function getAccountViewers(familyId: string): Promise<Map<string, string[]>> {
  const supabase = await createClient();
  const { data } = await supabase.from("account_viewers").select("account_id, member_id").eq("family_id", familyId);
  const byAccount = new Map<string, string[]>();
  for (const row of data ?? []) byAccount.set(row.account_id, [...(byAccount.get(row.account_id) ?? []), row.member_id]);
  return byAccount;
}
