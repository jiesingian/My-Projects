import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { TabBar } from "@/components/tab-bar";
import { AssistantFab } from "@/components/assistant-fab";
import { getChatUnread } from "@/lib/queries/chat";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding/profile");
  if (member.status === "pending") redirect("/onboarding/pending");

  // One check for the whole app, rather than every page remembering to make
  // it. getCurrentMember already loads the family row, so it costs no extra
  // query. /subscribe deliberately sits outside this group — a paywall inside
  // the thing it walls off would redirect to itself.
  if (!readAccess(member.families).allowed) redirect("/subscribe");

  const unread = await getChatUnread(member.family_id, member.id);

  return (
    <div className="kin-shell">
      {/* Clears the fixed navigation so the last row of any page stays
          reachable — below it on a phone, beside it on a desktop. Both live
          in CSS rather than here, because an inline style cannot answer a
          media query and this has to change shape at 1024px. */}
      <div className="kin-content">{children}</div>
      <AssistantFab memberName={member.full_name.split(" ")[0]} />
      <TabBar chatUnread={unread.count} chatMentioned={unread.mentioned} />
    </div>
  );
}
