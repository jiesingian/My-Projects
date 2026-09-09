"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars, type CalendarTarget } from "@/lib/actions/calendar-sync";
import { GOAL_CATEGORY, TRANSFER_CATEGORY, explainLedgerRefusal } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";
import { allDayEvent } from "@/lib/calendar-shape";

type Db = SupabaseClient<Database>;

function revalidateWealth() {
  revalidatePath("/wealth");
  revalidatePath("/household");
  revalidatePath("/today");
}

/* ---------------------------------------------------------------- accounts */

export async function addAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const subNote = String(formData.get("sub_note") ?? "").trim() || null;
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const linkedAppUrl = String(formData.get("linked_app_url") ?? "").trim() || null;
  const accountType = String(formData.get("account_type") ?? "bank");
  const openingBalance = Number(formData.get("opening_balance") ?? 0);
  const isJoint = formData.get("is_joint") === "on";
  if (!name) return { error: "Name the account." };

  const { error } = await supabase.from("accounts").insert({
    family_id: me.family_id,
    name,
    sub_note: subNote,
    institution,
    linked_app_url: linkedAppUrl,
    account_type: accountType,
    opening_balance: openingBalance,
    is_joint: isJoint,
    owner_member_id: isJoint ? null : me.id,
    created_by: me.id,
  });
  if (error) return { error: error.message };

  revalidateWealth();
  return { error: null };
}

export async function updateAccountAction(accountId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name the account." };

  const { error } = await supabase
    .from("accounts")
    .update({
      name,
      sub_note: String(formData.get("sub_note") ?? "").trim() || null,
      institution: String(formData.get("institution") ?? "").trim() || null,
      linked_app_url: String(formData.get("linked_app_url") ?? "").trim() || null,
      account_type: String(formData.get("account_type") ?? "bank"),
    })
    .eq("id", accountId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };

  revalidateWealth();
  redirect(`/wealth/accounts/${accountId}`);
}

/** Open a personal account to the household, or close it again. Only its
 * owner can: the update policy on the table says so, so a wrong id from a
 * wrong person changes nothing. A joint account is the household's already
 * and has nothing to open. */
export async function setAccountPrivacyAction(accountId: string, isPrivate: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("accounts")
    .select("is_joint, owner_member_id")
    .eq("id", accountId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!account) return { error: "That account is no longer here." };
  if (account.is_joint) return { error: "A joint account belongs to the household already." };
  if (account.owner_member_id !== me.id) return { error: "Only the person whose account it is can change that." };

  const { error } = await supabase
    .from("accounts")
    .update({ is_private: isPrivate })
    .eq("id", accountId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };

  revalidateWealth();
  return { error: null };
}

export async function archiveAccountAction(accountId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").update({ is_archived: true }).eq("id", accountId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidateWealth();
  return { error: null };
}

/* ------------------------------------------------------------- the ledger */

type LedgerInput = {
  accountId: string;
  direction: "in" | "out";
  amount: number;
  particulars: string;
  category: string | null;
  occurredAt?: string | null;
  status?: "pending" | "confirmed";
  transferGroupId?: string | null;
  sourceTable?: "bills" | "trips" | "buy_items" | "health_appointments" | "goals" | "routines" | null;
  sourceId?: string | null;
  goalId?: string | null;
};

function ledgerRow(familyId: string, memberId: string, input: LedgerInput): TablesInsert<"wealth_transactions"> {
  return {
    family_id: familyId,
    account_id: input.accountId,
    direction: input.direction,
    amount: input.amount,
    particulars: input.particulars,
    category: input.category,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    status: input.status ?? "confirmed",
    transfer_group_id: input.transferGroupId ?? null,
    source_table: input.sourceTable ?? null,
    source_id: input.sourceId ?? null,
    goal_id: input.goalId ?? null,
    recorded_by: memberId,
  };
}

async function insertEntry(supabase: Db, familyId: string, memberId: string, input: LedgerInput) {
  return supabase.from("wealth_transactions").insert(ledgerRow(familyId, memberId, input)).select().single();
}

