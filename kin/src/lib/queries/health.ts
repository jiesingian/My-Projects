import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { addDays, dosesFor, FEVER_C, highBloodPressure } from "@/lib/health-plan";

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

  // Medicines, their doses from the last week (enough for "today" and
  // "missed yesterday"), the illness log, and which visits have photos.
  const weekAgo = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: medicines }, { data: illness }, { data: visitPhotos }] = await Promise.all([
    supabase.from("health_medicines").select("*").eq("member_id", memberId).order("created_at", { ascending: true }),
    supabase.from("health_illness_logs").select("*").eq("member_id", memberId).order("logged_at", { ascending: false }).limit(60),
    supabase.from("health_visit_photos").select("appointment_id").in("appointment_id", (appointments ?? []).map((a) => a.id)),
  ]);
  const { data: doses } = medicines?.length
    ? await supabase.from("health_medicine_doses").select("medicine_id, dose_date, dose_time").in("medicine_id", medicines.map((m) => m.id)).gte("dose_date", weekAgo)
    : { data: [] };
  const photoCount = new Map<string, number>();
  for (const p of visitPhotos ?? []) photoCount.set(p.appointment_id, (photoCount.get(p.appointment_id) ?? 0) + 1);

  return {
    member,
    schedule: schedule ?? [],
    appointments: appointments ?? [],
    conditions: conditions ?? [],
    labs: labs ?? [],
    vitals: vitals ?? [],
    omron,
    medicines: medicines ?? [],
    doses: doses ?? [],
    illness: illness ?? [],
    photoCount,
  };
}

export function buildBarSeries(
  points: { reading_date: string; value_text: string }[],
  parse: (v: string) => number,
  floorPct = 20,
  dateFormat?: string,
) {
  if (points.length === 0) return [];
  const nums = points.map((p) => parse(p.value_text));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  return points.map((p, i) => ({
    label: formatDate(p.reading_date, dateFormat).slice(0, 5),
    value: p.value_text,
    heightPct: Math.round(floorPct + ((nums[i] - min) / range) * (100 - floorPct)),
  }));
}

export type WeekItem = { memberId: string; firstName: string; text: string; href: string; tone: "alert" | "info" };

/** The Health tab's "This week": what needs someone across the household,
 * in one short list -- check-ups and vaccinations due within a week, visits
 * coming up, medicine doses missed yesterday or late today, a fever in the
 * last three days, and a latest blood pressure that is high. Each line opens
 * the place to deal with it. Read under the caller's own RLS, so nobody sees
 * a line about a record they couldn't open. */
export async function getHealthWeek(familyId: string, today: string, now: string): Promise<WeekItem[]> {
  const supabase = await createClient();
  const inWeek = addDays(today, 7);
  const yesterday = addDays(today, -1);
  const [{ data: members }, { data: schedule }, { data: visits }, { data: medicines }, { data: fevers }, { data: bp }] = await Promise.all([
    supabase.from("members").select("id, full_name, status").eq("family_id", familyId),
    supabase.from("health_schedule").select("member_id, what, when_date, status").eq("family_id", familyId).in("status", ["due", "due_soon", "planned", "scheduled"]).lte("when_date", inWeek),
    supabase.from("health_appointments").select("member_id, what, when_at").eq("family_id", familyId).gte("when_at", `${today}T00:00:00+08:00`).lte("when_at", `${inWeek}T23:59:59+08:00`),
    supabase.from("health_medicines").select("id, member_id, name, dose, times, start_date, end_date").eq("family_id", familyId),
    supabase.from("health_illness_logs").select("member_id, temperature_c, logged_at").eq("family_id", familyId).gte("temperature_c", FEVER_C).gte("logged_at", `${addDays(today, -3)}T00:00:00+08:00`).order("temperature_c", { ascending: false }),
    supabase.from("health_vitals").select("member_id, value_text, reading_date").eq("family_id", familyId).eq("vital_type", "blood_pressure").order("reading_date", { ascending: false }).limit(40),
  ]);
  const { data: doses } = medicines?.length
    ? await supabase.from("health_medicine_doses").select("medicine_id, dose_date, dose_time").in("medicine_id", medicines.map((m) => m.id)).gte("dose_date", yesterday)
    : { data: [] };

  const people = new Map((members ?? []).filter((m) => m.status !== "removed" && m.status !== "pending").map((m) => [m.id, m.full_name.split(" ")[0]]));
  const items: WeekItem[] = [];
  const add = (memberId: string, text: string, seg: string, tone: WeekItem["tone"]) => {
    const firstName = people.get(memberId);
    if (firstName) items.push({ memberId, firstName, text, href: `/family/members/${memberId}?view=health&seg=${seg}`, tone });
  };

  for (const m of [...people.keys()]) {
    const mine = (medicines ?? []).filter((x) => x.member_id === m);
    if (!mine.length) continue;
    const missed = dosesFor(mine, doses ?? [], yesterday, null, true).filter((d) => !d.taken).length;
    const late = dosesFor(mine, doses ?? [], today, now).filter((d) => d.late).length;
    if (missed) add(m, `${missed} dose${missed === 1 ? "" : "s"} not ticked yesterday`, "medicines", "alert");
    if (late) add(m, `${late} dose${late === 1 ? "" : "s"} late today`, "medicines", "alert");
  }
  const feverSeen = new Set<string>();
  for (const f of fevers ?? []) {
    if (feverSeen.has(f.member_id)) continue;
    feverSeen.add(f.member_id);
    add(f.member_id, `Fever up to ${Number(f.temperature_c).toFixed(1)}°C in the last 3 days`, "illness", "alert");
  }
  const bpSeen = new Set<string>();
  for (const r of bp ?? []) {
    if (bpSeen.has(r.member_id)) continue;
    bpSeen.add(r.member_id);
    if (highBloodPressure(r.value_text)) add(r.member_id, `Last blood pressure ${r.value_text} is high`, "vitals", "alert");
  }
  for (const s of schedule ?? []) add(s.member_id, `${s.what}${s.when_date ? (s.when_date < today ? " is overdue" : ` due ${formatDate(s.when_date)}`) : " due"}`, "schedule", s.when_date && s.when_date < today ? "alert" : "info");
  for (const v of visits ?? []) add(v.member_id, `${v.what}, ${formatDate(v.when_at.slice(0, 10))}`, "schedule", "info");
  return items.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "alert" ? -1 : 1));
}
