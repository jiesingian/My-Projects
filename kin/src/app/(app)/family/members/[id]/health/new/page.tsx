import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { NewHealthEntryForm } from "./new-health-entry-form";

export default async function NewHealthEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  return <NewHealthEntryForm member={member} conditions={conditions ?? []} omronConnected={!!omron?.connected} />;
}
