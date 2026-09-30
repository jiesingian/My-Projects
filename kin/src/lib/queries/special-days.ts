import { createClient } from "@/lib/supabase/server";
import type { Holiday } from "@/lib/holidays";

export type SpecialDay = Holiday & { id: string };

/** The household's own special days (20260930171000), from `startISO` up to,
 * not including, `endISO`. Row-level security keeps them to the reader's
 * household. */
export async function getHouseholdSpecialDays(familyId: string, startISO: string, endISO: string): Promise<SpecialDay[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("household_special_days")
    .select("id, day, name")
    .eq("family_id", familyId)
    .gte("day", startISO)
    .lt("day", endISO)
    .order("day");
  return (data ?? []).map((d) => ({ id: d.id, date: d.day, name: d.name }));
}
