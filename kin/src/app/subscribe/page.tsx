import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { SubscribeScreen } from "./subscribe-screen";

/** Sits outside the (app) group on purpose: the layout in there sends lapsed
 * households here, and a paywall inside the thing it is walling off would
 * redirect to itself forever. */
export default async function SubscribePage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");

  const access = readAccess(member.families);

  return (
    <SubscribeScreen
      householdName={member.families.name}
      isOrganiser={member.is_organiser}
      status={access.status}
      daysLeft={access.daysLeft}
      allowed={access.allowed}
    />
  );
}
