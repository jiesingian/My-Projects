import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { createClient } from "@/lib/supabase/server";
import { AddPlannerForm } from "./add-planner-form";
import { getAccounts } from "@/lib/queries/wealth";
import { LogSpendControl } from "@/components/money-actions";
import { inKidView } from "@/lib/kid-view";

export default async function AddPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string; date?: string; title?: string; notes?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { type: rawType, id, date, title, notes } = await searchParams;
  // "activity" was the old name for what is now a one-off task. Links out in
  // the wild -- a bookmark, a Google Calendar description, a chat message --
  // still carry it, and they should keep working.
  const type = rawType === "activity" ? "task" : rawType;
  const members = await getMembers(me.family_id);

  let editActivity = null;
  let editEvent = null;
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
  }

  // A trip's spending is logged from the trip itself now; it used to live on
  // the big trip card at the top of the Planner, which is gone (26 September).
  // Money, so never in kid view (lib/kid-view.ts).
  const isTrip = editEvent?.kind === "travel" && !inKidView(me);
  const pickable = isTrip
    ? (await getAccounts(me.family_id))
        .filter((a) => a.is_joint || a.owner_member_id === me.id)
        .map((a) => ({ id: a.id, name: a.name, institution: a.institution, linked_app_url: a.linked_app_url, balance: a.balance, is_joint: a.is_joint }))
    : [];

  return (
    <>
    <AddPlannerForm
      members={members}
      defaultType={type ?? "task"}
      defaultDate={date}
      editActivity={editActivity}
      editEvent={editEvent}
      // Trimmed to the fields' own limits here rather than trusted: this
      // arrives in a URL, and a URL is something anybody can type.
      prefill={id ? undefined : { title: title?.slice(0, 150), notes: notes?.slice(0, 1000) }}
      householdCurrency={me.families.currency}
    />
    {isTrip && editEvent && (
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <LogSpendControl
          accounts={pickable}
          currency={editEvent.budget_currency ?? me.families.currency}
          particulars={`${editEvent.title} · travel`}
          category="Travel"
          sourceTable="events"
          sourceId={editEvent.id}
          label="Log trip spend"
        />
      </div>
    )}
    </>
  );
}
