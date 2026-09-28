import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { NewEntryForm } from "../../new/new-entry-form";

/** A milestone is a journal entry with the ★ (since 29 September), so adding
 * one is the entry form with the mark already on: it can have its photos and
 * its story like any other day. */
export default async function NewMilestonePage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const members = await getMembers(me.family_id);
  return <NewEntryForm members={members} defaultMilestone />;
}
