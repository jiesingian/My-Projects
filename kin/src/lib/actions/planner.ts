"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars, removeRowFromCalendars, type CalendarTarget } from "@/lib/actions/calendar-sync";
import type { ActionState } from "@/lib/actions/auth";
import { familyDay } from "@/lib/time";
import { allDayEvent } from "@/lib/calendar-shape";
import { humanDatabaseError } from "@/lib/db-errors";
import { activityInstants } from "@/lib/planner-time";
import { clamp } from "@/lib/text";

function activityTarget(wholeFamily: boolean, who: string[]): CalendarTarget {
  return wholeFamily ? { kind: "all" } : { kind: "members", memberIds: who };
}

export async function createActivityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = clamp(String(formData.get("title") ?? ""), 150);
  const date = String(formData.get("date") ?? "");
  const from = String(formData.get("from") ?? "09:00");
  const to = String(formData.get("to") ?? "");
  const repeat = String(formData.get("repeat") ?? "once");
  const location = clamp(String(formData.get("location") ?? ""), 200) || null;
  const notes = clamp(String(formData.get("notes") ?? ""), 1000) || null;
  const wholeFamily = formData.get("whole_family") === "on";
  const who = formData.getAll("who").map(String);

  if (!title || !date) return { error: "Title and date are required." };
  const when = activityInstants(date, from, to);
  if ("error" in when) return { error: when.error };

  const { data: activity, error } = await supabase
    .from("activities")
    .insert({
      family_id: me.family_id,
      title,
      start_at: when.startAt.toISOString(),
      end_at: when.endAt ? when.endAt.toISOString() : null,
      repeat,
      location,
      notes,
      applies_to_whole_family: wholeFamily,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: humanDatabaseError(error.message) };

  if (!wholeFamily && who.length > 0) {
    const { error: whoError } = await supabase
      .from("activity_members")
      .insert(who.map((memberId) => ({ activity_id: activity.id, member_id: memberId })));
    if (whoError) return { error: `The activity was saved, but not who it is for. ${whoError.message}` };
  }

  await syncRowToCalendars(
    me.family_id,
    "activities",
    activity.id,
    { title, startAt: when.startAt, endAt: when.endAt, location },
    activityTarget(wholeFamily, who),
  );

  revalidatePath("/planner");
  redirect("/planner?seg=calendar");
}

export async function updateActivityAction(activityId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = clamp(String(formData.get("title") ?? ""), 150);
  const date = String(formData.get("date") ?? "");
  const from = String(formData.get("from") ?? "09:00");
  const to = String(formData.get("to") ?? "");
  const repeat = String(formData.get("repeat") ?? "once");
  const location = clamp(String(formData.get("location") ?? ""), 200) || null;
  const notes = clamp(String(formData.get("notes") ?? ""), 1000) || null;
  const wholeFamily = formData.get("whole_family") === "on";
  const who = formData.getAll("who").map(String);

  if (!title || !date) return { error: "Title and date are required." };
  const when = activityInstants(date, from, to);
  if ("error" in when) return { error: when.error };

  const { error, count } = await supabase
    .from("activities")
    .update(
      {
        title,
        start_at: when.startAt.toISOString(),
        end_at: when.endAt ? when.endAt.toISOString() : null,
        repeat,
        location,
        notes,
        applies_to_whole_family: wholeFamily,
      },
      { count: "exact" },
    )
    .eq("id", activityId)
    .eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  // An update that matches nothing is not an error, so without this the form
  // said "saved" over an activity somebody else had already removed. `count`
  // rather than `.select()` deliberately: asking for the rows back adds a
  // RETURNING clause, and a row the write policy allows but the read policy
  // refuses is rolled back whole -- the trap this codebase has already been
  // caught by twice.
  if (count === 0) return { error: "That activity is no longer there — someone may have removed it." };

  // Clearing and re-inserting is two statements. If the second fails after the
  // first has succeeded the activity is left marked for nobody, which looks
  // from the outside exactly like a save that worked.
  const { error: clearWho } = await supabase.from("activity_members").delete().eq("activity_id", activityId);
  if (clearWho) return { error: clearWho.message };
  if (!wholeFamily && who.length > 0) {
    const { error: whoError } = await supabase
      .from("activity_members")
      .insert(who.map((memberId) => ({ activity_id: activityId, member_id: memberId })));
    if (whoError) return { error: `The activity was saved, but it is no longer marked for anyone. ${whoError.message}` };
  }

  await syncRowToCalendars(
    me.family_id,
    "activities",
    activityId,
    { title, startAt: when.startAt, endAt: when.endAt, location },
    activityTarget(wholeFamily, who),
  );

  revalidatePath("/planner");
  redirect("/planner?seg=calendar");
}

