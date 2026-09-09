import { redirect, notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { getEntry } from "@/lib/queries/journal";
import { EditEntryForm } from "./edit-entry-form";

export default async function EditJournalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const { id } = await params;
  const [entry, members] = await Promise.all([getEntry(me.family_id, id), getMembers(me.family_id)]);
  if (!entry) notFound();

  return <EditEntryForm entry={entry} members={members} />;
}
