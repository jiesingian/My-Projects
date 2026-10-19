import { createClient } from "@/lib/supabase/server";
import { potluckLines, type PotluckLine } from "@/lib/potluck";

export type Potluck = {
  eventId: string;
  title: string;
  eventDate: string;
  endDate: string | null;
  hostName: string;
  /** The viewer's own household's event. */
  mine: boolean;
  /** Linked households are asked too. */
  relatives: boolean;
  /** Still taking claims: one-off, not over. */
  open: boolean;
  lines: PotluckLine[];
};

/** One event's potluck (20261019170100), as the viewer may see it: the
 * host's event and list, or a linked household's that asks relatives. Null
 * when they may not. Names come from the rows, never from another
 * household's members. */
export async function getPotluck(eventId: string, me: { id: string; family_id: string }): Promise<Potluck | null> {
  const supabase = await createClient();
  const [{ data: events }, { data: items }, { data: claims }] = await Promise.all([
    supabase.rpc("potluck_event", { p_event: eventId }),
    supabase.from("potluck_items").select("id, label, wanted, position").eq("event_id", eventId),
    supabase.from("potluck_claims").select("id, item_id, member_id, member_name, household_name, family_id, qty").eq("event_id", eventId).order("created_at"),
  ]);
  const e = events?.[0];
  if (!e) return null;
  return {
    eventId: e.event_id,
    title: e.title,
    eventDate: e.event_date,
    endDate: e.end_date,
    hostName: e.host_name,
    mine: e.mine,
    relatives: e.relatives,
    open: e.open,
    lines: potluckLines(items ?? [], claims ?? [], { id: me.id, familyId: me.family_id }),
  };
}

export type RelativesPotluck = { eventId: string; title: string; eventDate: string; hostName: string; items: number; openItems: number };

/** Linked households' potlucks this household is asked to, soonest first. */
export async function getRelativesPotlucks(): Promise<RelativesPotluck[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("relatives_potlucks");
  return (data ?? []).map((p) => ({ eventId: p.event_id, title: p.title, eventDate: p.event_date, hostName: p.host_name, items: p.items, openItems: p.open_items }));
}
