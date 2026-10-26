"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError, type DatabaseFailure, failureText } from "@/lib/report-error";
import { isGrownUp } from "@/lib/roles";
import { clamp } from "@/lib/text";
import type { ActionState } from "@/lib/actions/auth";

/** Shared costs between linked households. Making a pot names other
 * households, so it goes through create_shared_pot(), which checks every
 * pair is linked; entries are the caller's own household's, checked by the
 * policies of 20261019153000_shared_costs.sql. */

const amountOf = (fd: FormData, k: string) => Math.round(Number(String(fd.get(k) ?? "").replace(/,/g, "")) * 100) / 100;

function readable(error: DatabaseFailure): string {
  const message = failureText(error);
  if (message.includes("shared_pot_linked")) return "Every household in a pot has to be linked with every other. Link them first, or leave one out.";
  if (message.includes("shared_pot_households")) return "Choose at least one linked household (up to seven).";
  if (message.includes("shared_pot_title")) return "Give the pot a name.";
  if (message.includes("shared_pot_grown_up")) return "Only a parent or another adult can do that.";
  if (message.includes("shared_pot_share")) return "A share is a number from 0.1 to 100.";
  if (message.includes("shared_pot_open") || message.includes("row-level security")) return "That pot isn't open to your household any more.";
  return databaseError(error);
}

function refresh(potId?: string) {
  revalidatePath("/family/shared-costs");
  if (potId) revalidatePath(`/family/shared-costs/${potId}`);
}

export async function createSharedPotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can start a shared pot." };
  const title = clamp(String(formData.get("title") ?? "").trim(), 120);
  const note = clamp(String(formData.get("note") ?? "").trim(), 500) || null;
  const families = formData.getAll("families").map(String).filter(Boolean);
  if (!title) return { error: "Give the pot a name, like “Grandma’s medicines”." };
  if (families.length === 0) return { error: "Choose at least one linked household to share with." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_shared_pot", { p_title: title, p_note: note, p_families: families });
  if (error || !data) return { error: readable(error) };
  refresh();
  redirect(`/family/shared-costs/${data}`);
}

export async function addPotEntryAction(potId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can record in a shared pot." };
  const kind = formData.get("kind") === "payment" ? "payment" : "cost";
  const amount = amountOf(formData, "amount");
  const description = clamp(String(formData.get("description") ?? "").trim(), 200);
  const spentOn = String(formData.get("spent_on") ?? "").trim();
  const toFamilyId = kind === "payment" ? String(formData.get("to_family_id") ?? "") || null : null;
  if (!(amount > 0)) return { error: "Enter how much." };
  if (kind === "cost" && !description) return { error: "Say what it was for, like “Maintenance, October”." };
  if (kind === "payment" && !toFamilyId) return { error: "Choose which household you paid." };
  if (spentOn && !/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) return { error: "Choose a date." };

  const supabase = await createClient();
  const { error } = await supabase.from("shared_pot_entries").insert({
    pot_id: potId,
    kind,
    family_id: me.family_id,
    to_family_id: toFamilyId,
    amount,
    description,
    member_id: me.id,
    ...(spentOn ? { spent_on: spentOn } : {}),
  });
  if (error) return { error: readable(error) };
  refresh(potId);
  return { error: null };
}

export async function deletePotEntryAction(potId: string, entryId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("shared_pot_entries").delete().eq("id", entryId).eq("family_id", me.family_id).select("id");
  if (error) return { error: readable(error) };
  if (!data?.length) return { error: "Only the household that recorded it can take it back." };
  refresh(potId);
  return { error: null };
}

export async function setPotShareAction(potId: string, familyId: string, share: number): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a parent or another adult can change the shares." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_shared_pot_share", { p_pot: potId, p_family: familyId, p_share: share });
  if (error) return { error: readable(error) };
  refresh(potId);
  return { error: null };
}

export async function deletePotAction(potId: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("shared_pots").delete().eq("id", potId).eq("created_by_family", me.family_id).select("id");
  if (error) return { error: readable(error) };
  if (!data?.length) return { error: "Only the household that started the pot can delete it, and only before anyone else has recorded in it." };
  refresh();
  redirect("/family/shared-costs");
}
