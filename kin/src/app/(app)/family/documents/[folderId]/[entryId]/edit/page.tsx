import { redirect, notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { createClient } from "@/lib/supabase/server";
import { EditDocForm } from "./edit-doc-form";

export default async function EditDocPage({ params }: { params: Promise<{ folderId: string; entryId: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { folderId, entryId } = await params;

  const supabase = await createClient();
  const [{ data: entry }, members] = await Promise.all([
    supabase.from("doc_entries").select("*").eq("id", entryId).eq("folder_id", folderId).eq("family_id", me.family_id).maybeSingle(),
    getMembers(me.family_id),
  ]);
  if (!entry) notFound();

  return <EditDocForm entry={entry} folderId={folderId} members={members} myRole={me.role} />;
}