export async function deleteActivityAction(activityId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  await removeRowFromCalendars(me.family_id, "activities", activityId);
  const { error } = await supabase.from("activities").delete().eq("id", activityId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/planner");
  return { error: null };
}

/** Replace the people a record concerns. A whole-family record keeps no rows
 * at all: the flag says everyone, and a list beside it could only drift. */
async function saveEventMembers(eventId: string, memberIds: string[]): Promise<string | null> {
  const supabase = await createClient();
  const { error: cleared } = await supabase.from("event_members").delete().eq("event_id", eventId);
  if (cleared) return cleared.message;
  if (memberIds.length === 0) return null;
  const { error } = await supabase.from("event_members").insert(memberIds.map((member_id) => ({ event_id: eventId, member_id })));
  return error ? `It was saved, but it is no longer marked for anyone. ${error.message}` : null;
}

/** Who a dated record reaches on Google Calendar: everyone, or just the
 * people named on it. */
function targetFor(wholeFamily: boolean, memberIds: string[]) {
  return wholeFamily || memberIds.length === 0 ? ({ kind: "all" } as const) : ({ kind: "members", memberIds } as const);
}

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = clamp(String(formData.get("title") ?? ""), 150);
  const date = String(formData.get("date") ?? "");
  const kind = String(formData.get("kind") ?? "other");
  const subNote = clamp(String(formData.get("sub_note") ?? ""), 200) || null;
  const recursYearly = kind === "birthday" || kind === "anniversary";
  // Travel is a kind of event rather than its own table, and the only thing
  // it really needs that the others do not is a second date.
  const endDate = String(formData.get("end_date") ?? "") || null;
  const budgetRaw = String(formData.get("budget_amount") ?? "").trim();
  const budget = budgetRaw ? Number(budgetRaw) : null;
  const wholeFamily = formData.get("whole_family") === "on";
  const who = formData.getAll("who").map(String).filter(Boolean);
  if (!title || !date) return { error: "Title and date are required." };
  if (!wholeFamily && who.length === 0) return { error: "Choose who this is for, or mark it for the whole family." };
  if (endDate && endDate < date) return { error: "The end date is before the start date." };
  if (budget !== null && !(budget >= 0)) return { error: "The budget has to be a number." };

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      family_id: me.family_id,
      title,
      event_date: date,
      end_date: endDate,
      budget_amount: budget,
      kind,
      sub_note: subNote,
      recurs_yearly: recursYearly,
      applies_to_whole_family: wholeFamily,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: humanDatabaseError(error.message) };

  const eventWho = await saveEventMembers(event.id, wholeFamily ? [] : who);
  if (eventWho) return { error: eventWho };
  await syncRowToCalendars(
    me.family_id,
    "events",
    event.id,
    allDayEvent(title, date),
    targetFor(wholeFamily, who),
  );

  revalidatePath("/planner");
  redirect("/planner?seg=events");
}

export async function updateEventAction(eventId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = clamp(String(formData.get("title") ?? ""), 150);
  const date = String(formData.get("date") ?? "");
  const kind = String(formData.get("kind") ?? "other");
  const subNote = clamp(String(formData.get("sub_note") ?? ""), 200) || null;
  const recursYearly = kind === "birthday" || kind === "anniversary";
  // Travel is a kind of event rather than its own table, and the only thing
  // it really needs that the others do not is a second date.
  const endDate = String(formData.get("end_date") ?? "") || null;
  const budgetRaw = String(formData.get("budget_amount") ?? "").trim();
  const budget = budgetRaw ? Number(budgetRaw) : null;
  const wholeFamily = formData.get("whole_family") === "on";
  const who = formData.getAll("who").map(String).filter(Boolean);
  if (!title || !date) return { error: "Title and date are required." };
  if (!wholeFamily && who.length === 0) return { error: "Choose who this is for, or mark it for the whole family." };
  if (endDate && endDate < date) return { error: "The end date is before the start date." };
  if (budget !== null && !(budget >= 0)) return { error: "The budget has to be a number." };

  const { error, count } = await supabase
    .from("events")
    .update(
      { title, event_date: date, end_date: endDate, budget_amount: budget, kind, sub_note: subNote, recurs_yearly: recursYearly, applies_to_whole_family: wholeFamily },
      { count: "exact" },
    )
    .eq("id", eventId)
    .eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };
  if (count === 0) return { error: "That occasion is no longer there — someone may have removed it." };

  const eventWho = await saveEventMembers(eventId, wholeFamily ? [] : who);
  if (eventWho) return { error: eventWho };
  await syncRowToCalendars(
    me.family_id,
    "events",
    eventId,
    allDayEvent(title, date),
    targetFor(wholeFamily, who),
  );

  revalidatePath("/planner");
  redirect("/planner?seg=events");
}

export async function deleteEventAction(eventId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  await removeRowFromCalendars(me.family_id, "events", eventId);
  const { error } = await supabase.from("events").delete().eq("id", eventId).eq("family_id", me.family_id);
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/planner");
  return { error: null };
}

export async function addActivityToJournalAction(activityId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: activity } = await supabase.from("activities").select("*").eq("id", activityId).eq("family_id", me.family_id).single();
  if (!activity) return { error: "That activity is no longer there." };

  const { error } = await supabase.from("journal_entries").insert({
    family_id: me.family_id,
    entry_date: familyDay(new Date(activity.start_at)),
    title: activity.title,
    note: activity.notes,
    source: "from_plan",
    source_activity_id: activity.id,
    created_by: me.id,
  });
  if (error) return { error: humanDatabaseError(error.message) };

  revalidatePath("/journal");
  revalidatePath("/planner");
  return { error: null };
}
