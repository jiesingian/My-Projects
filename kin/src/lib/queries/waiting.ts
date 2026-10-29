import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { familyDate } from "@/lib/format-family";
import { householdZone } from "@/lib/household-zone";
import { getAccounts, getAssetCosts, getGoalDepositsSince, getPendingEntries, type LedgerEntry } from "@/lib/queries/wealth";
import { getMembers } from "@/lib/queries/family";
import { isGrownUp } from "@/lib/roles";
import { isGone } from "@/lib/member-status";
import { formatCurrency, shortNames } from "@/lib/format";
import { familyDay, familyMidnight } from "@/lib/time";
import { actorsFor, depositProgress, insuranceGap, loanFlags, loanInsurance, loanInsuranceFund, loanOriginStatus, loanStatus, paymentsLeftForBalance, pendingRows, runningCosts, type PendingRow } from "@/lib/wealth";

/** "Waiting on you", built once for every page that shows it (Jonathan, 29
 * October): Accounts, Cash Flow, A&L and Planner's Goals. Each item says
 * which of them it belongs on -- a pending payment into a goal is on
 * Accounts, A&L and Goals alike -- and opens the same sheet wherever it is
 * tapped, holding only what applies to it. Only the person who has to act
 * sees it (actorsFor). */

export type WaitingTab = "accounts" | "cashflow" | "assets" | "goals";

export type WaitingAction =
  | { kind: "pending"; row: PendingRow; appUrl: string | null }
  | { kind: "bill"; billId: string; amount: number; accountId: string | null; due: "today" | "overdue"; loanId: string | null }
  | { kind: "income"; scheduleId: string; amount: number; accountId: string | null }
  | { kind: "goal"; goalId: string; linkedAccountId: string | null; fromAccountId: string | null; fromAccount2Id: string | null; fromAmount: number | null; from2Amount: number | null }
  | { kind: "reprice"; loanId: string; balance: number; paymentsLeft: number; rate: number | null; payment: number | null }
  | { kind: "running-cost"; assetId: string; assetName: string; assetKind: string; whose: string }
  | { kind: "set-balance"; loanId: string; value: number; paymentsLeft: number | null }
  | { kind: "link"; href: string; label: string }
  | { kind: "asset-picker"; loanId: string; assets: { id: string; name: string }[] }
  | { kind: "edit-goal"; goal: { id: string; title: string; note: string | null; target: number; date: string | null; yearly: boolean } }
  | { kind: "fund-paid"; goalId: string; title: string; saved: number; target: number; linkedAccountId: string | null; repeatsYearly: boolean }
  | { kind: "remind"; goalId: string; memberId: string; name: string };

export type WaitingEntry = {
  id: string;
  title: string;
  meta: string;
  amount?: number;
  tabs: WaitingTab[];
  /** A shared goal's deposits this month: who has put in and who has not. */
  people?: { name: string; done: boolean; amount: number | null }[];
  /** Done on the row itself, without opening the sheet, when it is the
   * one simple thing to do (29 October). */
  quick?: WaitingAction;
  /** "Not now" can put it away for 30 days: a flag, not money owed today. */
  snoozable?: boolean;
  /** Said in the sheet under the title: what it is and why it waits. */
  lines: string[];
  /** What can be done about it, right in the sheet (29 October): an item
   * on "Waiting on you" is one an action is owed on. */
  actions: WaitingAction[];
  /** Where the thing itself lives, for "Open in …". */
  open: { href: string; label: string; tab: WaitingTab | null };
};

/** Built once per page view (29 October): the tab counts and the page's
 * own list read the same result. Primitive arguments, so React's cache
 * matches the two calls. */
