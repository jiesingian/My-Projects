"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { isGrownUp } from "@/lib/roles";
import { familyDay } from "@/lib/time";

/** Seal a letter for someone in the household. With no date it opens on
 * their 18th birthday; the table works that out and refuses if it can't
 * (20261007090000_time_capsule_letters.sql). */
export async function sealLetterAction(input: {
  recipientId: string;
  opensOn: string | null;
  title: string;
  body: string;
}): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can write a letter for later." };
  const body = input.body.trim();
  const title = input.title.trim().slice(0, 120);
  if (!input.recipientId) return { error: "Choose who the letter is for." };
  if (!body) return { error: "Write the letter first." };
  if (body.length > 20000) return { error: "That letter is too long to keep." };
  const opensOn = input.opensOn || null;
  if (opensOn && (!/^\d{4}-\d{2}-\d{2}$/.test(opensOn) || opensOn <= familyDay())) return { error: "Pick a day after today." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("time_capsules")
    .insert({ recipient_member_id: input.recipientId, title, body, ...(opensOn ? { opens_on: opensOn } : {}) });
  if (error) {
    if (error.message.includes("Pick the day")) return { error: "They have no birthday saved, so pick the day it opens." };
    return { error: "It didn't save. Try again." };
  }
  revalidatePath("/journal/letters");
  return { error: null };
}

/** The writer may take a letter back. */
export async function removeLetterAction(id: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("time_capsules").delete().eq("id", id).eq("writer_member_id", me.id);
  if (error) return { error: "It didn't remove. Try again." };
  revalidatePath("/journal/letters");
  revalidatePath("/journal");
  revalidatePath("/today");
  return { error: null };
}
