import { householdZone } from "@/lib/household-zone";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { createClient } from "@/lib/supabase/server";
import { shortNames, selfLabel } from "@/lib/format";
import { familyDay } from "@/lib/time";
import { isGoalKind, isGoalPeriod } from "@/lib/goals";
import { GoalEditForm } from "./goal-edit-form";

export default async function EditGoalPage({ params }: { params: Promise<{ id: string }> }) {
  const tz = await householdZone();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: goal }, { data: reward }, members] = await Promise.all([
    supabase.from("planner_goals").select("*").eq("id", id).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("planner_goal_rewards").select("title, status, giver_member_id").eq("goal_id", id).maybeSingle(),
    getMembers(me.family_id),
  ]);
  if (!goal || !isGoalKind(goal.kind) || !isGoalPeriod(goal.period)) notFound();

  const active = members.filter((m) => m.status !== "pending" && m.status !== "removed");
  const labels = shortNames(active.map((m) => m.full_name)).map((l, i) => selfLabel(l, active[i].id === me.id));
  const inPlay = reward && (reward.status === "pending" || reward.status === "approved");
  const giverIdx = inPlay ? active.findIndex((m) => m.id === reward.giver_member_id) : -1;

  return (
    <GoalEditForm
      goal={{ id: goal.id, title: goal.title, kind: goal.kind, target: Number(goal.target), period: goal.period, unit: goal.unit, dueDate: goal.due_date }}
      meId={me.id}
      currency={me.families.currency}
      today={familyDay(new Date(), tz)}
      // Who has to say yes to a change, when it is not the editor.
      giverName={inPlay && reward.giver_member_id !== me.id ? (giverIdx >= 0 ? labels[giverIdx] : "whoever gives the reward") : null}
      // A reward can be added when there is none in play. Nobody gives
      // themselves one, so the owner is not offered as a giver.
      givers={inPlay ? null : active.map((m, i) => ({ id: m.id, label: labels[i] })).filter((p) => p.id !== goal.owner_member_id)}
    />
  );
}