/** What a confirmed movement does beyond moving the balance: a bill it paid
 * becomes settled, a goal it funded moves closer. Deferred until confirmation
 * so a payment still waiting in someone's banking app doesn't mark a bill
 * paid prematurely. */
async function applySettlement(supabase: Db, memberId: string, entry: Tables<"wealth_transactions">): Promise<string | null> {
  if (entry.source_table === "bills" && entry.source_id) {
    // The money has already moved. If this fails the bill stays sitting there
    // unpaid, and someone pays it a second time.
    const { error } = await supabase
      .from("bills")
      .update({
        status: "paid",
        paid_at: entry.occurred_at,
        paid_from_account_id: entry.account_id,
        paid_by_member_id: memberId,
        transaction_id: entry.id,
      })
      .eq("id", entry.source_id);
    if (error) return `The payment was recorded, but the bill is still showing as unpaid. ${error.message}`;
  }

  if (entry.goal_id) {
    const goalError = await recalcGoalTotal(supabase, entry.goal_id);
    if (goalError) return `The money moved, but the goal total was not brought up to date. ${goalError.message}`;
  }
  return null;
}

/** The goal's total, recomputed from the ledger rather than added to.
 *
 * Reading the total and writing back read + delta is two round trips with no
 * lock between them, which loses one of two simultaneous contributions and
 * double-counts a Confirm that gets clicked twice. Recomputing is the same
 * number by construction -- a goal starts at 0 and only ever moves by one
 * wealth_transactions row at a time -- but it is a destination rather than a
 * distance, so running it twice is running it once. */
async function recalcGoalTotal(supabase: Db, goalId: string) {
  const { error } = await supabase.rpc("recalc_goal_total", { p_goal_id: goalId });
  return error;
}

/** Money in or out of one account, from a source Kin doesn't otherwise see —
 * salary, business revenue, a gift, a cash purchase. When the member is
 * routing it through their banking app it lands pending, and only counts once
 * they come back and confirm it actually went through. */
export async function recordMovementAction(input: {
  accountId: string;
  direction: "in" | "out";
  amount: number;
  particulars: string;
  category: string | null;
  occurredAt: string | null;
  viaApp: boolean;
}): Promise<{ error: string | null; transactionId?: string; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (!input.particulars.trim()) return { error: "Say what this is for." };
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const { data: account } = await supabase
    .from("accounts")
    .select("linked_app_url")
    .eq("id", input.accountId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!account) return { error: "Choose an account." };

  const status = input.viaApp ? "pending" : "confirmed";
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    ...input,
    particulars: input.particulars.trim(),
    status,
  });
  if (error) return { error: explainLedgerRefusal(error.message) };

  if (status === "confirmed") {
    const settled = await applySettlement(supabase, me.id, entry);
    if (settled) return { error: settled };
  }

  revalidateWealth();
  return { error: null, transactionId: entry.id, appUrl: input.viaApp ? account.linked_app_url : null };
}

/** Moves money between two of the household's own accounts as a matched pair
 * of entries, so neither side can drift from the other. */
