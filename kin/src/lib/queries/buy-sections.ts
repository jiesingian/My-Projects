import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { guessSection } from "@/lib/grocery";
import { normalizeKey } from "@/lib/pricebook";

/** How far back a household's own list is read for the section it last
 * filed a name under. Plenty for a family's usual groceries; it only bounds
 * the read. */
const LOOKBACK = 1000;

/** The section each name was last filed under by this household, newest
 * first, leaving out "Other". Moving "kangkong" to Produce once means the
 * next "kangkong" lands in Produce, whatever the keyword table thinks (the
 * feature guide, 23 October: names Kin did not know went to Other every time).
 * Read as the member, so row-level security keeps it to their household. */
export async function rememberedSections(supabase: SupabaseClient<Database>, familyId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("buy_items")
    .select("name, section")
    .eq("family_id", familyId)
    .neq("section", "Other")
    .order("created_at", { ascending: false })
    .limit(LOOKBACK);
  const byKey = new Map<string, string>();
  for (const row of data ?? []) {
    const key = normalizeKey(row.name);
    if (row.section && !byKey.has(key)) byKey.set(key, row.section);
  }
  return byKey;
}

/** The household's own choice for a name first, then the keyword guess. */
export function sectionFor(name: string, remembered: Map<string, string>): string {
  return remembered.get(normalizeKey(name)) ?? guessSection(name);
}

/** The same for one name, read with one small query: what a single add uses. */
export async function rememberedSectionFor(supabase: SupabaseClient<Database>, familyId: string, name: string): Promise<string> {
  const pattern = name.trim().replace(/\s+/g, " ").replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await supabase
    .from("buy_items")
    .select("section")
    .eq("family_id", familyId)
    .ilike("name", pattern)
    .neq("section", "Other")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.section ?? guessSection(name);
}
