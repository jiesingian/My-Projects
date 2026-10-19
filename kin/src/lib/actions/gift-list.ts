"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";
import { UUID } from "@/lib/ids";
import { clamp } from "@/lib/text";
import { isGrownUp } from "@/lib/roles";
import { parseGiftIdea, type GiftKind } from "@/lib/gift-list";

/** Christmas gifts and aguinaldo (20261019233300_gift_list.sql): the
 * household's grown-ups only, and never the person a row is for -- the
 * policies say so; these actions shape the rows and say no in words. */

const refresh = () => revalidatePath("/planner/gifts");
const KINDS: GiftKind[] = ["family", "inaanak", "other"];

function amount(text: string): number | null | "bad" {
  const t = text.replace(/[₱,\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? Math.round(n * 100) / 100 : "bad";
}

export async function addGiftPersonAction(input: { year: number; name: string; memberId: string | null; kind: string; budget: string }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "The gift list is for grown-ups." };
  const name = clamp(input.name, 80);
  if (!name) return { error: "Who is it for?" };
  if (input.memberId && (!UUID.test(input.memberId) || input.memberId === me.id)) return { error: "Choose someone else: your own gifts are for the others to plan." };
  const budget = amount(input.budget);
  if (budget === "bad") return { error: "The budget should be an amount, like 1,000." };
  const year = Math.floor(Number(input.year));
  if (!(year >= 2020 && year <= 2100)) return { error: "Choose a year." };
  const supabase = await createClient();
  const { error } = await supabase.from("gift_list_people").insert({
    family_id: me.family_id,
    year,
    name,
    member_id: input.memberId || null,
    kind: KINDS.includes(input.kind as GiftKind) ? input.kind : "family",
    budget,
    created_by: me.id,
  });
  refresh();
  return { error: error ? humanDatabaseError(error.message) : null };
}

export async function setGiftBudgetAction(personId: string, budget: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(personId)) return { error: "That person could not be found." };
  const value = amount(budget);
  if (value === "bad") return { error: "The budget should be an amount, like 1,000." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("gift_list_people").update({ budget: value }).eq("id", personId).select("id");
  refresh();
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "That person is no longer on the list." };
  return { error: null };
}

export async function removeGiftPersonAction(personId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(personId)) return { error: "That person could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("gift_list_people").delete().eq("id", personId);
  refresh();
  return { error: error ? humanDatabaseError(error.message) : null };
}

/** "Lego set 1,200", "Aguinaldo 500": the idea, its cost, cash or not. */
export async function addGiftIdeaAction(personId: string, text: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(personId)) return { error: "That person could not be found." };
  const parsed = parseGiftIdea(text);
  if (!parsed) return { error: "Write an idea, like “Lego set 1,200” or “Aguinaldo 500”." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("gift_list_items")
    .insert({ family_id: me.family_id, person_id: personId, label: parsed.label, cost: parsed.cost, is_cash: parsed.isCash, created_by: me.id });
  refresh();
  return { error: error ? humanDatabaseError(error.message) : null };
}

export async function setGiftBoughtAction(itemId: string, bought: boolean): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(itemId)) return { error: "That idea could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("gift_list_items").update({ bought: bought === true }).eq("id", itemId).select("id");
  refresh();
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "That idea is no longer on the list." };
  return { error: null };
}

export async function removeGiftIdeaAction(itemId: string): Promise<ActionState> {
  await requireCurrentMember();
  if (!UUID.test(itemId)) return { error: "That idea could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("gift_list_items").delete().eq("id", itemId);
  refresh();
  return { error: error ? humanDatabaseError(error.message) : null };
}
