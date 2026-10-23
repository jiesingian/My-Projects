import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { DoseAlarmSettings } from "@/components/dose-alarm-settings";
import { familyDateTime } from "@/lib/time";

/** Medicine doses as iPhone Clock alarms: the "Kin Alarms" link and the
 * one-time Shortcut setup (lib/dose-alarms.ts). */
export default async function MedicineAlarmsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  // The key lives in a table nobody reads directly, so this asks; a failed
  // read shows it as off, and making a link from there replaces the old one.
  const supabase = await createClient();
  const { data } = await supabase.rpc("dose_alarm_link_state");
  const state = Array.isArray(data) ? data[0] : null;
  const lastRead = state?.last_used_at ? familyDateTime(new Date(state.last_used_at), me.families.time_zone || undefined) : null;

  return (
    <div>
      <DetailHeader backHref="/settings/notifications" eyebrow="Medicine alarms" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <DoseAlarmSettings initialOn={Boolean(state)} lastRead={lastRead} />
      </div>
    </div>
  );
}
