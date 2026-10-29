"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError } from "@/lib/report-error";
import { isGrownUp } from "@/lib/roles";
import { setSpendingBudgetAction } from "@/lib/actions/wealth";
import { isTracks, type Tracks } from "@/lib/wealth-goals";
import type { ActionState } from "@/lib/actions/auth";

const clamp = (s: string, n: number) => s.trim().slice(0, n);

function revalidateGoals() {
  revalidatePath("/wealth");
  revalidatePath("/planner");
}

export type WealthGoalInput = {
  tracks: Tracks;
  /** The account, loan, income (group or one payment) or asset. */
  id?: string | null;
  /** An expense limit's category, and whose: a member id or "family". */
  category?: string | null;
  whose?: string | null;
  title: string;
  /** A balance, a monthly amount, a limit, a fund -- or, for a loan, what
   * is to be owed (0: paid off). */
  amount: number;
  dueDate?: string | null;
  watchOnTime?: boolean;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** 🎯 "Make it a goal" on a Wealth entry (Jonathan, 29 October): a money
 * goal on Planner that follows it (planner_goals.tracks, 20261029234000).
 * Whose it is follows the thing: a joint account's is the household's, a
 * personal one its owner's, and a private account's is "just me". */
export async function makeWealthGoalAction(input: WealthGoalInput): Promise<ActionState & { goalId?: string }> {
  const me = await requireCurrentMember();
  if (!isTracks(input.tracks)) return { error: "That can't be made a goal." };
  const title = clamp(String(input.title ?? ""), 80);
  if (!title) return { error: "Give the goal a name." };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return { error: "Enter an amount." };
  if (input.tracks !== "loan" && !(amount > 0)) return { error: "Enter an amount above zero." };
  const dueDate = input.dueDate && DAY.test(input.dueDate) ? input.dueDate : null;
  if (input.tracks === "loan" && !dueDate) return { error: "Choose the date to get there by." };
  const supabase = await createClient();

  let owner: string | null = null;
  let isPrivate = false;
  let target = amount;
  let startValue: number | null = null;
  let savingsGoalId: string | null = null;
  let category: string | null = null;
  const id = input.tracks === "expense" ? null : String(input.id ?? "");

  if (input.tracks === "account") {
    const { data: a } = await supabase.from("accounts").select("id, is_joint, owner_member_id, is_private, account_type").eq("id", id!).eq("family_id", me.family_id).maybeSingle();
    if (!a) return { error: "That account isn't one you can see." };
    if (a.account_type === "credit_card") return { error: "A card is paid down, not saved up: make its payment a bill instead." };
    owner = a.is_joint ? null : a.owner_member_id;
    isPrivate = a.is_private && owner === me.id;
  } else if (input.tracks === "loan") {
    const { data: l } = await supabase.from("liabilities").select("id, balance, is_joint, owner_member_id").eq("id", id!).eq("family_id", me.family_id).maybeSingle();
    if (!l) return { error: "That loan isn't one you can see." };
    owner = l.is_joint ? null : l.owner_member_id;
    startValue = Number(l.balance);
    // Kept as how much to pay down from here; what is owed is the rest.
    target = Math.round((startValue - amount) * 100) / 100;
    if (!(target > 0)) return { error: `It already owes ${amount > 0 ? "that or less" : "nothing"}.` };
  } else if (input.tracks === "asset") {
    const { data: a } = await supabase.from("assets").select("id, is_joint, owner_member_id").eq("id", id!).eq("family_id", me.family_id).maybeSingle();
    if (!a) return { error: "That isn't one you can see." };
    owner = a.is_joint ? null : a.owner_member_id;
  } else if (input.tracks === "income") {
    const [{ data: group }, { data: payments }] = await Promise.all([
      supabase.from("income_groups").select("id").eq("id", id!).eq("family_id", me.family_id).maybeSingle(),
      supabase.from("income_schedules").select("id, group_id, is_joint, owner_member_id").eq("family_id", me.family_id).or(`id.eq.${id},group_id.eq.${id}`).order("next_date", { ascending: false }).limit(1),
    ]);
    const p = payments?.[0];
    if (!group && !p) return { error: "That income isn't one you can see." };
    owner = p && !p.is_joint ? p.owner_member_id : null;
  } else {
    category = clamp(String(input.category ?? ""), 60);
    if (!category) return { error: "Choose a category." };
    const whose = String(input.whose ?? "family");
    if (whose !== "family") {
      const { data: m } = await supabase.from("members").select("id").eq("id", whose).eq("family_id", me.family_id).maybeSingle();
      if (!m) return { error: "That person isn't in your household." };
      owner = m.id;
    }
  }

  // A fund to replace a house or car is a savings goal on Wealth, the same
  // as any other; Planner's ring fills from it.
  if (input.tracks === "asset") {
    const { data: fund, error } = await supabase
      .from("goals")
      .insert({ family_id: me.family_id, title: clamp(title, 150), is_joint: owner === null, owner_member_id: owner, target_amount: amount, target_date: dueDate, created_by: me.id })
      .select("id")
      .single();
    if (error || !fund) return { error: `The fund could not be made (${databaseError(error ?? "unknown")}).` };
    savingsGoalId = fund.id;
  }

  const { data: goal, error } = await supabase
    .from("planner_goals")
    .insert({
      family_id: me.family_id,
      title,
      kind: "money",
      owner_member_id: owner,
      target,
      unit: null,
      period: input.tracks === "income" || input.tracks === "expense" ? "month" : "total",
      due_date: dueDate,
      start_value: startValue,
      savings_goal_id: savingsGoalId,
      created_by: me.id,
      visibility: isPrivate && isGrownUp(me.role) ? "private" : "household",
      tracks: input.tracks,
      tracks_id: input.tracks === "expense" ? null : id,
      tracks_category: category,
      watch_on_time: input.tracks === "income" && !!input.watchOnTime,
    })
    .select("id")
    .single();
  if (error || !goal) {
    if (savingsGoalId) await supabase.from("goals").delete().eq("id", savingsGoalId);
    if (error?.code === "23505") return { error: "It's already a goal." };
    return { error: databaseError(error ?? "unknown") };
  }

  // A limit is the category's budget too, where the budget is theirs to
  // set: one number in both places. Where it isn't, the goal keeps its own.
  if (input.tracks === "expense") await setSpendingBudgetAction({ whose: owner ?? "family", category: category!, amount });

  revalidateGoals();
  return { error: null, goalId: goal.id };
}

/** A new number or date for a 🎯 goal, from Wealth. */
export async function updateWealthGoalAction(goalId: string, input: { amount: number; dueDate?: string | null; watchOnTime?: boolean }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: g } = await supabase.from("planner_goals").select("id, tracks, tracks_category, owner_member_id, start_value, savings_goal_id").eq("id", goalId).eq("family_id", me.family_id).maybeSingle();
  if (!g || !isTracks(g.tracks)) return { error: "That goal is gone." };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || (g.tracks !== "loan" && !(amount > 0))) return { error: "Enter an amount above zero." };
  const dueDate = input.dueDate && DAY.test(input.dueDate) ? input.dueDate : null;
  if (g.tracks === "loan" && !dueDate) return { error: "Choose the date to get there by." };
  const target = g.tracks === "loan" ? Math.round((Number(g.start_value) - amount) * 100) / 100 : amount;
  if (!(target > 0)) return { error: "It already owes that or less." };
  const { error } = await supabase
    .from("planner_goals")
    .update({ target, due_date: dueDate, ...(g.tracks === "income" ? { watch_on_time: !!input.watchOnTime } : {}) })
    .eq("id", g.id);
  if (error) return { error: databaseError(error) };
  if (g.savings_goal_id) await supabase.from("goals").update({ target_amount: amount, target_date: dueDate }).eq("id", g.savings_goal_id);
  if (g.tracks === "expense") await setSpendingBudgetAction({ whose: g.owner_member_id ?? "family", category: g.tracks_category!, amount });
  revalidateGoals();
  return { error: null };
}

/** 🎯 off: the goal goes from Planner; the thing stays as it was. A
 * replacement fund keeps what was put in it, as a savings goal on Wealth. */
export async function stopWealthGoalAction(goalId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase.from("planner_goals").delete({ count: "exact" }).eq("id", goalId).eq("family_id", me.family_id).not("tracks", "is", null);
  if (error) return { error: /goal_promised/.test(error.message) ? "You promised a reward on this goal, so it stays until the reward is given." : databaseError(error) };
  if (count === 0) return { error: "That goal is no longer here." };
  revalidateGoals();
  return { error: null };
}
