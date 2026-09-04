"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars, type CalendarTarget } from "@/lib/actions/calendar-sync";
import { GOAL_CATEGORY, TRANSFER_CATEGORY } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";

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

async function insertEntry(supabase: Db, familyId: string, memberId: string, input: LedgerInput) {
  const row: TablesInsert<"wealth_transactions"> = {
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
  return supabase.from("wealth_transactions").insert(row).select().single();
}

/** What a confirmed movement does beyond moving the balance: a bill it paid
 * becomes settled, a goal it funded moves closer. Deferred until confirmation
 * so a payment still waiting in someone's banking app doesn't mark a bill
 * paid prematurely. */
async function applySettlement(supabase: Db, memberId: string, entry: Tables<"wealth_transactions">) {
  if (entry.source_table === "bills" && entry.source_id) {
    await supabase
      .from("bills")
      .update({
        status: "paid",
        paid_at: entry.occurred_at,
        paid_from_account_id: entry.account_id,
        paid_by_member_id: memberId,
        transaction_id: entry.id,
      })
      .eq("id", entry.source_id);
  }

  if (entry.goal_id) {
    const { data: goal } = await supabase.from("goals").select("current_amount").eq("id", entry.goal_id).maybeSingle();
    if (goal) {
      const delta = entry.direction === "out" ? Number(entry.amount) : -Number(entry.amount);
      await supabase
        .from("goals")
        .update({ current_amount: Number(goal.current_amount) + delta })
        .eq("id", entry.goal_id);
    }
  }
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
  if (error) return { error: error.message };

  if (status === "confirmed") await applySettlement(supabase, me.id, entry);

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

  for (const leg of legs) {
    const { error } = await insertEntry(supabase, me.family_id, me.id, leg);
    if (error) return { error: error.message };
  }

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

  await applySettlement(supabase, me.id, { ...entry, status: "confirmed" });
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

  if (entry.status === "confirmed" && entry.goal_id) {
    const { data: goal } = await supabase.from("goals").select("current_amount").eq("id", entry.goal_id).maybeSingle();
    if (goal) {
      const delta = entry.direction === "out" ? -Number(entry.amount) : Number(entry.amount);
      await supabase.from("goals").update({ current_amount: Number(goal.current_amount) + delta }).eq("id", entry.goal_id);
    }
  }
  // A discarded payment — settled or still pending in someone's banking app —
  // leaves the bill open again, never stranded as "scheduled".
  if (entry.source_table === "bills" && entry.source_id) {
    await supabase
      .from("bills")
      .update({ status: "unpaid", paid_at: null, paid_from_account_id: null, paid_by_member_id: null, transaction_id: null })
      .eq("id", entry.source_id);
  }

  const query = supabase.from("wealth_transactions").delete();
  const { error } = entry.transfer_group_id
    ? await query.eq("transfer_group_id", entry.transfer_group_id)
    : await query.eq("id", entry.id);
  if (error) return { error: error.message };

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
  if (error) return { error: error.message };

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
      { title: `${name} due`, startAt: new Date(`${dueDate}T00:00:00`), allDay: true },
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
  if (error) return { error: error.message };

  if (status === "confirmed") await applySettlement(supabase, me.id, entry);
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

export async function setJointBudgetAction(familyId: string, month: number, year: number, amount: number) {
  const supabase = await createClient();
  await supabase.from("budget_periods").upsert(
    { family_id: familyId, period_month: month, period_year: year, budget_amount: amount },
    { onConflict: "family_id,period_month,period_year" },
  );
  revalidateWealth();
}

export async function setWealthTargetAction(memberId: string, familyId: string, month: number, year: number, amount: number) {
  const supabase = await createClient();
  await supabase.from("wealth_targets").upsert(
    { member_id: memberId, family_id: familyId, period_month: month, period_year: year, target_amount: amount },
    { onConflict: "member_id,period_month,period_year" },
  );
  revalidateWealth();
}

export async function setAllocationAction(input: { category: string; amount: number }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: existingPeriod } = await supabase
    .from("budget_periods")
    .select("id")
    .eq("family_id", me.family_id)
    .eq("period_month", month)
    .eq("period_year", year)
    .maybeSingle();

  let period = existingPeriod;
  if (!period) {
    const { data: created, error: periodErr } = await supabase
      .from("budget_periods")
      .insert({ family_id: me.family_id, period_month: month, period_year: year, budget_amount: 0 })
      .select("id")
      .single();
    if (periodErr) return { error: periodErr.message };
    period = created;
  }

  const { data: existing } = await supabase
    .from("budget_allocations")
    .select("id")
    .eq("budget_period_id", period.id)
    .eq("category", input.category)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("budget_allocations").update({ amount: input.amount }).eq("id", existing.id)
    : await supabase
        .from("budget_allocations")
        .insert({ budget_period_id: period.id, family_id: me.family_id, category: input.category, amount: input.amount });
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
    await syncRowToCalendars(me.family_id, "goals", goal.id, { title, startAt: new Date(`${targetDate}T00:00:00`), allDay: true }, target);
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
  if (error) return { error: error.message };

  if (status === "confirmed") await applySettlement(supabase, me.id, entry);

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
