import { householdZone } from "@/lib/household-zone";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { createClient } from "@/lib/supabase/server";
import { readAccess } from "@/lib/access";
import { shortNames, selfLabel } from "@/lib/format";
import { familyDay } from "@/lib/time";
import { GoalForm } from "./goal-form";
import { isGone } from "@/lib/member-status";

export default async function NewGoalPage() {
  const tz = await householdZone();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const supabase = await createClient();
  const [members, { data: savings }] = await Promise.all([
    getMembers(me.family_id),
    // Whatever savings goals this member can see on Wealth -- the policy on
    // goals already hides someone else's private one.
    supabase.from("goals").select("id, title").eq("family_id", me.family_id).order("created_at", { ascending: false }),
  ]);
  const active = members.filter((m) => m.status !== "pending" && !isGone(m.status));
  const labels = shortNames(active.map((m) => m.full_name)).map((l, i) => selfLabel(l, active[i].id === me.id));

  return (
    <GoalForm
      people={active.map((m, i) => ({ id: m.id, label: labels[i] }))}
      meId={me.id}
      savings={(savings ?? []).map((s) => ({ id: s.id, title: s.title }))}
      plus={readAccess(me.families).plus}
      currency={me.families.currency}
      today={familyDay(new Date(), tz)}
    />
  );
}
