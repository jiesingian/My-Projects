import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { monthKey, recentMonths, signedAmount, recentPeriods, periodKey, cashFlowRangeCount, type CashFlowRange } from "@/lib/wealth";

/** Which slice of the household's money is on screen: everything the
 * viewer is allowed to see, or one person's own accounts. */
export type WealthScope = "all" | (string & {});

export type AccountWithBalance = Tables<"accounts"> & { balance: number; pendingCount: number };

export type LedgerEntry = Tables<"wealth_transactions"> & { accountName: string; recordedByName: string | null };

function currentPeriod() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/** "all" is everything already in reach — the household's joint accounts,
 * your own, and whatever anyone else has opened to the family. Naming a
 * person narrows it to the accounts in their name; a joint account is the
 * household's, not theirs, so it stays under All. Privacy is not decided
 * here: the database has already withheld what is not yours to see. */
function inScope(account: Pick<Tables<"accounts">, "is_joint" | "owner_member_id">, scope: WealthScope) {
  return scope === "all" ? true : !account.is_joint && account.owner_member_id === scope;
}

/** Balances are never stored — an account is its opening balance plus every
 * confirmed movement since, so a bill paid in Household and a transfer made
 * here can never disagree. */
async function loadAccounts(familyId: string): Promise<AccountWithBalance[]> {
  const supabase = await createClient();
  const [{ data: accounts }, { data: movements }] = await Promise.all([
    supabase.from("accounts").select("*").eq("family_id", familyId).eq("is_archived", false).order("created_at"),
    supabase.from("wealth_transactions").select("account_id, direction, amount, status").eq("family_id", familyId),
  ]);

  const delta = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const m of movements ?? []) {
    delta.set(m.account_id, (delta.get(m.account_id) ?? 0) + signedAmount(m));
    if (m.status === "pending") pending.set(m.account_id, (pending.get(m.account_id) ?? 0) + 1);
  }

  return (accounts ?? []).map((a) => ({
    ...a,
    balance: Number(a.opening_balance) + (delta.get(a.id) ?? 0),
    pendingCount: pending.get(a.id) ?? 0,
  }));
}

export async function getAccounts(familyId: string): Promise<AccountWithBalance[]> {
  return loadAccounts(familyId);
}

/** Everything the Joint and Mine panes render: the combined balance across
 * that scope's accounts, this month's flow against its budget, where the
 * money actually went, and six months of history behind it. */
export async function getWealthPane(familyId: string, memberId: string, scope: WealthScope) {
  // Whose target to measure against when one person is named — their own.
  const targetMemberId = scope === "all" ? memberId : scope;
  const supabase = await createClient();
  const { month, year } = currentPeriod();
  const months = recentMonths(6);
  const historyStart = new Date(year, month - 6, 1);

  const [allAccounts, { data: period }, { data: target }, { data: transactions }] = await Promise.all([
    loadAccounts(familyId),
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
      .select("*, accounts(name), members:recorded_by(full_name)")
      .eq("family_id", familyId)
      .gte("occurred_at", historyStart.toISOString())
      .order("occurred_at", { ascending: false }),
  ]);

  const accounts = allAccounts.filter((a) => inScope(a, scope));
  const accountIds = new Set(accounts.map((a) => a.id));
  const scoped = (transactions ?? []).filter((t) => accountIds.has(t.account_id));
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
    budgetAmount: scope === "all" ? Number(period?.budget_amount ?? 0) : Number(target?.target_amount ?? 0),
    budgetPeriodId: period?.id ?? null,
    allocations,
    unbudgeted,
    history,
    pending: scoped.filter((t) => t.status === "pending").map(toLedgerEntry),
    recent: scoped.filter((t) => t.status === "confirmed").slice(0, 8).map(toLedgerEntry),
  };
}

type RawLedgerRow = Tables<"wealth_transactions"> & {
  accounts: { name: string } | null;
  members: { full_name: string } | null;
};

function toLedgerEntry(row: unknown): LedgerEntry {
  const t = row as RawLedgerRow;
  return { ...t, accountName: t.accounts?.name ?? "", recordedByName: t.members?.full_name ?? null };
}

