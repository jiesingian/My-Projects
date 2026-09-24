import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { NewEntryForm } from "./new-entry-form";

export default async function NewJournalEntryPage({ searchParams }: { searchParams: Promise<{ title?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const members = await getMembers(me.family_id);
  // A title can arrive from This week's question. Trimmed to the field's own
  // limit here: it came in a URL.
  const { title } = await searchParams;
  return <NewEntryForm members={members} defaultTitle={title?.slice(0, 150)} />;
}
