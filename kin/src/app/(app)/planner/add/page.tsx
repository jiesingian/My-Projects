import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers } from "@/lib/queries/family";
import { AddPlannerForm } from "./add-planner-form";

export default async function AddPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { type } = await searchParams;
  const members = await getMembers(me.family_id);

  return <AddPlannerForm members={members} defaultType={type ?? "activity"} />;
}