export async function getAccountDetail(familyId: string, accountId: string) {
  const supabase = await createClient();
  const [accounts, { data: transactions }] = await Promise.all([
    loadAccounts(familyId),
    supabase
      .from("wealth_transactions")
      .select("*, accounts(name), members:recorded_by(full_name)")
      .eq("account_id", accountId)
      .order("occurred_at", { ascending: false })
      .limit(200),
  ]);

  const account = accounts.find((a) => a.id === accountId) ?? null;
  return { account, entries: (transactions ?? []).map(toLedgerEntry) };
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
 * have left a private account they cannot see the balance of at all. */
export async function getNetWorth(familyId: string, memberId: string) {
  const supabase = await createClient();
  const [{ data: assets }, { data: liabilities }, { data: goals }, accounts] = await Promise.all([
    supabase.from("assets").select("*, owner:owner_member_id(full_name)").eq("family_id", familyId).order("value", { ascending: false }),
    supabase.from("liabilities").select("*, owner:owner_member_id(full_name)").eq("family_id", familyId).order("balance", { ascending: false }),
    supabase.from("goals").select("*, owner:owner_member_id(full_name)").eq("family_id", familyId).order("created_at", { ascending: false }),
    loadAccounts(familyId),
  ]);

  const assetTotal = (assets ?? []).reduce((sum, a) => sum + Number(a.value), 0);
  const liabilityTotal = (liabilities ?? []).reduce((sum, l) => sum + Number(l.balance), 0);
  const goalTotal = (goals ?? []).reduce((sum, g) => sum + Number(g.current_amount), 0);
  const cashAccounts = accounts.filter((a) => a.is_joint || a.owner_member_id === memberId);
  const cashTotal = cashAccounts.reduce((sum, a) => sum + a.balance, 0);

  return {
    assets: assets ?? [],
    liabilities: liabilities ?? [],
    goals: goals ?? [],
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

/** Everything the Cash Flow tab renders: net money in vs. out for the
 * selected period, a history strip at whatever granularity (week/month/year)
 * the household switched to, expected and recently-received income, and
 * bills alongside recent ad-hoc spend. Family-wide rather than scoped to one
 * person — RLS already withholds whatever the viewer isn't allowed to see,
 * the same way the "Everyone" view of Accounts works today. */
export async function getCashFlowPane(familyId: string, range: CashFlowRange) {
  const supabase = await createClient();
  const count = cashFlowRangeCount(range);
  const periods = recentPeriods(range, count);
  const historyStart = periods[0].start;

  const [{ data: transactions }, bills, incomeSchedules] = await Promise.all([
    supabase
      .from("wealth_transactions")
      .select("*, accounts(name), members:recorded_by(full_name)")
      .eq("family_id", familyId)
      .gte("occurred_at", historyStart.toISOString())
      .order("occurred_at", { ascending: false }),
    getBills(familyId),
    getIncomeSchedules(familyId),
  ]);

  const rows = (transactions ?? []).map(toLedgerEntry);
  const confirmed = rows.filter((t) => t.status === "confirmed");
  const thisPeriodKey = periodKey(new Date(), range);
  const thisPeriod = confirmed.filter((t) => periodKey(t.occurred_at, range) === thisPeriodKey);

  const history = periods.map((p) => {
    const inPeriod = confirmed.filter((t) => periodKey(t.occurred_at, range) === p.key);
    return {
      key: p.key,
      label: p.label,
      income: inPeriod.filter((t) => t.direction === "in").reduce((sum, t) => sum + Number(t.amount), 0),
      expense: inPeriod.filter((t) => t.direction === "out").reduce((sum, t) => sum + Number(t.amount), 0),
    };
  });

  const periodIncome = thisPeriod.filter((t) => t.direction === "in").reduce((sum, t) => sum + Number(t.amount), 0);
  const periodExpense = thisPeriod.filter((t) => t.direction === "out").reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    range,
    periodIncome,
    periodExpense,
    net: periodIncome - periodExpense,
    history,
    expectedIncome: incomeSchedules.filter((s) => s.status !== "received"),
    receivedIncome: incomeSchedules.filter((s) => s.status === "received").slice(0, 12),
    recentIncome: confirmed.filter((t) => t.direction === "in" && t.source_table !== "income_schedules").slice(0, 8),
    openBills: bills.filter((b) => b.status !== "paid"),
    settledBills: bills.filter((b) => b.status === "paid").slice(0, 12),
    recentExpense: confirmed.filter((t) => t.direction === "out" && t.source_table !== "bills").slice(0, 8),
  };
}
