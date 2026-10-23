"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { databaseError } from "@/lib/report-error";
import { UUID } from "@/lib/ids";
import { clamp } from "@/lib/text";
import { isGrownUp } from "@/lib/roles";
import { familyDay, familyMidnight } from "@/lib/time";
import { householdZone } from "@/lib/household-zone";
import { parseWishes } from "@/lib/gift-draw";
import { GONE_STATUSES } from "@/lib/member-status";

/** Monito-monita (20261019233200_gift_draw.sql). The policies decide who may
 * do what -- a grown-up starts a draw and asks linked households in, each
 * household puts in its own people, only the organizer's grown-up draws (in
 * the database, so no phone ever sees anyone else's pick); these actions
 * shape the rows and say no in words. */

const refresh = (id?: string) => {
  revalidatePath("/planner/monito");
  if (id) revalidatePath(`/planner/monito/${id}`);
};

export type NewDraw = { title: string; cap: string; exchangeDate: string; notOwnHousehold: boolean; revealOnDay: boolean };

export async function createGiftDrawAction(input: NewDraw): Promise<ActionState & { id?: string }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Ask a grown-up to start a draw." };
  const title = clamp(input.title, 80) || "Monito-monita";
  const day = input.exchangeDate.trim();
  if (!familyMidnight(day)) return { error: "Choose the day of the exchange." };
  if (day < familyDay(new Date(), await householdZone())) return { error: "The exchange day has passed." };
  const capText = input.cap.replace(/[₱,\s]/g, "");
  const cap = capText ? Number(capText) : null;
  if (cap !== null && (!Number.isFinite(cap) || cap <= 0 || cap > 1_000_000)) return { error: "The price cap should be an amount, like 500." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gift_draws")
    .insert({
      family_id: me.family_id,
      title,
      price_cap: cap,
      currency: me.families.currency,
      exchange_date: day,
      not_own_household: input.notOwnHousehold === true,
      reveal_on_day: input.revealOnDay === true,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error ? databaseError(error) : "The draw couldn't be started." };
  // The whole household starts in it (the feature guide's "everyone has to
  // be added first", 23 October); whoever isn't playing is ticked out on the
  // draw's page before the names are drawn.
  const { data: household } = await supabase
    .from("members")
    .select("id")
    .eq("family_id", me.family_id)
    .not("status", "in", GONE_STATUSES);
  const ids = new Set([me.id, ...(household ?? []).map((m) => m.id)]);
  await supabase
    .from("gift_draw_people")
    .insert([...ids].map((memberId) => ({ draw_id: data.id, member_id: memberId, family_id: me.family_id, added_by: me.id })));
  refresh();
  return { error: null, id: data.id };
}

export async function deleteGiftDrawAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That draw could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("gift_draws").delete().eq("id", id).eq("family_id", me.family_id).select("id");
  refresh();
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "Only a grown-up of the household that started it can call it off." };
  return { error: null };
}

/** Before the draw: the household's settings that change who may pick whom. */
export async function setDrawRulesAction(id: string, rules: { notOwnHousehold?: boolean; revealOnDay?: boolean }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That draw could not be found." };
  const supabase = await createClient();
  const patch: { not_own_household?: boolean; reveal_on_day?: boolean } = {};
  if (rules.notOwnHousehold !== undefined) patch.not_own_household = rules.notOwnHousehold === true;
  if (rules.revealOnDay !== undefined) patch.reveal_on_day = rules.revealOnDay === true;
  const { data, error } = await supabase.from("gift_draws").update(patch).eq("id", id).eq("family_id", me.family_id).select("id");
  refresh(id);
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "Only a grown-up of the household that started it can change that." };
  return { error: null };
}

/** Ask a linked household in (on), or take it out / leave (off). */
export async function setDrawHouseholdAction(id: string, familyId: string, on: boolean): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id) || !UUID.test(familyId)) return { error: "That household could not be found." };
  const supabase = await createClient();
  const { data, error } = on
    ? await supabase.from("gift_draw_households").insert({ draw_id: id, family_id: familyId }).select("draw_id")
    : await supabase.from("gift_draw_households").delete().eq("draw_id", id).eq("family_id", familyId).select("draw_id");
  refresh(id);
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: on ? "That household can't be asked in." : "Only a grown-up can do that, before the draw." };
  return { error: null };
}

/** Put one of your own household in, or take them out, before the draw: a
 * grown-up for anyone in it, a teen only themselves. */
export async function setInDrawAction(id: string, memberId: string, on: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(id) || !UUID.test(memberId)) return { error: "That person could not be found." };
  const supabase = await createClient();
  const { data, error } = on
    ? await supabase.from("gift_draw_people").insert({ draw_id: id, member_id: memberId, family_id: me.family_id, added_by: me.id }).select("id")
    : await supabase.from("gift_draw_people").delete().eq("draw_id", id).eq("member_id", memberId).select("id");
  refresh(id);
  if (error) return { error: error.message.includes("gift_draw_people_once") ? null : databaseError(error) };
  if (!data?.length) return { error: "That can't be changed now: the draw is done, or they're not yours to put in." };
  return { error: null };
}

/** Take a place out of the draw by its own id: a guest by link
 * (20261020231000) has no member row to name. The policy decides who may
 * (their household's grown-ups, before the draw). */
export async function removeDrawPersonAction(id: string, personId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id) || !UUID.test(personId)) return { error: "That person could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("gift_draw_people").delete().eq("draw_id", id).eq("id", personId).select("id");
  refresh(id);
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "That can't be changed now: the draw is done, or they're not yours to take out." };
  return { error: null };
}

/** Draw (or draw again before the day): in the database. */
export async function runGiftDrawAction(id: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That draw could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("draw_gift_draw", { p_draw: id });
  refresh(id);
  return { error: error ? databaseError(error) : null };
}

/** A wish list, one wish a line, replacing what was there: your own, or a
 * grown-up's for their managed child. */
export async function saveWishesAction(id: string, personId: string, text: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(id) || !UUID.test(personId)) return { error: "That wish list could not be found." };
  const wishes = parseWishes(text);
  const supabase = await createClient();
  // The new list goes in before the old one comes out, so a refused insert
  // (taken out of the draw meanwhile, say) leaves the list as it was rather
  // than empty.
  const { data: old, error: read } = await supabase.from("gift_draw_wishes").select("id").eq("person_id", personId);
  if (read) return { error: databaseError(read) };
  if (wishes.length) {
    const { error } = await supabase.from("gift_draw_wishes").insert(wishes.map((body) => ({ draw_id: id, person_id: personId, body })));
    if (error) return { error: databaseError(error) };
  }
  if (old?.length) {
    const { error: cleared } = await supabase.from("gift_draw_wishes").delete().eq("person_id", personId).in("id", old.map((w) => w.id));
    if (cleared) return { error: databaseError(cleared) };
  }
  refresh(id);
  return { error: null };
}
