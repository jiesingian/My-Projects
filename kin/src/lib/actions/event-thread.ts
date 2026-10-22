"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";
import { databaseError } from "@/lib/report-error";
import { clamp } from "@/lib/text";
import { UUID } from "@/lib/ids";
import { sendPush } from "@/lib/push";
import { COMMENT_MAX, threadAudience } from "@/lib/event-thread";

/** A thread on each event (20261014100000_event_comments.sql). The table's
 * policies decide who may read and write -- whoever sees the event, each in
 * their own name; these actions shape the rows and say what went wrong in
 * words. */

export async function addEventCommentAction(eventId: string, body: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const text = clamp(body, COMMENT_MAX);
  if (!UUID.test(eventId)) return { error: "That event could not be found." };
  if (!text) return { error: "Write something first." };
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, title, applies_to_whole_family, event_members(member_id)")
    .eq("id", eventId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!event) return { error: "That event is no longer there." };
  const { data: comment, error } = await supabase.from("event_comments").insert({ event_id: eventId, family_id: me.family_id, member_id: me.id, body: text }).select("id").single();
  if (error) return { error: databaseError(error) };
  revalidatePath("/planner");
  // The event's people hear of it, under their "Events and schedules" switch.
  const audience = threadAudience(event, (event.event_members ?? []).map((em) => em.member_id));
  after(() =>
    sendPush({
      kind: "events",
      title: `${me.full_name.split(" ")[0]} on ${event.title}`,
      body: text,
      url: `/planner/add?type=event&id=${eventId}#thread`,
      tag: `event-thread-${eventId}`,
      source: comment.id,
      memberIds: audience ?? "household",
    }),
  );
  return { error: null };
}

export async function editEventCommentAction(id: string, body: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const text = clamp(body, COMMENT_MAX);
  if (!UUID.test(id)) return { error: "That comment could not be found." };
  if (!text) return { error: "Write something first, or delete it." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("event_comments").update({ body: text }).eq("id", id).eq("member_id", me.id).select("id");
  revalidatePath("/planner");
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "Only your own comments can be edited." };
  return { error: null };
}

export async function deleteEventCommentAction(id: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!UUID.test(id)) return { error: "That comment could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.from("event_comments").delete().eq("id", id).eq("member_id", me.id);
  revalidatePath("/planner");
  return { error: error ? databaseError(error) : null };
}
