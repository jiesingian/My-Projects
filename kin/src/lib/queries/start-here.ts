import { createClient } from "@/lib/supabase/server";
import { readAccess } from "@/lib/access";
import { isGrownUp } from "@/lib/roles";
import type { CurrentMember } from "@/lib/session";

/** "Start here" on Today (approved 28 September): four first steps for a new
 * family, each ticked off by the family's own records rather than by any
 * checklist of its own -- add something on the calendar anywhere in Kin and
 * the step is done.
 *
 * Shown only to grown-ups, only in households created from the day it
 * shipped (a family that has used Kin for weeks needs no first steps), only
 * for a household's first 30 days, and until the member hides it or all four
 * are done. */

/** Households created before this saw Kin before the card existed. */
const SHOWN_FROM = "2026-09-28T00:00:00Z";
const SHOWN_FOR_DAYS = 30;

export type StartStep = {
  id: "event" | "invite" | "bills" | "chore" | "list";
  title: string;
  hint: string;
  href: string | null;
  done: boolean;
};

export async function getStartHere(me: CurrentMember): Promise<StartStep[] | null> {
  if (!isGrownUp(me.role) || me.start_here_dismissed_at) return null;
  const created = me.families.created_at;
  if (!created || created < SHOWN_FROM) return null;
  if (Date.now() - new Date(created).getTime() > SHOWN_FOR_DAYS * 24 * 60 * 60 * 1000) return null;

  const plus = readAccess(me.families).plus;
  const supabase = await createClient();
  const count = (table: "events" | "activities" | "bills" | "routines" | "buy_items") =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("family_id", me.family_id);
  const [events, activities, people, bills, routines, list] = await Promise.all([
    count("events"),
    count("activities"),
    // Anyone else with a login of their own, or on their way in -- a managed
    // child's profile is not someone who has been invited.
    supabase.from("members").select("id", { count: "exact", head: true }).eq("family_id", me.family_id).in("status", ["active", "pending"]).neq("id", me.id),
    count("bills"),
    count("routines"),
    count("buy_items"),
  ]);

  const steps: StartStep[] = [
    { id: "event", title: "Add this week's plans", hint: "School, work, a birthday: one calendar for everyone.", href: "/planner/add?type=event", done: (events.count ?? 0) + (activities.count ?? 0) > 0 },
    // No link: the card shares the invite itself (start-here.tsx).
    { id: "invite", title: "Invite your partner", hint: "Kin is better with two. They join with one tap.", href: null, done: (people.count ?? 0) > 0 },
    plus
      ? { id: "bills", title: "Add this month's bills", hint: "Kin reminds you the day before each one is due.", href: "/wealth?seg=cashflow", done: (bills.count ?? 0) > 0 }
      : // Wealth is Kin Plus; on Free the third step is one everyone can do.
        { id: "chore", title: "Give the kids a chore", hint: "They earn stars and trade them for rewards.", href: "/planner/routines/new", done: (routines.count ?? 0) > 0 },
    { id: "list", title: "Start the grocery list", hint: "Everyone adds to it; whoever is at the shop ticks it off.", href: "/household?seg=buy&add=1", done: (list.count ?? 0) > 0 },
  ];
  return steps.every((s) => s.done) ? null : steps;
}
