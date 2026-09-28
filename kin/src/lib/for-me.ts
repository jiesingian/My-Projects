import { isChild, isGrownUp } from "@/lib/roles";

/** Whether something is yours to be told about (28 September).
 *
 * Jonathan: "it is ok to have visibility on other members' activities ...
 * but unnecessary to get notified by their activities. If this activities
 * are important for the whole family, the activity should be tagged as for
 * the whole family." With a lot of plans each, one parent's Today and pushes
 * filling with the other's appointments buries their own.
 *
 * So Today and the reminders ask this, and the Planner does not: everything
 * stays visible there. Something is yours when it is
 *   - for the whole family, or tagged to nobody in particular;
 *   - tagged to you; or
 *   - you are a grown-up and it is tagged to one of the children, whom the
 *     grown-ups look after (a child with no login of their own has nobody
 *     else to be told).
 * Another grown-up's own plans are theirs alone.
 *
 * The database's reminder functions apply the same rule in SQL
 * (supabase/migrations/20260929012000_reminders_for_me.sql); keep the two
 * in step. */
export type Tagged = { id: string; role?: string | null };

export function isForMe(me: { id: string; role: string }, wholeFamily: boolean, tagged: Tagged[]): boolean {
  if (wholeFamily || tagged.length === 0) return true;
  if (tagged.some((t) => t.id === me.id)) return true;
  return isGrownUp(me.role) && tagged.some((t) => isChild(t.role ?? ""));
}

/** The tagged members of an activity or event row as PostgREST returns them
 * from `activity_members(member_id, members(role))`. */
export function taggedFrom(rows: { member_id: string; members?: unknown }[] | null | undefined): Tagged[] {
  return (rows ?? []).map((r) => ({ id: r.member_id, role: (r.members as { role?: string } | null)?.role ?? null }));
}
