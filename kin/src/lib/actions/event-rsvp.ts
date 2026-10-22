"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { databaseError } from "@/lib/report-error";
import { UUID } from "@/lib/ids";
import { isRsvpAnswer } from "@/lib/event-rsvp";

/** Who's coming (20261014090000_event_rsvps.sql): answer Going, Maybe or
 * Can't go for yourself, or -- a grown-up -- for a managed child; `null`
 * takes the answer back. The policies decide who may and until when (the
 * event's last day); this only says no in words when they do. */
export async function setRsvpAction(eventId: string, memberId: string, answer: string | null): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(eventId) || !UUID.test(memberId)) return { error: "That event could not be found." };
  if (answer !== null && !isRsvpAnswer(answer)) return { error: "Choose Going, Maybe or Can't go." };
  const supabase = await createClient();
  const { data, error } =
    answer === null
      ? await supabase.from("event_rsvps").delete().eq("event_id", eventId).eq("member_id", memberId).select("event_id")
      : await supabase
          .from("event_rsvps")
          .upsert({ event_id: eventId, member_id: memberId, family_id: me.family_id, answer, answered_by: me.id, updated_at: new Date().toISOString() }, { onConflict: "event_id,member_id" })
          .select("event_id");
  revalidatePath("/planner");
  if (error) return { error: databaseError(error) };
  // An update the policies filtered out comes back empty rather than as an
  // error: the event is over, or this isn't someone you can answer for.
  if (!data?.length && answer !== null) return { error: "Answers are closed for this event." };
  return { error: null };
}
