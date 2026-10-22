"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError } from "@/lib/report-error";
import { clamp } from "@/lib/text";
import { isGrownUp } from "@/lib/roles";
import { familyDay } from "@/lib/time";
import { paymentProblem, utangLeft } from "@/lib/utang";
import type { ActionState } from "@/lib/actions/auth";

/** Utang and paluwagan are grown-ups' records, Kin Plus (20261019110000).
 * The database is the boundary -- role, "just me", Plus -- and these checks
 * are so the person reads a sentence instead of a refusal. */
async function grownUp() {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { me, error: "Utang and paluwagan are kept by the grown-ups." };
  return { me, error: null };
}

const refresh = (path?: string) => {
  revalidatePath("/wealth/utang");
  if (path) revalidatePath(path);
};

const amountOf = (fd: FormData, k: string) => Math.round(Number(String(fd.get(k) ?? "").replace(/,/g, "")) * 100) / 100;
const dateOf = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};
const isPrivate = (fd: FormData) => String(fd.get("visibility") ?? "household") === "private";

export async function addUtangAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };

  const direction = String(formData.get("direction") ?? "");
  const personName = clamp(String(formData.get("person_name") ?? ""), 120);
  const amount = amountOf(formData, "amount");
  const startedOn = dateOf(formData, "started_on") ?? familyDay(new Date(), me.families.time_zone || undefined);
  const dueOn = dateOf(formData, "due_on");
  if (direction !== "lent" && direction !== "borrowed") return { error: "Choose lent or borrowed." };
  if (!personName) return { error: "Who is it with?" };
  if (!(amount > 0)) return { error: "Enter how much." };
  if (dueOn && dueOn < startedOn) return { error: "The due date is before the day it started." };

  const supabase = await createClient();
  const { error: dbError } = await supabase.from("utang_entries").insert({
    family_id: me.family_id,
    direction,
    person_name: personName,
    amount,
    started_on: startedOn,
    due_on: dueOn,
    note: clamp(String(formData.get("note") ?? ""), 500) || null,
    is_private: isPrivate(formData),
    // A reminder is only ever for money someone owes us.
    remind: direction === "lent" && formData.get("remind") === "on",
    recorded_by: me.id,
  });
  if (dbError) return { error: databaseError(dbError) };

  refresh();
  return { error: null };
}

/** A partial payment, or the last one. Checked against what is left here;
 * the database refuses an overpayment either way. */
export async function addUtangPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };

  const utangId = String(formData.get("utang_id") ?? "");
  const amount = amountOf(formData, "amount");
  const supabase = await createClient();
  const { data: u } = await supabase.from("utang_entries").select("amount, utang_payments(amount)").eq("id", utangId).maybeSingle();
  if (!u) return { error: "That utang is no longer here." };
  const problem = paymentProblem(amount, utangLeft(Number(u.amount), u.utang_payments ?? []).left);
  if (problem) return { error: problem };

  const { error: dbError } = await supabase.from("utang_payments").insert({
    utang_id: utangId,
    family_id: me.family_id,
    amount,
    paid_on: dateOf(formData, "paid_on") ?? familyDay(new Date(), me.families.time_zone || undefined),
    note: clamp(String(formData.get("note") ?? ""), 200) || null,
    recorded_by: me.id,
  });
  if (dbError) return { error: databaseError(dbError) };

  refresh();
  return { error: null };
}

export async function removeUtangPaymentAction(paymentId: string): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };
  const supabase = await createClient();
  const { error: dbError } = await supabase.from("utang_payments").delete().eq("id", paymentId).eq("family_id", me.family_id);
  if (dbError) return { error: databaseError(dbError) };
  refresh();
  return { error: null };
}

export async function deleteUtangAction(utangId: string): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };
  const supabase = await createClient();
  const { error: dbError } = await supabase.from("utang_entries").delete().eq("id", utangId).eq("family_id", me.family_id);
  if (dbError) return { error: databaseError(dbError) };
  refresh();
  return { error: null };
}

/** The per-entry choices that can change after the fact: who sees it, and
 * whether Kin prepares a reminder. Only the recorder can make it "just me";
 * the database holds that line. */
export async function setUtangOptionsAction(utangId: string, opts: { remind?: boolean; isPrivate?: boolean }): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };
  const supabase = await createClient();
  const { error: dbError } = await supabase
    .from("utang_entries")
    .update({ ...(opts.remind === undefined ? {} : { remind: opts.remind }), ...(opts.isPrivate === undefined ? {} : { is_private: opts.isPrivate }) })
    .eq("id", utangId)
    .eq("family_id", me.family_id);
  if (dbError) return { error: databaseError(dbError) };
  refresh();
  return { error: null };
}

