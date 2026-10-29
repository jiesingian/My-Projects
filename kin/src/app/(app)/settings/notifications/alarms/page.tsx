import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { AlarmSettings, type AlarmChoice } from "@/components/alarm-settings";
import { occurrenceStarts } from "@/lib/activity-repeat";
import { ALARM_DAYS } from "@/lib/alarms";
import { addDays, familyClock, familyDay, FAMILY_TZ, readableDay } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Settings -> Notifications -> Alarms (29 October): what rings like the
 * Clock app in the Kin iPhone app. Medicine doses follow the Health
 * reminders switch; each plan, check-up and bill in the next two weeks has
 * its own switch, for this member alone (alarm_picks; lib/alarms.ts). */
export default async function AlarmsSettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const tz = me.families.time_zone || FAMILY_TZ;
  const now = new Date();
  const today = familyDay(now, tz);
  const last = addDays(today, ALARM_DAYS - 1) ?? today;
  const end = new Date(now.getTime() + ALARM_DAYS * 86_400_000).toISOString();

  const supabase = await createClient();
  const [acts, visits, bills, picks] = await Promise.all([
    supabase
      .from("activities")
      .select("id, title, start_at, status, repeat, repeat_days, repeat_until")
      .eq("family_id", me.family_id)
      .eq("status", "upcoming")
      .lt("start_at", end)
      .or(`start_at.gte.${now.toISOString()},repeat.neq.once`)
      .order("start_at", { ascending: true })
      .limit(60),
    supabase
      .from("health_appointments")
      .select("id, what, when_at, member:members!health_appointments_member_id_fkey(full_name)")
      .eq("family_id", me.family_id)
      .gte("when_at", now.toISOString())
      .lt("when_at", end)
      .order("when_at", { ascending: true }),
    supabase
      .from("bills")
      .select("id, name, due_date, status")
      .eq("family_id", me.family_id)
      .in("status", ["unpaid", "overdue", "scheduled"])
      .gte("due_date", today)
      .lte("due_date", last)
      .order("due_date", { ascending: true }),
    supabase.from("alarm_picks").select("kind, item_id"),
  ]);
  const picked = new Set((picks.data ?? []).map((p) => `${p.kind}:${p.item_id}`));
  const when = (at: Date) => `${readableDay(familyDay(at, tz))}, ${familyClock(at, tz)}`;

  const plans: AlarmChoice[] = (acts.data ?? []).flatMap((a) => {
    const next = occurrenceStarts(a, new Date(a.start_at), today, last, tz).find((s) => s > now);
    return next ? [{ kind: "activity", id: a.id, title: a.title, when: `${a.repeat && a.repeat !== "once" ? "Next " : ""}${when(next)}`, on: picked.has(`activity:${a.id}`) }] : [];
  });
  const checkups: AlarmChoice[] = (visits.data ?? []).map((v) => {
    const who = ((v.member as unknown as { full_name: string } | null)?.full_name ?? "").split(" ")[0];
    return { kind: "appointment", id: v.id, title: who ? `${who}: ${v.what}` : v.what, when: when(new Date(v.when_at)), on: picked.has(`appointment:${v.id}`) };
  });
  const due: AlarmChoice[] = (bills.data ?? []).map((b) => ({ kind: "bill", id: b.id, title: b.name, when: `Due ${readableDay(b.due_date!)}`, on: picked.has(`bill:${b.id}`) }));
  const prefs = (me.notification_prefs ?? {}) as Record<string, boolean>;

  return (
    <div>
      <DetailHeader backHref="/settings/notifications" eyebrow="Alarms" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <AlarmSettings dosesOn={prefs.health !== false} plans={plans} checkups={checkups} bills={due} />
      </div>
    </div>
  );
}
