import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export async function getMemberDetail(memberId: string, familyId: string) {
  const supabase = await createClient();
  const [{ data: member }, { data: schedule }, { data: appointments }, { data: conditions }, { data: labs }, { data: vitals }, { data: omron }] =
    await Promise.all([
      supabase.from("members").select("*").eq("id", memberId).eq("family_id", familyId).maybeSingle(),
      supabase
        .from("health_schedule")
        .select("*")
        .eq("member_id", memberId)
        .order("when_date", { ascending: true }),
      supabase
        .from("health_appointments")
        .select("*")
        .eq("member_id", memberId)
        .order("when_at", { ascending: true }),
      supabase
        .from("health_conditions")
        .select("*, health_condition_entries(*)")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false }),
      supabase.from("health_labs").select("*").eq("member_id", memberId).order("test_date", { ascending: false }),
      supabase.from("health_vitals").select("*").eq("member_id", memberId).order("reading_date", { ascending: true }),
      supabase.from("omron_links").select("*").eq("member_id", memberId).maybeSingle(),
    ]);

  return { member, schedule: schedule ?? [], appointments: appointments ?? [], conditions: conditions ?? [], labs: labs ?? [], vitals: vitals ?? [], omron };
}

export function buildBarSeries(
  points: { reading_date: string; value_text: string }[],
  parse: (v: string) => number,
  floorPct = 20,
) {
  if (points.length === 0) return [];
  const nums = points.map((p) => parse(p.value_text));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  return points.map((p, i) => ({
    label: formatDate(p.reading_date).slice(0, 5),
    value: p.value_text,
    heightPct: Math.round(floorPct + ((nums[i] - min) / range) * (100 - floorPct)),
  }));
}
