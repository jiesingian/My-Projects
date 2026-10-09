"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendCardStartedPush } from "@/lib/push";
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
  occasion: string;
  /** Others may sign it as a card (the default); off keeps it private --
   * no card, nobody told (20261009090200). A child's note always signs. */
  openToSign?: boolean;
  /** "Open when..." instead of a day: the moment; they open it themselves
   * (20261009090300). Never a card. */
  openWhen?: string;
  title: string;
  body: string;
}): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  // A child with their own login may sign a card a grown-up started; the
  // table checks there is one (20261009090200).
  if (!isGrownUp(me.role) && me.role !== "child_self") return { error: "Only a grown-up can write a letter for later." };
  const body = input.body.trim();
  const title = input.title.trim().slice(0, 120);
  const occasion = input.occasion.trim().slice(0, 80);
  const openToSign = (isGrownUp(me.role) ? input.openToSign !== false : true) && !(input.openWhen ?? "").trim();
  if (!input.recipientId) return { error: "Choose who the letter is for." };
  if (!body) return { error: "Write the letter first." };
  if (body.length > 20000) return { error: "That letter is too long to keep." };
  const openWhen = (input.openWhen ?? "").trim().replace(/^open when\s+/i, "").slice(0, 120);
  const opensOn = openWhen ? null : input.opensOn || null;
  if (opensOn && (!/^\d{4}-\d{2}-\d{2}$/.test(opensOn) || opensOn <= familyDay(new Date(), me.families.time_zone))) return { error: "Pick a day after today." };
  const supabase = await createClient();
  const { data: saved, error } = await supabase
    .from("time_capsules")
    .insert({
      recipient_member_id: input.recipientId,
      title,
      body,
      occasion: openWhen ? "" : occasion,
      open_to_sign: openToSign,
      ...(openWhen ? { open_when: openWhen } : opensOn ? { opens_on: opensOn } : {}),
    })
    .select("opens_on, occasion, recipient:members!time_capsules_recipient_member_id_fkey(full_name)")
    .single();
  if (error) {
    if (error.message.includes("Pick the day")) return { error: "They have no birthday saved, so pick the day it opens." };
    if (!isGrownUp(me.role)) return { error: "Only a grown-up can start a card. You can sign one once it's started." };
    return { error: "It didn't save. Try again." };
  }
  // The first letter for a day starts a card: tell the rest of the household
  // so they can sign it. The database answers only if this is that first
  // letter, so signing someone else's card tells nobody (20261009090200).
  if (saved?.opens_on && isGrownUp(me.role) && openToSign) {
    const recipientFirst = ((saved.recipient as { full_name: string } | null)?.full_name ?? "").split(" ")[0];
    after(() =>
      sendCardStartedPush({
        recipientId: input.recipientId,
        opensOn: saved.opens_on as string,
        writerFirst: me.full_name.split(" ")[0],
        recipientFirst,
        occasion: saved.occasion,
      }),
    );
  }
  revalidatePath("/journal");
  return { error: null };
}

/** The person an "open when" letter is for opens it -- once, when the
 * moment comes. Only they can (open_letter, 20261009090300). */
export async function openLetterAction(id: string): Promise<{ error: string | null }> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_letter", { p_id: id });
  if (error || !data) return { error: "It didn't open. Try again." };
  revalidatePath("/journal");
  return { error: null };
}

/** The writer may take a letter back. */
export async function removeLetterAction(id: string): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("time_capsules").delete().eq("id", id).eq("writer_member_id", me.id);
  if (error) return { error: "It didn't remove. Try again." };
  revalidatePath("/journal");
  revalidatePath("/today");
  return { error: null };
}
