import { householdZone } from "@/lib/household-zone";
import { createClient } from "@/lib/supabase/server";
import { familyDay } from "@/lib/time";
import { getPaluwagans, getUtang } from "@/lib/queries/utang";
import { wealthRows, type WealthRows } from "@/lib/today-wealth";

/** Wealth's part of Today (23 October): what the reader may see under their
 * own policies -- the household's joint things, their own, and the other
 * grown-ups' shared ones; "just me" rows stay with their owner. The page
 * asks only for a grown-up with Wealth, the rule bills already follow. */
export async function getTodayWealth(me: { id: string; family_id: string; families: { currency: string } }): Promise<WealthRows> {
  const supabase = await createClient();
  const tz = await householdZone();
  const today = familyDay(new Date(), tz);
  const [utang, paluwagans, { data: loans }, { data: funds }, { data: income }, { data: marks }, { data: assets }] = await Promise.all([
    getUtang(me.family_id, me.id),
    getPaluwagans(me.family_id, me.id),
    // With a schedule, or a fixed rate that ends (20261026170000).
    supabase.from("liabilities").select("id, name, monthly_payment, next_payment_date, payments_remaining, rate_fixed_until").eq("family_id", me.family_id).or("next_payment_date.not.is.null,rate_fixed_until.not.is.null"),
    supabase.from("goals").select("id, title, target_amount, current_amount, target_date, repeats_yearly, created_at").eq("family_id", me.family_id).not("target_date", "is", null),
    supabase.from("income_schedules").select("id, name, amount, next_date, status").eq("family_id", me.family_id).eq("status", "expected").not("next_date", "is", null),
    supabase.from("today_marks").select("item_key, state").eq("family_id", me.family_id).eq("day", today),
    // When each asset's value was last set, for the yearly check.
    supabase.from("assets").select("id, name, valued_on, annual_change_pct").eq("family_id", me.family_id),
  ]);
  const rows = wealthRows(
    { utang, paluwagans, loans: loans ?? [], funds: funds ?? [], income: (income ?? []).map((x) => ({ ...x, amount: Number(x.amount) })), assets: assets ?? [] },
    today,
    me.families.currency,
  );
  // Skipped today (today_marks), as the briefing's own rows are.
  const marked = new Map((marks ?? []).map((m) => [m.item_key, m.state as "done" | "skipped"]));
  return { today: rows.today.map((r) => ({ ...r, mark: marked.get(r.id) })), soon: rows.soon };
}