export async function transferAction(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note: string;
  occurredAt: string | null;
  viaApp: boolean;
}): Promise<{ error: string | null; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (input.fromAccountId === input.toAccountId) return { error: "Pick two different accounts." };
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, linked_app_url")
    .eq("family_id", me.family_id)
    .in("id", [input.fromAccountId, input.toAccountId]);
  const from = accounts?.find((a) => a.id === input.fromAccountId);
  const to = accounts?.find((a) => a.id === input.toAccountId);
  if (!from || !to) return { error: "Choose both accounts." };

  const status = input.viaApp ? "pending" : "confirmed";
  const transferGroupId = crypto.randomUUID();
  const note = input.note.trim();

  const legs: LedgerInput[] = [
    {
      accountId: from.id,
      direction: "out",
      amount: input.amount,
      particulars: note || `Transfer to ${to.name}`,
      category: TRANSFER_CATEGORY,
      occurredAt: input.occurredAt,
      status,
      transferGroupId,
    },
    {
      accountId: to.id,
      direction: "in",
      amount: input.amount,
      particulars: note || `Transfer from ${from.name}`,
      category: TRANSFER_CATEGORY,
      occurredAt: input.occurredAt,
      status,
      transferGroupId,
    },
  ];

  // Both legs in ONE statement, and deliberately without asking for the rows
  // back. Each half of that sentence fixes a measured failure.
  //
  // Two separate inserts meant the first could land and the second fail, and
  // the first is the one that takes the money OUT. The household is then down
  // by the amount, it has arrived nowhere, and the person is shown an error --
  // so they do it again, and it goes out twice. One statement makes that
  // impossible rather than unlikely: Postgres commits both rows or neither.
  //
  // The rows are not read back because reading them is what failed. An account
  // is visible when it is joint, mine, OR not private; a transaction on it is
  // visible only when the account is joint or mine. So a member's own account
  // that they have shared with the household appears in the transfer list, and
  // a transaction paid into it cannot be read by anybody else -- the insert is
  // allowed, the RETURNING is refused, and a refused RETURNING takes the whole
  // statement down with it. Nothing here uses the returned rows.
  //
  // Measured 9 September in the throwaway household, transferring into exactly
  // such an account:
  //
  //   two inserts, each asking for its row back   -> 201 then 403, 5,000 gone
  //   one insert, asking for the rows back        -> 403, nothing written
  //   one insert, not asking for them back        -> 201, both legs present
  const { error } = await supabase
    .from("wealth_transactions")
    .insert(legs.map((leg) => ledgerRow(me.family_id, me.id, leg)));
  if (error) return { error: error.message };

  revalidateWealth();
  return { error: null, appUrl: input.viaApp ? from.linked_app_url : null };
}

