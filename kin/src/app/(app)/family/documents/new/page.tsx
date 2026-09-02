import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { createClient } from "@/lib/supabase/server";
import { NewDocForm } from "./new-doc-form";

export default async function NewDocPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { folder } = await searchParams;

  const supabase = await createClient();
  const [{ data: folders }, members] = await Promise.all([
    supabase.from("doc_folders").select("*").eq("family_id", me.family_id).order("name"),
    getMembers(me.family_id),
  ]);

  return <NewDocForm folders={folders ?? []} members={members} defaultFolderId={folder} />;
}
