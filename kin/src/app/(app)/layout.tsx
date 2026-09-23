import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { TabBar } from "@/components/tab-bar";
import { AssistantFab } from "@/components/assistant-fab";
import { ConfirmSheetHost } from "@/components/confirm-sheet";
import { Toaster } from "@/components/toast";
import { getChatUnread } from "@/lib/queries/chat";

/** Default is absent on purpose: it means "whatever the browser says", which
 * is what the stylesheet already assumes, so it renders no override at all. */
const ROOT_TEXT_SIZE = { small: "87.5%", large: "112.5%" } as const;

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
      {/* The text size preference. It has been saving to members.text_size
          and being read back only to light up the right segment on the
          settings page -- nothing applied it, so the control looked like it
          worked and did nothing, which is the exact shape of bug the
          DidNotSave note in settings-controls.tsx was written about.

          A percentage on :root multiplies the browser's own text size rather
          than replacing it, so somebody who has already turned their phone's
          text up and then picks Large gets both. It is served from the
          member row rather than a cookie -- unlike the theme, which is a
          cookie and therefore reverts to system on a new device -- and
          hoisted into <head> by precedence, so it lands before first paint
          and nothing flashes at the old size. */}
      {ROOT_TEXT_SIZE[member.text_size as keyof typeof ROOT_TEXT_SIZE] && (
        <style href="kin-text-size" precedence="high">
          {`:root{font-size:${ROOT_TEXT_SIZE[member.text_size as keyof typeof ROOT_TEXT_SIZE]}}`}
        </style>
      )}
      {/* Clears the fixed navigation so the last row of any page stays
          reachable — below it on a phone, beside it on a desktop. Both live
          in CSS rather than here, because an inline style cannot answer a
          media query and this has to change shape at 1024px. */}
      <div className="kin-content">{children}</div>
      <AssistantFab memberName={member.full_name.split(" ")[0]} />
      <TabBar chatUnread={unread.count} chatMentioned={unread.mentioned} />
      <ConfirmSheetHost />
      <Toaster />
    </div>
  );
}
