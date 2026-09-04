"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars, removeRowFromCalendars, type CalendarTarget } from "@/lib/actions/calendar-sync";
import type { ActionState } from "@/lib/actions/auth";

function activityTarget(wholeFamily: boolean, who: string[]): CalendarTarget {
  return wholeFamily ? { kind: "all" } : { kind: "members", memberIds: who };
}

export async function createActivityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const from = String(formData.get("from") ?? "09:00");
  const to = String(formData.get("to") ?? "");
  const repeat = String(formData.get("repeat") ?? "once");
  const location = String(formData.get("location") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const wholeFamily = formData.get("whole_family") === "on";
  const who = formData.getAll("who").map(String);

  if (!title || !date) return { error: "Title and date are required." };

  const { data: activity, error } = await supabase
    .from("activities")
    .insert({
      family_id: me.family_id,
      title,
      start_at: new Date(`${date}T${from || "09:00"}`).toISOString(),
      end_at: to ? new Date(`${date}T${to}`).toISOString() : null,
      repeat,
      location,
      notes,
      applies_to_whole_family: wholeFamily,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  if (!wholeFamily && who.length > 0) {
    await supabase.from("activity_members").insert(who.map((memberId) => ({ activity_id: activity.id, member_id: memberId })));
  }

  await syncRowToCalendars(
    me.family_id,
    "activities",
    activity.id,
    { title, startAt: new Date(`${date}T${from || "09:00"}`), endAt: to ? new Date(`${date}T${to}`) : null, location },
    activityTarget(wholeFamily, who),
  );

  revalidatePath("/planner");
  redirect("/planner?seg=calendar");
}

export async function updateActivityAction(activityId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const from = String(formData.get("from") ?? "09:00");
  const to = String(formData.get("to") ?? "");
  const repeat = String(formData.get("repeat") ?? "once");
  const location = String(formData.get("location") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const wholeFamily = formData.get("whole_family") === "on";
  const who = formData.getAll("who").map(String);

  if (!title || !date) return { error: "Title and date are required." };

  const { error } = await supabase
    .from("activities")
    .update({
      title,
      start_at: new Date(`${date}T${from || "09:00"}`).toISOString(),
      end_at: to ? new Date(`${date}T${to}`).toISOString() : null,
      repeat,
      location,
      notes,
      applies_to_whole_family: wholeFamily,
    })
    .eq("id", activityId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };

  await supabase.from("activity_members").delete().eq("activity_id", activityId);
  if (!wholeFamily && who.length > 0) {
    await supabase.from("activity_members").insert(who.map((memberId) => ({ activity_id: activityId, member_id: memberId })));
  }

  await syncRowToCalendars(
    me.family_id,
    "activities",
    activityId,
    { title, startAt: new Date(`${date}T${from || "09:00"}`), endAt: to ? new Date(`${date}T${to}`) : null, location },
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
  if (error) return { error: error.message };

  revalidatePath("/planner");
  return { error: null };
}

/** Replace the people a record concerns. A whole-family record keeps no rows
 * at all: the flag says everyone, and a list beside it could only drift. */
async function saveEventMembers(eventId: string, memberIds: string[]) {
  const supabase = await createClient();
  await supabase.from("event_members").delete().eq("event_id", eventId);
  if (memberIds.length === 0) return;
  await supabase.from("event_members").insert(memberIds.map((member_id) => ({ event_id: eventId, member_id })));
}

async function saveTravellers(tripId: string, memberIds: string[]) {
  const supabase = await createClient();
  await supabase.from("trip_travellers").delete().eq("trip_id", tripId);
  if (memberIds.length === 0) return;
  await supabase.from("trip_travellers").insert(memberIds.map((member_id) => ({ trip_id: tripId, member_id })));
}

/** Who a dated record reaches on Google Calendar: everyone, or just the
 * people named on it. */
function targetFor(wholeFamily: boolean, memberIds: string[]) {
  return wholeFamily || memberIds.length === 0 ? ({ kind: "all" } as const) : ({ kind: "members", memberIds } as const);
}

export async function createEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const kind = String(formData.get("kind") ?? "other");
  const subNote = String(formData.get("sub_note") ?? "").trim() || null;
  const recursYearly = kind === "birthday" || kind === "anniversary";
  const wholeFamily = formData.get("whole_family") === "on";
  const who = formData.getAll("who").map(String).filter(Boolean);
  if (!title || !date) return { error: "Title and date are required." };
  if (!wholeFamily && who.length === 0) return { error: "Choose who this is for, or mark it for the whole family." };

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      family_id: me.family_id,
      title,
      event_date: date,
      kind,
      sub_note: subNote,
      recurs_yearly: recursYearly,
      applies_to_whole_family: wholeFamily,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  await saveEventMembers(event.id, wholeFamily ? [] : who);
  await syncRowToCalendars(
    me.family_id,
    "events",
    event.id,
    { title, startAt: new Date(`${date}T00:00:00`), allDay: true },
    targetFor(wholeFamily, who),
  );

  revalidatePath("/planner");
  redirect("/planner?seg=events");
}

export async function updateEventAction(eventId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const kind = String(formData.get("kind") ?? "other");
  const subNote = String(formData.get("sub_note") ?? "").trim() || null;
  const recursYearly = kind === "birthday" || kind === "anniversary";
  const wholeFamily = formData.get("whole_family") === "on";
  const who = formData.getAll("who").map(String).filter(Boolean);
  if (!title || !date) return { error: "Title and date are required." };
  if (!wholeFamily && who.length === 0) return { error: "Choose who this is for, or mark it for the whole family." };

  const { error } = await supabase
    .from("events")
    .update({ title, event_date: date, kind, sub_note: subNote, recurs_yearly: recursYearly, applies_to_whole_family: wholeFamily })
    .eq("id", eventId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };

  await saveEventMembers(eventId, wholeFamily ? [] : who);
  await syncRowToCalendars(
    me.family_id,
    "events",
    eventId,
    { title, startAt: new Date(`${date}T00:00:00`), allDay: true },
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
  if (error) return { error: error.message };

  revalidatePath("/planner");
  return { error: null };
}

export async function createTripAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "") || null;
  const budgetAmount = formData.get("budget_amount") ? Number(formData.get("budget_amount")) : null;
  const travellers = formData.getAll("travellers").map(String).filter(Boolean);
  const wholeFamily = formData.get("whole_family") === "on";
  if (!title || !startDate) return { error: "Title and start date are required." };
  if (!wholeFamily && travellers.length === 0) return { error: "Choose who is travelling, or mark it for the whole family." };
  if (endDate && endDate < startDate) return { error: "The trip ends before it starts." };

  const { data: trip, error } = await supabase
    .from("trips")
    .insert({
      family_id: me.family_id,
      title,
      start_date: startDate,
      end_date: endDate,
      budget_amount: budgetAmount,
      applies_to_whole_family: wholeFamily,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: error.message };

  await saveTravellers(trip.id, wholeFamily ? [] : travellers);
  await syncRowToCalendars(
    me.family_id,
    "trips",
    trip.id,
    { title, startAt: new Date(`${startDate}T00:00:00`), endAt: endDate ? new Date(`${endDate}T00:00:00`) : null, allDay: true },
    targetFor(wholeFamily, travellers),
  );

  revalidatePath("/planner");
  redirect("/planner?seg=travel");
}

/** Trips could be created but never changed, so who was going was fixed the
 * moment it was saved. */
export async function updateTripAction(tripId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "") || null;
  const budgetAmount = formData.get("budget_amount") ? Number(formData.get("budget_amount")) : null;
  const travellers = formData.getAll("travellers").map(String).filter(Boolean);
  const wholeFamily = formData.get("whole_family") === "on";
  if (!title || !startDate) return { error: "Title and start date are required." };
  if (!wholeFamily && travellers.length === 0) return { error: "Choose who is travelling, or mark it for the whole family." };
  if (endDate && endDate < startDate) return { error: "The trip ends before it starts." };

  const { error } = await supabase
    .from("trips")
    .update({ title, start_date: startDate, end_date: endDate, budget_amount: budgetAmount, applies_to_whole_family: wholeFamily })
    .eq("id", tripId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message };

  await saveTravellers(tripId, wholeFamily ? [] : travellers);
  await syncRowToCalendars(
    me.family_id,
    "trips",
    tripId,
    { title, startAt: new Date(`${startDate}T00:00:00`), endAt: endDate ? new Date(`${endDate}T00:00:00`) : null, allDay: true },
    targetFor(wholeFamily, travellers),
  );

  revalidatePath("/planner");
  redirect("/planner?seg=travel");
}

export async function deleteTripAction(tripId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  await removeRowFromCalendars(me.family_id, "trips", tripId);
  const { error } = await supabase.from("trips").delete().eq("id", tripId).eq("family_id", me.family_id);
  if (error) return { error: error.message };

  revalidatePath("/planner");
  return { error: null };
}

export async function addActivityToJournalAction(activityId: string) {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: activity } = await supabase.from("activities").select("*").eq("id", activityId).single();
  if (!activity) return;

  await supabase.from("journal_entries").insert({
    family_id: me.family_id,
    entry_date: activity.start_at.slice(0, 10),
    title: activity.title,
    note: activity.notes,
    source: "from_plan",
    source_activity_id: activity.id,
    created_by: me.id,
  });

  revalidatePath("/journal");
  revalidatePath("/planner");
}
