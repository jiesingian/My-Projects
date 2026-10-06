"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";
import type { BranchPerson } from "@/lib/queries/tree-links";

// Every rule here lives in the database functions these call -- offering only
// your own people, only to a linked household, answering only offers made to
// you -- because the browser holds the anon key and could call them directly.
// What these add is words for the errors and a refresh of the page.

export async function offerTreePersonAction(personId: string, toFamilyId: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("offer_tree_person", { person: personId, to_family: toFamilyId });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  return { error: null };
}

export async function respondTreeOfferAction(matchId: string, accept: boolean, theirPersonId: string | null): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_tree_offer", { match: matchId, accept, their_person: theirPersonId });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  return { error: null };
}

export async function withdrawTreeMatchAction(matchId: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_tree_match", { match: matchId });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  return { error: null };
}

/** "Same person" on a suggestion. Never links on one household's word: when
 * the other household has already offered their person, this accepts that
 * offer as ours; otherwise it offers ours to them, and they decide. */
export async function confirmTreeSuggestionAction(ourPersonId: string, otherFamilyId: string, theirOfferId: string | null): Promise<ActionState & { linked?: boolean }> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = theirOfferId
    ? await supabase.rpc("respond_tree_offer", { match: theirOfferId, accept: true, their_person: ourPersonId })
    : await supabase.rpc("offer_tree_person", { person: ourPersonId, to_family: otherFamilyId });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  return { error: null, linked: !!theirOfferId };
}

/** "Not the same": that pair is never suggested to this household again. */
export async function dismissTreeSuggestionAction(ourPersonId: string, otherPersonId: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_tree_suggestion", { p_person: ourPersonId, p_other_person: otherPersonId });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  return { error: null };
}

/** The other household's record of a shared person's blood line, fetched
 * when somebody asks to see it rather than on every visit to the tree. */
export async function getSharedBranchAction(matchId: string): Promise<{ error: string | null; people: BranchPerson[] }> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shared_branch", { match: matchId });
  if (error) return { error: humanDatabaseError(error.message), people: [] };
  return {
    error: null,
    people: (data ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      birthYear: p.birth_year,
      fatherId: p.father_id,
      motherId: p.mother_id,
      spouseId: p.spouse_id,
      isSharedPerson: p.is_shared_person,
    })),
  };
}
