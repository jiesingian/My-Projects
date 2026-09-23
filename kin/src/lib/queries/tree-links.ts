import { createClient } from "@/lib/supabase/server";

/** A person in this household's tree who is also in a linked household's,
 * and which household. */
export type TreeMatch = {
  matchId: string;
  /** Our own person in the match. */
  ourPersonId: string;
  otherFamilyName: string;
  status: "pending" | "accepted";
  /** Did we offer them, or were they offered to us? */
  weOffered: boolean;
};

/** A relative from another household's record of a shared person's line. */
export type BranchPerson = {
  id: string;
  fullName: string;
  birthYear: string | null;
  fatherId: string | null;
  motherId: string | null;
  spouseId: string | null;
  isSharedPerson: boolean;
};

export type TreeOffer = { matchId: string; fromFamilyName: string; fullName: string; birthYear: string | null };

/** Every match this household is part of: ours we offered and are waiting
 * on, and ones that were accepted either way. Matches another household
 * offered us and we have not answered yet come from getTreeOffers instead,
 * because until we answer there is no person of ours in them. */
export async function getTreeMatches(familyId: string): Promise<TreeMatch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("family_tree_matches")
    .select("id, offer_family_id, offer_person_id, to_family_id, to_person_id, status")
    .in("status", ["pending", "accepted"]);
  const rows = (data ?? []).filter((r) => r.offer_family_id === familyId || (r.to_family_id === familyId && r.status === "accepted"));
  if (!rows.length) return [];
  const others = [...new Set(rows.map((r) => (r.offer_family_id === familyId ? r.to_family_id : r.offer_family_id)))];
  const { data: families } = await supabase.from("families").select("id, name").in("id", others);
  const name = new Map((families ?? []).map((f) => [f.id, f.name]));
  return rows.map((r) => {
    const weOffered = r.offer_family_id === familyId;
    return {
      matchId: r.id,
      ourPersonId: weOffered ? r.offer_person_id : r.to_person_id!,
      otherFamilyName: name.get(weOffered ? r.to_family_id : r.offer_family_id) ?? "A linked household",
      status: r.status as "pending" | "accepted",
      weOffered,
    };
  });
}

/** Relatives other households have offered us and we have not answered. */
export async function getTreeOffers(): Promise<TreeOffer[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("tree_offers_for_me");
  return (data ?? []).map((o) => ({ matchId: o.match_id, fromFamilyName: o.from_family_name, fullName: o.full_name, birthYear: o.birth_year }));
}

/** Linked households this one could share a relative with. */
export async function getLinkedFamilies(familyId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("family_links").select("requester_family_id, addressee_family_id").eq("status", "accepted");
  const ids = (data ?? []).map((l) => (l.requester_family_id === familyId ? l.addressee_family_id : l.requester_family_id));
  if (!ids.length) return [];
  const { data: families } = await supabase.from("families").select("id, name").in("id", ids);
  return (families ?? []).map((f) => ({ id: f.id, name: f.name }));
}