/** A new paluwagan: the group, then its members in turn order -- one per
 * line -- with the household's own slot at the turn chosen. */
export async function addPaluwaganAction(_prev: ActionState, formData: FormData): Promise<ActionState & { id?: string }> {
  const { me, error } = await grownUp();
  if (error) return { error };

  const name = clamp(String(formData.get("name") ?? ""), 80);
  const contribution = amountOf(formData, "contribution");
  const frequency = String(formData.get("frequency") ?? "monthly");
  const startsOn = dateOf(formData, "starts_on");
  const others = String(formData.get("members") ?? "")
    .split(/\n|,/)
    .map((s) => clamp(s, 80))
    .filter(Boolean);
  const usTurn = Math.round(Number(String(formData.get("us_turn") ?? "0")));
  if (!name) return { error: "Give the paluwagan a name." };
  if (!(contribution > 0)) return { error: "Enter each member's hulog." };
  if (!["weekly", "semi_monthly", "monthly"].includes(frequency)) return { error: "Choose how often it runs." };
  if (!startsOn) return { error: "Choose the first round's date." };

  const names = [...others];
  if (usTurn > 0) names.splice(Math.min(usTurn, names.length + 1) - 1, 0, "Us");
  if (names.length < 2) return { error: "A paluwagan needs at least two members." };
  if (names.length > 100) return { error: "Up to 100 members." };

  const supabase = await createClient();
  const { data: group, error: dbError } = await supabase
    .from("paluwagan_groups")
    .insert({
      family_id: me.family_id,
      name,
      contribution,
      frequency,
      starts_on: startsOn,
      note: clamp(String(formData.get("note") ?? ""), 500) || null,
      is_private: isPrivate(formData),
      remind: formData.get("remind") === "on",
      recorded_by: me.id,
    })
    .select("id")
    .single();
  if (dbError || !group) return { error: databaseError(dbError ?? "Not saved.") };

  const usIndex = usTurn > 0 ? Math.min(usTurn, names.length) - 1 : -1;
  const { error: membersError } = await supabase
    .from("paluwagan_members")
    .insert(names.map((n, i) => ({ group_id: group.id, family_id: me.family_id, name: n, turn: i + 1, is_us: i === usIndex })));
  if (membersError) {
    await supabase.from("paluwagan_groups").delete().eq("id", group.id);
    return { error: databaseError(membersError) };
  }

  refresh();
  return { error: null, id: group.id };
}

/** Tick or untick one member's hulog for one round. */
export async function setPaluwaganPaidAction(groupId: string, memberId: string, round: number, paid: boolean): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };
  const supabase = await createClient();
  const { error: dbError } = paid
    ? await supabase.from("paluwagan_payments").upsert(
        { member_id: memberId, round, group_id: groupId, family_id: me.family_id, recorded_by: me.id, paid_on: familyDay(new Date(), me.families.time_zone || undefined) },
        { onConflict: "member_id,round", ignoreDuplicates: true },
      )
    : await supabase.from("paluwagan_payments").delete().eq("member_id", memberId).eq("round", round).eq("group_id", groupId);
  if (dbError) return { error: databaseError(dbError) };
  refresh(`/wealth/paluwagan/${groupId}`);
  return { error: null };
}

export async function setPaluwaganOptionsAction(groupId: string, opts: { remind?: boolean; isPrivate?: boolean }): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };
  const supabase = await createClient();
  const { error: dbError } = await supabase
    .from("paluwagan_groups")
    .update({ ...(opts.remind === undefined ? {} : { remind: opts.remind }), ...(opts.isPrivate === undefined ? {} : { is_private: opts.isPrivate }) })
    .eq("id", groupId)
    .eq("family_id", me.family_id);
  if (dbError) return { error: databaseError(dbError) };
  refresh(`/wealth/paluwagan/${groupId}`);
  return { error: null };
}

export async function deletePaluwaganAction(groupId: string): Promise<ActionState> {
  const { me, error } = await grownUp();
  if (error) return { error };
  const supabase = await createClient();
  const { error: dbError } = await supabase.from("paluwagan_groups").delete().eq("id", groupId).eq("family_id", me.family_id);
  if (dbError) return { error: databaseError(dbError) };
  refresh();
  return { error: null };
}
