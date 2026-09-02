import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { NewEntryForm } from "./new-entry-form";

export default async function NewJournalEntryPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const members = await getMembers(me.family_id);
  return <NewEntryForm members={members} />;
}
