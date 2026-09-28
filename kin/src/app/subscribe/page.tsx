import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { paletteCss } from "@/lib/palettes";
import { SubscribeScreen } from "./subscribe-screen";

/** The plan screen: Kin Free beside Kin Plus, where the household stands, and
 * (for the organizer) how to get Plus. It used to be the paywall a lapsed
 * household was sent to; since 28 September nobody is sent here -- Settings,
 * the trial banner and the Plus notes link to it. It stays outside the (app)
 * group, where it has always been. */
export default async function SubscribePage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");

  const access = readAccess(member.families);

  return (
    <>
      {/* Outside the (app) layout, so the member's theme is applied here. */}
      <style>{paletteCss(member.palette)}</style>
      <SubscribeScreen
        householdName={member.families.name}
        isOrganiser={member.is_organiser}
        status={access.status}
        plan={access.plan}
        trialing={access.trialing}
        daysLeft={access.daysLeft}
      />
    </>
  );
}