export async function confirmTransactionAction(transactionId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("wealth_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!entry) return { error: "Not found." };

  const ids = entry.transfer_group_id
    ? ((await supabase.from("wealth_transactions").select("id").eq("transfer_group_id", entry.transfer_group_id)).data ?? []).map((r) => r.id)
    : [entry.id];

  const { error } = await supabase.from("wealth_transactions").update({ status: "confirmed" }).in("id", ids);
  if (error) return { error: error.message };

  const settled = await applySettlement(supabase, me.id, { ...entry, status: "confirmed" });
  if (settled) return { error: settled };
  revalidateWealth();
  return { error: null };
}

export async function deleteTransactionAction(transactionId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("wealth_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!entry) return { error: "Not found." };

  // Which goals this delete will disturb, gathered BEFORE the rows go. A
  // recomputed total is read back off the ledger, so unlike the old
  // subtract-the-amount it has to run once the rows are actually gone --
  // running it first would only rewrite the total it is about to invalidate.
  // A transfer group is deleted whole, so ask the group, not this one row.
  const doomed = supabase.from("wealth_transactions").select("goal_id").eq("family_id", me.family_id).not("goal_id", "is", null);
  const { data: doomedRows } = entry.transfer_group_id
    ? await doomed.eq("transfer_group_id", entry.transfer_group_id)
    : await doomed.eq("id", entry.id);
  const touchedGoalIds = [...new Set((doomedRows ?? []).map((r) => r.goal_id).filter((id): id is string => !!id))];

  // A discarded payment — settled or still pending in someone's banking app —
  // leaves the bill open again, never stranded as "scheduled".
  if (entry.source_table === "bills" && entry.source_id) {
    // The payment is about to be deleted. A bill left marked paid with nothing
    // behind it is a bill nobody will pay.
    const { error: billError } = await supabase
      .from("bills")
      .update({ status: "unpaid", paid_at: null, paid_from_account_id: null, paid_by_member_id: null, transaction_id: null })
      .eq("id", entry.source_id);
    if (billError) return { error: `The bill could not be reopened, so the payment was left in place. ${billError.message}` };
  }

  const query = supabase.from("wealth_transactions").delete();
  const { error } = entry.transfer_group_id
    ? await query.eq("transfer_group_id", entry.transfer_group_id)
    : await query.eq("id", entry.id);
  if (error) return { error: error.message };

  for (const goalId of touchedGoalIds) await recalcGoalTotal(supabase, goalId);

  revalidateWealth();
  return { error: null };
}

/** Lets other hubs post real spend against an account — a grocery run cleared
 * in Household, a checkup settled in Family, a trip expense in Planner. */
export async function postHubExpenseAction(input: {
  accountId: string;
  amount: number;
  particulars: string;
  category: string;
  sourceTable: "bills" | "trips" | "buy_items" | "health_appointments" | "routines";
  sourceId: string | null;
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const { error } = await insertEntry(supabase, me.family_id, me.id, {
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: input.particulars,
    category: input.category,
    sourceTable: input.sourceTable,
    sourceId: input.sourceId,
  });
  if (error) return { error: explainLedgerRefusal(error.message) };

  revalidateWealth();
  return { error: null };
}

/* ------------------------------------------------------------------ bills */

export async function addBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const category = String(formData.get("category") ?? "").trim() || null;
  const recurrence = String(formData.get("recurrence") ?? "monthly");
  if (!name || !amount) return { error: "Name and amount are required." };

  const { data: bill, error } = await supabase
    .from("bills")
    .insert({ family_id: me.family_id, name, amount, due_date: dueDate, category, recurrence, status: "unpaid", created_by: me.id })
    .select()
    .single();
  if (error) return { error: error.message };

  if (dueDate) {
    await syncRowToCalendars(
      me.family_id,
      "bills",
      bill.id,
      allDayEvent(`${name} due`, dueDate),
      { kind: "all" },
    );
  }

  revalidateWealth();
  return { error: null };
}

/** Settling a bill is just a ledger entry that happens to close the bill —
 * the account it came out of drops by exactly what was paid. */
export async function payBillAction(input: {
  billId: string;
  accountId: string;
  amount: number;
  viaApp: boolean;
}): Promise<{ error: string | null; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const [{ data: bill }, { data: account }] = await Promise.all([
    supabase.from("bills").select("*").eq("id", input.billId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("accounts").select("linked_app_url").eq("id", input.accountId).eq("family_id", me.family_id).maybeSingle(),
  ]);
  if (!bill) return { error: "Bill not found." };
  if (!account) return { error: "Choose an account to pay from." };

  const status = input.viaApp ? "pending" : "confirmed";
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: `${bill.name} bill`,
    category: bill.category ?? "Utilities",
    status,
    sourceTable: "bills",
    sourceId: bill.id,
  });
  if (error) return { error: explainLedgerRefusal(error.message) };

  if (status === "confirmed") {
    const settled = await applySettlement(supabase, me.id, entry);
    if (settled) return { error: settled };
  }
  else await supabase.from("bills").update({ status: "scheduled" }).eq("id", bill.id);

  revalidateWealth();
  return { error: null, appUrl: input.viaApp ? account.linked_app_url : null };
}

export async function deleteBillAction(billId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("bills").delete().eq("id", billId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidateWealth();
  return { error: null };
}

/* ---------------------------------------------------------- budget & goals */

export async function setJointBudgetAction(month: number, year: number, amount: number): Promise<ActionState> {
  // The household comes from the session. As an argument it was merely
  // redundant -- RLS scopes budget_periods to the family either way -- but
  // an argument nobody needs is an argument nobody checks.
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("budget_periods").upsert(
    { family_id: me.family_id, period_month: month, period_year: year, budget_amount: amount },
    { onConflict: "family_id,period_month,period_year" },
  );
  if (error) return { error: error.message };
  revalidateWealth();
  return { error: null };
}

/** Your own revenue target, and only ever your own.
 *
 * Both ids used to arrive from the browser. The page guards it -- the control
 * is rendered only when the pane being viewed is your own -- but that guard
 * lives in the one place an attacker does not have to visit, and the row-level
 * policy on wealth_targets checks the family and not the member. So a member
 * could set, and silently overwrite, anybody else's target in the household,
 * while the SELECT policy meant they could not even see what they had done.
 * Confirmed against the throwaway household on 8 September: HTTP 201.
 *
 * The migration alongside this makes the database say so too; taking the ids
 * from the session is the half that does not need anybody to run anything. */
export async function setWealthTargetAction(month: number, year: number, amount: number): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("wealth_targets").upsert(
    { member_id: me.id, family_id: me.family_id, period_month: month, period_year: year, target_amount: amount },
    { onConflict: "member_id,period_month,period_year" },
  );
  if (error) return { error: error.message };
  revalidateWealth();
  return { error: null };
}

export async function setAllocationAction(input: { category: string; amount: number }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const readPeriod = () =>
    supabase.from("budget_periods").select("id").eq("family_id", me.family_id).eq("period_month", month).eq("period_year", year).maybeSingle();

  // A read that failed used to arrive below as "there is no budget for this
  // month yet", and the answer to that is to make one. UNIQUE (family_id,
  // period_month, period_year) refuses the second, so the household got a
  // duplicate-key error rather than a duplicate -- but the allocation read
  // underneath it has no such backstop.
  const { data: existingPeriod, error: periodReadError } = await readPeriod();
  if (periodReadError) return { error: `This month's budget could not be read, so nothing was changed. ${periodReadError.message}` };

  let period = existingPeriod;
  if (!period) {
    const { data: created, error: periodErr } = await supabase
      .from("budget_periods")
      .insert({ family_id: me.family_id, period_month: month, period_year: year, budget_amount: 0 })
      .select("id")
      .single();
    if (periodErr) {
      // Two people setting a budget in the same minute both read "no period
      // yet" and both insert; the constraint lets one through. Theirs is as
      // good as ours -- take it rather than showing a duplicate-key error.
      const { data: raced } = await readPeriod();
      if (!raced) return { error: periodErr.message };
      period = raced;
    } else {
      period = created;
    }
  }
  const periodId = period.id;

  const { data: existing, error: existingError } = await supabase
    .from("budget_allocations")
    .select("id")
    .eq("budget_period_id", periodId)
    .eq("category", input.category)
    .maybeSingle();
  // Two ways this fails, and inserting was the wrong answer to both. A read
  // that failed is not "no allocation yet", and maybeSingle also errors when
  // the category already has more than one row -- in which case another insert
  // makes a third, and every save after that adds one more. budget_allocations
  // has no uniqueness on (budget_period_id, category) to catch it: the
  // migration alongside this adds one, and until it is run this check is what
  // stands in for it.
  if (existingError) {
    return {
      error: `The "${input.category}" budget could not be read, so it was left as it was. ${existingError.message}`,
    };
  }

  const { error } = existing
    ? await supabase.from("budget_allocations").update({ amount: input.amount }).eq("id", existing.id)
    : await supabase
        .from("budget_allocations")
        .insert({ budget_period_id: periodId, family_id: me.family_id, category: input.category, amount: input.amount });
  if (error) return { error: error.message };

  revalidateWealth();
  return { error: null };
}

export async function createGoalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const subNote = String(formData.get("sub_note") ?? "").trim() || null;
  const isJoint = formData.get("is_joint") === "on";
  const ownerMemberId = isJoint ? null : me.id;
  const targetAmount = formData.get("target_amount") ? Number(formData.get("target_amount")) : null;
  const targetDate = String(formData.get("target_date") ?? "") || null;
  const linkedAccountId = String(formData.get("linked_account_id") ?? "") || null;
  if (!title) return { error: "Give the goal a title." };
  if (!targetAmount || targetAmount <= 0) return { error: "Set the amount you're saving towards." };

  const { data: goal, error } = await supabase
    .from("goals")
    .insert({
      family_id: me.family_id,
      title,
      sub_note: subNote,
      is_joint: isJoint,
      owner_member_id: ownerMemberId,
      target_amount: targetAmount,
      target_date: targetDate,
      linked_account_id: linkedAccountId,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  if (targetDate) {
    const target: CalendarTarget = isJoint ? { kind: "all" } : { kind: "member", memberId: ownerMemberId };
    await syncRowToCalendars(me.family_id, "goals", goal.id, allDayEvent(title, targetDate), target);
  }

  revalidateWealth();
  redirect("/wealth?seg=goals");
}

/** Putting money towards a goal moves it out of a real account, so goal
 * progress is always backed by money the household actually set aside. */
export async function contributeToGoalAction(input: {
  goalId: string;
  accountId: string;
  amount: number;
  viaApp: boolean;
}): Promise<{ error: string | null; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const [{ data: goal }, { data: account }] = await Promise.all([
    supabase.from("goals").select("title").eq("id", input.goalId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("accounts").select("linked_app_url").eq("id", input.accountId).eq("family_id", me.family_id).maybeSingle(),
  ]);
  if (!goal) return { error: "Goal not found." };
  if (!account) return { error: "Choose an account." };
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const status = input.viaApp ? "pending" : "confirmed";
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: `Towards ${goal.title}`,
    category: GOAL_CATEGORY,
    status,
    goalId: input.goalId,
  });
  if (error) return { error: explainLedgerRefusal(error.message) };

  if (status === "confirmed") {
    const settled = await applySettlement(supabase, me.id, entry);
    if (settled) return { error: settled };
  }

  revalidateWealth();
  return { error: null, appUrl: input.viaApp ? account.linked_app_url : null };
}

export async function deleteGoalAction(goalId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("goals").delete().eq("id", goalId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidateWealth();
  return { error: null };
}

/* ------------------------------------------------------ assets & liabilities */

export async function addAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const value = Number(formData.get("value") ?? 0);
  const isJoint = formData.get("is_joint") === "on";
  if (!name) return { error: "Name the asset." };

  const { error } = await supabase.from("assets").insert({
    family_id: me.family_id,
    name,
    kind: String(formData.get("kind") ?? "other"),
    value,
    acquired_on: String(formData.get("acquired_on") ?? "") || null,
    note: String(formData.get("note") ?? "").trim() || null,
    is_joint: isJoint,
    owner_member_id: isJoint ? null : me.id,
    created_by: me.id,
  });
  if (error) return { error: error.message };

  revalidateWealth();
  redirect("/wealth?seg=assets");
}

export async function addLiabilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const balance = Number(formData.get("balance") ?? 0);
  const isJoint = formData.get("is_joint") === "on";
  if (!name) return { error: "Name what is owed." };

  const { error } = await supabase.from("liabilities").insert({
    family_id: me.family_id,
    name,
    kind: String(formData.get("kind") ?? "other"),
    balance,
    monthly_payment: formData.get("monthly_payment") ? Number(formData.get("monthly_payment")) : null,
    lender: String(formData.get("lender") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    is_joint: isJoint,
    owner_member_id: isJoint ? null : me.id,
    created_by: me.id,
  });
  if (error) return { error: error.message };

  revalidateWealth();
  redirect("/wealth?seg=assets");
}

export async function updateAssetValueAction(assetId: string, value: number): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("assets").update({ value }).eq("id", assetId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidateWealth();
  return { error: null };
}

export async function updateLiabilityBalanceAction(liabilityId: string, balance: number): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("liabilities").update({ balance }).eq("id", liabilityId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidateWealth();
  return { error: null };
}

export async function deleteAssetAction(assetId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("assets").delete().eq("id", assetId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidateWealth();
  return { error: null };
}

export async function deleteLiabilityAction(liabilityId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("liabilities").delete().eq("id", liabilityId).eq("family_id", me.family_id);
  if (error) return { error: error.message };
  revalidateWealth();
  return { error: null };
}
