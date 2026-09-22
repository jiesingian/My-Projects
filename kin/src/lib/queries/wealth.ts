import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { monthKey, recentMonths, signedAmount, recentPeriods, periodKey, cashFlowRangeCount, inScope, type CashFlowRange, type WealthScope } from "@/lib/wealth";

// Re-exported so the page keeps importing its scope type from the module it
// already imports the queries from.
export type { WealthScope };

export type AccountWithBalance = Tables<"accounts"> & { balance: number; pendingCount: number };

export type LedgerEntry = Tables<"wealth_transactions"> & { accountName: string; recordedByName: string | null };

function currentPeriod() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
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
      .eq("family_id", familyId)
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
 * have left a private account they cannot see the balance of at all.
 *
 * `scope` narrows all four collections the same way the Accounts tab's Who
 * picker narrows accounts -- "all" is everything visible, naming a member
 * is that member's own things only, joint included under "all" alone. So a
 * joint asset or a joint goal shows only under Everyone, matching how a
 * joint account already works. */
export async function getNetWorth(familyId: string, scope: WealthScope = "all") {
  const supabase = await createClient();
  const [{ data: assets }, { data: liabilities }, { data: goals }, accounts] = await Promise.all([
    supabase.from("assets").select("*, owner:owner_member_id(full_name)").eq("family_id", familyId).order("value", { ascending: false }),
    supabase.from("liabilities").select("*, owner:owner_member_id(full_name)").eq("family_id", familyId).order("balance", { ascending: false }),
    supabase.from("goals").select("*, owner:owner_member_id(full_name)").eq("family_id", familyId).order("created_at", { ascending: false }),
    loadAccounts(familyId),
  ]);

  const scopedAssets = (assets ?? []).filter((a) => inScope(a, scope));
  const scopedLiabilities = (liabilities ?? []).filter((l) => inScope(l, scope));
  const scopedGoals = (goals ?? []).filter((g) => inScope(g, scope));
  const cashAccounts = accounts.filter((a) => inScope(a, scope));

  const assetTotal = scopedAssets.reduce((sum, a) => sum + Number(a.value), 0);
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

/** Everything the Cash Flow tab renders: net money in vs. out for the
 * selected period, a history strip at whatever granularity (week/month/year)
 * the household switched to, expected and recently-received income, and
 * bills alongside recent ad-hoc spend.
 *
 * `scope` narrows the ledger side of this exactly like the Accounts tab's
 * Who picker narrows accounts -- naming a member shows the flow through
 * their own accounts only. Bills and income schedules stay unscoped: they
 * are the household's shared plans, not tied to one person's account, the
 * same way a bill has never had an owner. */
export async function getCashFlowPane(familyId: string, range: CashFlowRange, scope: WealthScope = "all") {
  const supabase = await createClient();
  const count = cashFlowRangeCount(range);
  const periods = recentPeriods(range, count);
  const historyStart = periods[0].start;

  const [allAccounts, { data: transactions }, bills, incomeSchedules] = await Promise.all([
    loadAccounts(familyId),
    supabase
      .from("wealth_transactions")
      .select("*, accounts(name), members:recorded_by(full_name)")
      .eq("family_id", familyId)
      .gte("occurred_at", historyStart.toISOString())
      .order("occurred_at", { ascending: false }),
    getBills(familyId),
    getIncomeSchedules(familyId),
  ]);

  const accountIds = new Set(allAccounts.filter((a) => inScope(a, scope)).map((a) => a.id));
  const rows = (transactions ?? []).map(toLedgerEntry).filter((t) => accountIds.has(t.account_id));
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
