import { redirect } from "next/navigation";
import { keepKidViewOut } from "@/lib/kid-view";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NewHealthEntryForm } from "./new-health-entry-form";
import { readAccess } from "@/lib/access";
import { PlusNote } from "@/components/plus";

export default async function NewHealthEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: member }, { data: conditions }, { data: omron }] = await Promise.all([
    supabase.from("members").select("*").eq("id", id).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("health_conditions").select("id, name").eq("member_id", id),
    supabase.from("omron_links").select("connected").eq("member_id", id).maybeSingle(),
  ]);
  if (!member) redirect("/family?seg=profile");

  const form = <NewHealthEntryForm member={member} conditions={conditions ?? []} omronConnected={!!omron?.connected} myRole={me.role} />;
  if (readAccess(me.families).plus) return form;
  // Visits, conditions, vaccinations and the emergency card stay free.
  return (
    <>
      <div style={{ padding: "0.75rem var(--gutter) 0" }}>
        <PlusNote area="Vitals, medicines and the illness log" detail="Visits, conditions, vaccinations and the emergency card stay free. Adding vitals, a medicine or an illness needs Plus." />
      </div>
      {form}
    </>
  );
}
