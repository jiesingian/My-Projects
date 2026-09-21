import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { createClient } from "@/lib/supabase/server";
import { AddPlannerForm } from "./add-planner-form";

export default async function AddPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string; date?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { type: rawType, id, date } = await searchParams;
  // "activity" was the old name for what is now a one-off task. Links out in
  // the wild -- a bookmark, a Google Calendar description, a chat message --
  // still carry it, and they should keep working.
  const type = rawType === "activity" ? "task" : rawType;
  const members = await getMembers(me.family_id);

  let editActivity = null;
  let editEvent = null;
  let editTrip = null;
  if (id && type === "task") {
    const supabase = await createClient();
    const { data } = await supabase.from("activities").select("*, activity_members(member_id)").eq("id", id).eq("family_id", me.family_id).maybeSingle();
    if (data) editActivity = { ...data, who: (data.activity_members ?? []).map((m) => m.member_id) };
  } else if (id && type === "event") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("events")
      .select("*, event_members(member_id)")
      .eq("id", id)
      .eq("family_id", me.family_id)
      .maybeSingle();
    if (data) editEvent = { ...data, memberIds: (data.event_members ?? []).map((em) => em.member_id) };
  } else if (id && type === "trip") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("trips")
      .select("*, trip_travellers(member_id)")
      .eq("id", id)
      .eq("family_id", me.family_id)
      .maybeSingle();
    if (data) editTrip = { ...data, travellerIds: (data.trip_travellers ?? []).map((tt) => tt.member_id) };
  }

  return (
    <AddPlannerForm
      members={members}
      defaultType={type ?? "task"}
      defaultDate={date}
      editActivity={editActivity}
      editEvent={editEvent}
      editTrip={editTrip}
    />
  );
}
