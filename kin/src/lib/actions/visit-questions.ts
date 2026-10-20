"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { humanDatabaseError } from "@/lib/db-errors";
import { inKidView } from "@/lib/kid-view";
import { cleanQuestion, maySeeSheet } from "@/lib/visit-sheet";

/** The questions on a doctor-visit sheet. The policies of
 * 20261020002000_visit_questions.sql decide who may write; this keeps kid
 * view out as the page does, and words the refusal. */

async function allowed(memberId: string) {
  const me = await requireCurrentMember();
  return { me, ok: maySeeSheet({ id: me.id, role: me.role, kidView: inKidView(me) }, memberId) };
}

const refresh = (memberId: string) => revalidatePath(`/family/members/${memberId}/visit-sheet`);

export async function addVisitQuestionAction(memberId: string, raw: string): Promise<{ error: string | null }> {
  const { me, ok } = await allowed(memberId);
  if (!ok) return { error: "Only a grown-up, or the person themself, can add questions." };
  const body = cleanQuestion(raw);
  if (!body) return { error: "Type the question first." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_visit_questions").insert({ family_id: me.family_id, member_id: memberId, created_by: me.id, body });
  if (error) return { error: humanDatabaseError(error.message) };
  refresh(memberId);
  return { error: null };
}

export async function setVisitQuestionDoneAction(memberId: string, id: string, done: boolean): Promise<{ error: string | null }> {
  const { ok } = await allowed(memberId);
  if (!ok) return { error: "Only a grown-up, or the person themself, can change these." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_visit_questions").update({ done }).eq("id", id).eq("member_id", memberId);
  if (error) return { error: humanDatabaseError(error.message) };
  refresh(memberId);
  return { error: null };
}

export async function editVisitQuestionAction(memberId: string, id: string, raw: string): Promise<{ error: string | null }> {
  const { ok } = await allowed(memberId);
  if (!ok) return { error: "Only a grown-up, or the person themself, can change these." };
  const body = cleanQuestion(raw);
  if (!body) return { error: "A question can't be empty. Remove it instead." };
  const supabase = await createClient();
  const { error } = await supabase.from("health_visit_questions").update({ body }).eq("id", id).eq("member_id", memberId);
  if (error) return { error: humanDatabaseError(error.message) };
  refresh(memberId);
  return { error: null };
}

export async function removeVisitQuestionAction(memberId: string, id: string): Promise<{ error: string | null }> {
  const { ok } = await allowed(memberId);
  if (!ok) return { error: "Only a grown-up, or the person themself, can remove these." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("health_visit_questions").delete().eq("id", id).eq("member_id", memberId).select("id");
  refresh(memberId);
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "That question was already removed." };
  return { error: null };
}