export const getWaiting = cache(async (memberId: string, familyId: string, grownUp: boolean, currency: string): Promise<WaitingEntry[]> => {
  if (!grownUp) return [];
  const me = { id: memberId, family_id: familyId };
  const [fmtDate, tz] = await Promise.all([familyDate(), householdZone()]);
  const today = familyDay(new Date(), tz);
  const supabase = await createClient();
  const monthStart = (familyMidnight(`${today.slice(0, 7)}-01`, tz) ?? new Date(`${today.slice(0, 7)}-01T00:00:00Z`)).toISOString();
  const [members, accounts, pending, assetCosts, deposits, { data: bills }, { data: income }, { data: liabilities }, { data: assets }, { data: goals }] = await Promise.all([
    getMembers(familyId),
    getAccounts(familyId),
    getPendingEntries(familyId),
    getAssetCosts(familyId, today),
    getGoalDepositsSince(familyId, monthStart),
    supabase.from("bills").select("id, name, amount, due_date, status, account_id, owner_member_id, is_joint, against_table, against_id").eq("family_id", familyId).in("status", ["unpaid", "overdue"]).lte("due_date", today),
    supabase.from("income_schedules").select("id, name, amount, next_date, status, account_id, owner_member_id, is_joint").eq("family_id", familyId).eq("status", "expected").lte("next_date", today),
    supabase.from("liabilities").select("*").eq("family_id", familyId),
    supabase.from("assets").select("id, name, kind, owner_member_id, is_joint").eq("family_id", familyId),
    supabase.from("goals").select("*").eq("family_id", familyId),
  ]);
  const { data: snoozes } = await supabase.from("waiting_snoozes").select("item_key").eq("member_id", me.id).gt("until", today);
  const snoozed = new Set((snoozes ?? []).map((r) => r.item_key));

  const people = members.filter((m) => m.status !== "pending" && !isGone(m.status));
  const short = shortNames(people.map((m) => m.full_name));
  const names = new Map(people.map((m, i) => [m.id, short[i]]));
  const grownUps = people.filter((m) => isGrownUp(m.role)).map((m) => m.id);
  const account = (id: string | null) => (id ? accounts.find((a) => a.id === id) : undefined);
  const mine = (x: { named?: string | null; account_id?: string | null; owner_member_id?: string | null; is_joint?: boolean | null }) =>
    actorsFor({ named: x.named, accountOwner: account(x.account_id ?? null)?.owner_member_id, accountJoint: account(x.account_id ?? null)?.is_joint, owner: x.owner_member_id, joint: x.is_joint }, grownUps).includes(me.id);
  const nameOf = (id: string) => (id === me.id ? "You" : (names.get(id) ?? "Someone"));
  const look = (lineId: string) => ({ href: `/wealth?seg=assets&line=${encodeURIComponent(lineId)}`, label: "Open in A&L", tab: "assets" as const });
  const out: WaitingEntry[] = [];

  // Pending entries: on Accounts always; on Cash Flow when money came in or
  // went out (not a transfer between accounts); on A&L when it is for a
  // goal, a loan or a holding; on Goals when it is for a goal.
  const minePending = pending.filter((e: LedgerEntry) => mine({ named: e.recorded_by, account_id: e.account_id }));
  for (const r of pendingRows(minePending)) {
    const legs = minePending.filter((e) => e.id === r.entryId || (e.transfer_group_id && e.transfer_group_id === r.id));
    const forGoal = legs.some((e) => e.goal_id);
    const forAsset = legs.some((e) => e.source_table === "liabilities" || e.source_table === "assets");
    const tabs: WaitingTab[] = ["accounts"];
    if (r.kind !== "transfer" || forGoal || forAsset) tabs.push("cashflow");
    if (forGoal || forAsset) tabs.push("assets");
    if (forGoal) tabs.push("goals");
    const appId = r.from?.id ?? r.account?.id ?? r.to?.id ?? null;
    out.push({
      id: `pending-${r.id}`,
      title: r.kind === "transfer" ? `${r.from?.name ?? "Another account"} → ${r.to?.name ?? "another account"}` : r.particulars,
      meta: `started ${fmtDate(r.occurredOn)} · not counted yet`,
      amount: r.amount,
      tabs,
      lines: [
        r.kind === "transfer" ? "A transfer between accounts, waiting on whether it went through." : r.kind === "in" ? `Money into ${r.account?.name ?? "an account"}, waiting on whether it arrived.` : `Money out of ${r.account?.name ?? "an account"}, waiting on whether it went through.`,
        ...(legs[0]?.recordedByName ? [`Logged by ${legs[0].recorded_by === me.id ? "you" : legs[0].recordedByName}.`] : []),
      ],
      actions: [{ kind: "pending", row: r, appUrl: (appId && account(appId)?.linked_app_url) || null }],
      quick: { kind: "pending", row: r, appUrl: (appId && account(appId)?.linked_app_url) || null },
      open: { href: `/wealth?seg=accounts`, label: "Open in Accounts", tab: "accounts" },
    });
  }

  // Bills due today or overdue.
  for (const b of bills ?? []) {
    if (!b.due_date || !mine(b)) continue;
    const due = b.due_date.slice(0, 10) < today ? "overdue" : "today";
    const tabs: WaitingTab[] = ["cashflow"];
    if (b.against_table === "liabilities" || b.against_table === "assets") tabs.push("assets");
    if (b.against_table === "goals") tabs.push("assets", "goals");
    out.push({
      id: `bill-${b.id}`,
      title: b.name,
      meta: due === "today" ? "Due today" : `Overdue since ${fmtDate(b.due_date)}`,
      amount: Number(b.amount),
      tabs,
      lines: [account(b.account_id) ? `Paid from ${account(b.account_id)!.name}.` : "Pick the account it comes out of when you pay."],
      actions: [{ kind: "bill", billId: b.id, amount: Number(b.amount), accountId: b.account_id, due, loanId: b.against_table === "liabilities" ? b.against_id : null }],
      quick: { kind: "bill", billId: b.id, amount: Number(b.amount), accountId: b.account_id, due, loanId: b.against_table === "liabilities" ? b.against_id : null },
      open: { href: `/wealth?seg=cashflow&open=expenses&bill=${b.id}`, label: "Open in Cash Flow", tab: "cashflow" },
    });
  }

  // Income whose day has come.
  for (const x of income ?? []) {
    if (!x.next_date || !mine(x)) continue;
    out.push({
      id: `income-${x.id}`,
      title: x.name,
      meta: `Expected ${x.next_date.slice(0, 10) === today ? "today" : `since ${fmtDate(x.next_date)}`}`,
      amount: Number(x.amount),
      tabs: ["cashflow"],
      lines: [account(x.account_id) ? `Into ${account(x.account_id)!.name}.` : "Pick the account it went into when you mark it received."],
      actions: [{ kind: "income", scheduleId: x.id, amount: Number(x.amount), accountId: x.account_id }],
      quick: { kind: "income", scheduleId: x.id, amount: Number(x.amount), accountId: x.account_id },
      open: { href: "/wealth?seg=cashflow", label: "Open in Cash Flow", tab: "cashflow" },
    });
  }

  const costsOf = (assetId: string | null) => (assetId ? runningCosts(assetCosts.billsFor.get(assetId) ?? []) : null);
  const goalRows = goals ?? [];

  // Loans that need a look.
  for (const l of liabilities ?? []) {
    if (!mine(l)) continue;
    const insuranceNeeded = !!loanInsurance(l) && !loanInsurance(l)!.included && !loanInsuranceFund(l.name, goalRows) && !(costsOf(l.asset_id)?.costs.some((c) => /insurance|\bmri\b/i.test(c.name)) ?? false);
    const flags = loanFlags(l, today, fmtDate, insuranceNeeded);
    if (flags.length === 0) continue;
    const origin = loanOriginStatus(l, today);
    const loanActions = (loan: typeof l, paymentsLeft: number, days: number | null, needsInsurance: boolean): WaitingAction[] => {
      const acts: WaitingAction[] = [];
      if (origin && !origin.matches) acts.push({ kind: "set-balance", loanId: loan.id, value: origin.expectedBalance, paymentsLeft: paymentsLeftForBalance(loan, Number(loan.balance)) });
      if (days != null && days <= 31 && Number(loan.balance) > 0 && paymentsLeft > 0)
        acts.push({ kind: "reprice", loanId: loan.id, balance: Number(loan.balance), paymentsLeft, rate: loan.interest_rate == null ? null : Number(loan.interest_rate), payment: loan.monthly_payment == null ? null : Number(loan.monthly_payment) });
      // Not linked to the house or car it bought: linking it is often the
      // whole fix -- the asset's insurance then counts for the loan.
      if (needsInsurance && !loan.asset_id && (assets ?? []).length > 0) acts.push({ kind: "asset-picker", loanId: loan.id, assets: (assets ?? []).map((a) => ({ id: a.id, name: a.name })) });
      if (needsInsurance) {
        const ins = loanInsurance(loan)!;
        const asset = loan.asset_id ? (assets ?? []).find((a) => a.id === loan.asset_id) : undefined;
        if (asset) acts.push({ kind: "running-cost", assetId: asset.id, assetName: asset.name, assetKind: asset.kind, whose: asset.is_joint ? "joint" : (asset.owner_member_id ?? "me") });
        acts.push({ kind: "link", href: `/wealth/add?${new URLSearchParams({ yearly: "1", title: ins.title, note: ins.note, whose: loan.is_joint ? "joint" : "me" })}`, label: "Set aside for it yearly" });
      }
      return acts;
    };
    const fixedDays = l.rate_fixed_until ? Math.round((Date.parse(l.rate_fixed_until.slice(0, 10)) - Date.parse(today)) / 86_400_000) : null;
    const left = loanStatus(l, today).left;
    out.push({
      id: `loan-${l.id}`,
      title: l.name,
      meta: flags.join(" · "),
      tabs: ["assets"],
      lines: [
        ...(origin && !origin.matches ? [`By its terms about ${formatCurrency(origin.expectedBalance, currency)} should be owed now; ${formatCurrency(Number(l.balance), currency)} is on record. Set it to the terms' figure, or keep the balance if an extra payment explains it.`] : []),
        ...(fixedDays != null && fixedDays < 0 ? [`The fixed rate ended ${fmtDate(l.rate_fixed_until!)}: set the rate the bank gave, so the balance check runs from the new terms.`] : fixedDays != null && fixedDays <= 31 ? [`Rate fixed until ${fmtDate(l.rate_fixed_until!)}: ask the bank for the new rate and set it here.`] : []),
        ...(insuranceNeeded ? [loanInsurance(l)!.what] : []),
      ],
      actions: loanActions(l, left, fixedDays, insuranceNeeded),
      snoozable: true,
      open: look(l.id),
    });
  }

  // A car or house with no insurance listed.
  for (const a of assets ?? []) {
    if (!mine(a)) continue;
    const insured = (liabilities ?? []).some((l) => l.asset_id === a.id && Number(l.balance) > 0 && (loanInsurance(l)?.included || !!loanInsuranceFund(l.name, goalRows)));
    const gap = !insured && insuranceGap(a.kind, costsOf(a.id)!.costs.map((c) => c.name));
    if (!gap) continue;
    out.push({
      id: `asset-${a.id}`,
      title: a.name,
      meta: "No insurance listed",
      tabs: ["assets"],
      lines: [gap],
      actions: [
        { kind: "running-cost", assetId: a.id, assetName: a.name, assetKind: a.kind, whose: a.is_joint ? "joint" : (a.owner_member_id ?? "me") },
        // Paid once a year: a fund for it, the same as a loan's insurance.
        { kind: "link", href: `/wealth/add?${new URLSearchParams({ yearly: "1", title: `${a.name} insurance`, whose: a.is_joint ? "joint" : "me" })}`, label: "Set aside for it yearly" },
      ],
      snoozable: true,
      open: look(`asset-${a.id}`),
    });
  }

  // Goals: a shared monthly deposit not everyone has made, or a date near.
  for (const g of goalRows) {
    const goalAction: WaitingAction = { kind: "goal", goalId: g.id, linkedAccountId: g.linked_account_id, fromAccountId: g.from_account_id, fromAccount2Id: g.from_account_2_id, fromAmount: g.from_amount == null ? null : Number(g.from_amount), from2Amount: g.from_2_amount == null ? null : Number(g.from_2_amount) };
    const contributors: { memberId: string; accountId: string | null; amount: number | null }[] = [];
    for (const [accountId, amount] of [[g.from_account_id, g.from_amount], [g.from_account_2_id, g.from_2_amount]] as const) {
      const a = accountId && Number(amount ?? 0) > 0 ? account(accountId) : undefined;
      if (a && !a.is_joint && a.owner_member_id && !contributors.some((c) => c.memberId === a.owner_member_id)) contributors.push({ memberId: a.owner_member_id, accountId: a.id, amount: Number(amount) });
    }
    if (contributors.length > 0) {
      if (!contributors.some((c) => c.memberId === me.id) && !grownUps.includes(me.id)) continue;
      const p = depositProgress(contributors, deposits.filter((d) => d.goal_id === g.id).map((d) => ({ accountId: d.account_id, recordedBy: d.recorded_by })));
      if (p.waiting.length === 0) continue;
      const mineToDo = p.waiting.includes(me.id);
      out.push({
        id: `deposit-${g.id}`,
        title: g.title,
        meta: mineToDo ? "This month's deposit · yours is still to go" : `This month's deposits · waiting on ${p.waiting.map(nameOf).join(", ")}`,
        tabs: ["assets", "goals"],
        people: contributors.map((c) => ({ name: nameOf(c.memberId), done: p.done.includes(c.memberId), amount: c.amount })),
        quick: mineToDo ? goalAction : undefined,
        lines: [
          `This month's deposits: ${p.done.length} of ${contributors.length} put in.`,
          mineToDo ? "Put in your share below." : `It waits on ${p.waiting.map(nameOf).join(" and ")}: send a reminder if it helps.`,
        ],
        // Yours to put in; and a grown-up can remind whoever else is still to.
        actions: [...(mineToDo ? [goalAction] : []), ...(grownUps.includes(me.id) ? p.waiting.filter((id) => id !== me.id).map((id) => ({ kind: "remind" as const, goalId: g.id, memberId: id, name: nameOf(id) })) : [])],
        open: look(`goal-${g.id}`),
      });
      continue;
    }
    if (!mine(g)) continue;
    const target = Number(g.target_amount ?? 0);
    const left = target - Number(g.current_amount);
    if (!g.target_date || target <= 0 || left <= 0.005) continue;
    const days = Math.round((Date.parse(g.target_date.slice(0, 10)) - Date.parse(today)) / 86_400_000);
    if (days > 7) continue;
    out.push({
      id: `goal-${g.id}`,
      title: g.title,
      meta: `${days < 0 ? `was due ${fmtDate(g.target_date)}` : days === 0 ? "due today" : `due ${fmtDate(g.target_date)}`}`,
      amount: left,
      tabs: ["assets", "goals"],
      lines: [`${days < 0 ? `Its date, ${fmtDate(g.target_date)}, has passed` : `Due ${fmtDate(g.target_date)}`}: ${Number(g.current_amount) > 0 ? `${formatCurrency(Number(g.current_amount), currency)} saved of ${formatCurrency(target, currency)}` : `nothing saved yet of ${formatCurrency(target, currency)}`}.`, "Put money in, or change its date or target from the goal."],
      actions: [
        goalAction,
        // A yearly cost come round: record that it was paid, from the fund.
        ...(g.repeats_yearly && Number(g.current_amount) > 0 ? [{ kind: "fund-paid" as const, goalId: g.id, title: g.title, saved: Number(g.current_amount), target, linkedAccountId: g.linked_account_id, repeatsYearly: !!g.repeats_yearly }] : []),
        { kind: "edit-goal", goal: { id: g.id, title: g.title, note: g.sub_note, target, date: g.target_date, yearly: !!g.repeats_yearly } },
      ],
      quick: goalAction,
      snoozable: true,
      open: look(`goal-${g.id}`),
    });
  }

  // A time deposit or MP2 that has matured in the last 30 days.
  for (const a of accounts) {
    const day = a.matures_on?.slice(0, 10);
    if ((a.account_type !== "investment" && a.account_type !== "stocks") || !day || day > today || Date.parse(today) - Date.parse(day) > 30 * 86_400_000) continue;
    if (!actorsFor({ accountOwner: a.owner_member_id, accountJoint: a.is_joint }, grownUps).includes(me.id)) continue;
    out.push({
      id: `matured-${a.id}`,
      title: a.name,
      meta: `Matured ${fmtDate(day)}`,
      amount: a.balance,
      tabs: ["assets", "accounts"],
      lines: ["It has matured: move the money where it went, or update the account if it rolled over."],
      actions: [
        { kind: "link", href: `/wealth/transact?mode=transfer&account=${a.id}&amount=${a.balance}`, label: "Move the money" },
        { kind: "link", href: `/wealth/accounts/${a.id}`, label: "Rolled over: set the new date" },
      ],
      snoozable: true,
      open: { href: `/wealth/accounts/${a.id}`, label: "Open the account", tab: null },
    });
  }

  return out.filter((e) => !(e.snoozable && snoozed.has(e.id)));
});


