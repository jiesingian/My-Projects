"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { databaseError } from "@/lib/report-error";
import { clamp } from "@/lib/text";
import { UUID } from "@/lib/ids";
import { PET_KINDS } from "@/lib/pets";
import { addLinesToBuyListAction } from "@/lib/actions/chat";
import type { ActionState } from "@/lib/actions/auth";

export type PetInput = { name: string; kind: string; birthday?: string; food?: string; vet?: string; next_vaccine_on?: string; next_vet_on?: string; notes?: string };

const date = (v: unknown) => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

function petRow(input: PetInput): { row: { name: string; kind: string; birthday: string | null; food: string | null; vet: string | null; next_vaccine_on: string | null; next_vet_on: string | null; notes: string | null } } | { error: string } {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 60) return { error: "Give the pet a name, up to 60 characters." };
  const kind = (PET_KINDS as readonly string[]).includes(input.kind) ? input.kind : "other";
  return {
    row: {
      name,
      kind,
      birthday: date(input.birthday),
      food: clamp(String(input.food ?? "").trim(), 80) || null,
      vet: clamp(String(input.vet ?? "").trim(), 120) || null,
      next_vaccine_on: date(input.next_vaccine_on),
      next_vet_on: date(input.next_vet_on),
      notes: clamp(String(input.notes ?? "").trim(), 500) || null,
    },
  };
}

function revalidate() {
  revalidatePath("/family/pets");
  revalidatePath("/today");
}

export async function savePetAction(id: string | null, input: PetInput): Promise<ActionState> {
  const shaped = petRow(input);
  if ("error" in shaped) return { error: shaped.error };
  if (id && !UUID.test(id)) return { error: "That pet wasn't found." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("pets").update(shaped.row).eq("id", id).eq("family_id", me.family_id)
    : await supabase.from("pets").insert({ ...shaped.row, family_id: me.family_id });
  if (error) return { error: databaseError(error) };
  revalidate();
  return { error: null };
}

export async function deletePetAction(id: string): Promise<ActionState> {
  if (!UUID.test(id)) return { error: "That pet wasn't found." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("pets").delete().eq("id", id).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidate();
  return { error: null };
}

/** The pet's food on To-Buy, as typed on its card ("Pedigree 3kg"). */
export async function addPetFoodToListAction(id: string): Promise<ActionState> {
  if (!UUID.test(id)) return { error: "That pet wasn't found." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: pet } = await supabase.from("pets").select("name, food").eq("id", id).eq("family_id", me.family_id).maybeSingle();
  if (!pet) return { error: "That pet wasn't found." };
  return addLinesToBuyListAction([pet.food?.trim() || `Food for ${pet.name}`]);
}
