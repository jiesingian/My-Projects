import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/session";
import { getTrackedGoals } from "@/lib/queries/wealth-goals";
import { getMembers } from "@/lib/queries/family";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { isGrownUp } from "@/lib/roles";
import { isGone } from "@/lib/member-status";
import { sendPush } from "@/lib/push";
import { milestoneOf } from "@/lib/wealth-goals";

/** 🎯 milestones (Jonathan, 29 October), after money moves on Wealth: a
 * goal following a balance, a loan or a fund that has passed 25, 50, 75 or
 * 100% since last told says so -- a push to whoever the goal is (its
 * person, or the household's grown-ups), each step once
 * (planner_goals.milestone, 20261029235000), and reaching it goes in the
 * Journal as a milestone. A spending limit or a month's income fills and
 * starts again every month, so neither is celebrated this way. */
export async function celebrateGoalMilestones(): Promise<void> {
  const me = await getCurrentMember();
  if (!me) return;
  const tracked = [...(await getTrackedGoals(me.family_id, me.families.currency)).values()].filter((t) => (t.tracks === "account" || t.tracks === "loan" || t.tracks === "asset") && t.thing);
  if (tracked.length === 0) return;
  const supabase = await createClient();
  const { data: rows } = await supabase.from("planner_goals").select("id, milestone").in("id", tracked.map((t) => t.id));
  const was = new Map((rows ?? []).map((r) => [r.id, r.milestone]));
  const due = tracked.map((t) => ({ t, step: milestoneOf(t.fraction, t.reached) })).filter(({ t, step }) => was.has(t.id) && step > (was.get(t.id) ?? 0));
  if (due.length === 0) return;
  const [members, tz] = await Promise.all([getMembers(me.family_id), householdZone()]);
  const grownUps = members.filter((m) => m.status !== "pending" && !isGone(m.status) && isGrownUp(m.role)).map((m) => m.id);
  for (const { t, step } of due) {
    // Claimed once: another phone moving money at the same moment finds it
    // already set and says nothing.
    const { data: won } = await supabase.from("planner_goals").update({ milestone: step }).eq("id", t.id).eq("milestone", was.get(t.id) ?? 0).select("id");
    if (!won?.length) continue;
    const people = (t.ownerId ? [t.ownerId] : grownUps).filter((id) => id !== me.id);
    if (people.length > 0)
      await sendPush({
        kind: "bills",
        source: `goal-milestone:${t.id}:${step}`,
        memberIds: people,
        title: step === 100 ? `🎯 ${t.title}: reached! 🎉` : `🎯 ${t.title}: ${step === 50 ? "halfway there" : `${step}% there`}`,
        body: t.caption,
        url: "/planner?seg=goals",
        tag: `goal-milestone-${t.id}`,
      });
    if (step === 100) await supabase.from("milestones").insert({ family_id: me.family_id, title: `Reached: ${t.title}`.slice(0, 200), milestone_date: familyDay(new Date(), tz), member_id: t.ownerId, created_by: me.id });
  }
}
