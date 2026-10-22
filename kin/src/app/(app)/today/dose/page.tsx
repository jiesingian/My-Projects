import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { doseFromParams } from "@/lib/dose-alarm";
import { DoseAlarm } from "@/components/dose-alarm";

export const dynamic = "force-dynamic";

/** Where a medicine reminder lands (22 October): the dose as an alarm clock
 * would show it -- the whole screen, an alarm sound, and one tap to say it is
 * taken. The medicine is read under the viewer's own RLS, so a dose they may
 * not see sends them to Today instead. */
export default async function DoseAlarmPage({ searchParams }: { searchParams: Promise<{ med?: string; day?: string; time?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const dose = doseFromParams(await searchParams);
  if (!dose) redirect("/today");

  const supabase = await createClient();
  const [{ data: med }, { data: taken }] = await Promise.all([
    supabase.from("health_medicines").select("id, name, dose, member_id, members:member_id(full_name)").eq("id", dose.medicineId).maybeSingle(),
    supabase.from("health_medicine_doses").select("medicine_id").eq("medicine_id", dose.medicineId).eq("dose_date", dose.day).eq("dose_time", dose.time).maybeSingle(),
  ]);
  if (!med) redirect("/today");
  const first = ((med.members as unknown as { full_name: string } | null)?.full_name ?? "").split(" ")[0] || "Someone";
  const whose = med.member_id === me.id ? "your" : `${first}'s`;

  return (
    <DoseAlarm
      medicineId={med.id}
      memberId={med.member_id}
      day={dose.day}
      time={dose.time}
      title={`Time for ${whose} ${med.name}`}
      detail={[med.dose, dose.time].filter(Boolean).join(" · ")}
      alreadyTaken={!!taken}
    />
  );
}
