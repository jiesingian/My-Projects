import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { getAccounts } from "@/lib/queries/wealth";
import { createClient } from "@/lib/supabase/server";
import { toISODate } from "@/lib/routines";
import { RoutineForm, type EditRoutine } from "./routine-form";

export default async function RoutinePage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await searchParams;

  const [members, accounts] = await Promise.all([getMembers(me.family_id), getAccounts(me.family_id)]);
  const activeMembers = members
    .filter((m) => m.status !== "pending" && m.status !== "removed")
    .map((m) => ({ id: m.id, full_name: m.full_name }));

  let edit: EditRoutine | null = null;
  if (id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("routines")
      .select("*, routine_members(member_id, position)")
      .eq("id", id)
      .eq("family_id", me.family_id)
      .maybeSingle();
    if (data) {
      edit = {
        ...data,
        memberIds: (data.routine_members ?? [])
          .slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((rm) => rm.member_id),
      };
    }
  }

  return (
    <RoutineForm
      members={activeMembers}
      accounts={accounts
        .filter((a) => a.is_joint || a.owner_member_id === me.id)
        .map((a) => ({ id: a.id, name: a.name, institution: a.institution }))}
      edit={edit}
      today={toISODate(new Date())}
    />
  );
}
