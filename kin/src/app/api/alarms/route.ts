import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { buildAlarms, type AlarmActivity, type AlarmAppointment, type AlarmBill, type AlarmMedicine } from "@/lib/alarms";
import { reportError } from "@/lib/report-error";
import { FAMILY_TZ } from "@/lib/time";

/** The member's alarms for the next two weeks (lib/alarms.ts), for the Kin
 * iPhone app to hand to AlarmKit (kin/native). Asked by the web page inside
 * the app, so it carries the member's own session: everything is read
 * through row-level security as them, and a medicine, plan, check-up or bill
 * they may not see makes no alarm. Read-only; nothing is stored. */
export async function GET() {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  const me = await getCurrentMember();
  if (!me) return json({ alarms: [] }, 401);

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [meds, picks] = await Promise.all([
    supabase
      .from("health_medicines")
      .select("id, name, dose, times, start_date, end_date, member_id, visibility, created_by, member:member_id(full_name, role, status)")
      .eq("family_id", me.family_id),
    supabase.from("alarm_picks").select("kind, item_id"),
  ]);
  if (meds.error || picks.error) {
    reportError("Alarms: read failed", meds.error ?? picks.error);
    return json({ alarms: [] }, 503);
  }
  const ids = (kind: string) => (picks.data ?? []).filter((p) => p.kind === kind).map((p) => p.item_id);
  const [acts, visits, bills] = await Promise.all([
    ids("activity").length
      ? supabase.from("activities").select("id, title, start_at, status, location, repeat, repeat_days, repeat_until").in("id", ids("activity"))
      : Promise.resolve({ data: [], error: null }),
    ids("appointment").length
      ? supabase
          .from("health_appointments")
          .select("id, what, when_at, where_text, member_id, member:members!health_appointments_member_id_fkey(full_name)")
          .in("id", ids("appointment"))
          .gte("when_at", nowIso)
      : Promise.resolve({ data: [], error: null }),
    ids("bill").length
      ? supabase.from("bills").select("id, name, amount, due_date, status").in("id", ids("bill"))
      : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = acts.error ?? visits.error ?? bills.error;
  if (failed) {
    reportError("Alarms: read failed", failed);
    return json({ alarms: [] }, 503);
  }

  const prefs = (me.notification_prefs ?? {}) as Record<string, boolean>;
  const alarms = buildAlarms({
    now: new Date(),
    tz: me.families.time_zone || FAMILY_TZ,
    me: { id: me.id, role: me.role, firstName: (me.full_name ?? "").split(" ")[0] },
    dosesOn: prefs.health !== false,
    medicines: (meds.data ?? []) as unknown as AlarmMedicine[],
    activities: (acts.data ?? []) as unknown as AlarmActivity[],
    appointments: (visits.data ?? []) as unknown as AlarmAppointment[],
    bills: (bills.data ?? []) as unknown as AlarmBill[],
  });
  return json({ alarms });
}
