import { createClient } from "@/lib/supabase/server";
import type { GiftKind, GiftPerson } from "@/lib/gift-list";

export type GiftListPerson = GiftPerson & { memberId: string | null };

/** The household's gift list for a year (20261019170300), as the viewer may
 * see it -- a grown-up's, without anything for themselves -- and which ideas
 * already have their spend recorded in Wealth. */
export async function getGiftList(familyId: string, year: number): Promise<{ people: GiftListPerson[]; recorded: Set<string> }> {
  const supabase = await createClient();
  const { data: people } = await supabase
    .from("gift_list_people")
    .select("id, name, kind, budget, member_id, created_at, gift_list_items(id, label, cost, is_cash, bought, created_at)")
    .eq("family_id", familyId)
    .eq("year", year)
    .order("created_at");
  const itemIds = (people ?? []).flatMap((p) => (p.gift_list_items ?? []).map((i) => i.id));
  const { data: spends } = itemIds.length
    ? await supabase.from("wealth_transactions").select("source_id").eq("family_id", familyId).eq("source_table", "gift_list_items").in("source_id", itemIds)
    : { data: [] as { source_id: string | null }[] };
  return {
    people: (people ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind as GiftKind,
      budget: p.budget,
      memberId: p.member_id,
      items: [...(p.gift_list_items ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((i) => ({ id: i.id, label: i.label, cost: i.cost, isCash: i.is_cash, bought: i.bought })),
    })),
    recorded: new Set((spends ?? []).map((s) => s.source_id).filter((v): v is string => !!v)),
  };
}
