import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { readAccess } from "@/lib/access";
import { TabBar } from "@/components/tab-bar";
import { inKidView } from "@/lib/kid-view";
import { AssistantFab } from "@/components/assistant-fab";
import { ConfirmSheetHost } from "@/components/confirm-sheet";
import { Toaster } from "@/components/toast";
import { ReturnToToday } from "@/components/return-to-today";
import { getChatUnread } from "@/lib/queries/chat";
import { textScaleCss } from "@/lib/text-scale";
import { paletteCss } from "@/lib/palettes";
import { CallProvider, type CallMember } from "@/components/call-provider";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding/profile");
  if (member.status === "pending") redirect("/onboarding/pending");

  // One check for the whole app, rather than every page remembering to make
  // it. getCurrentMember already loads the family row, so it costs no extra
  // query. /subscribe deliberately sits outside this group — a paywall inside
  // the thing it walls off would redirect to itself.
  if (!readAccess(member.families).allowed) redirect("/subscribe");

  const supabase = await createClient();
  const [unread, { data: people }] = await Promise.all([
    getChatUnread(member.family_id, member.id),
    // Who a call can reach, for the call screen's names and faces. Only a
    // member with a login of their own has a Kin to ring.
    supabase.from("members").select("id, full_name, avatar_url, status").eq("family_id", member.family_id).in("status", ["active", "managed"]).order("created_at"),
  ]);
  const callMembers: CallMember[] = (people ?? []).map((m) => ({ id: m.id, name: m.full_name, photoUrl: m.avatar_url, callable: m.status === "active" }));

  return (
    <div className="kin-shell">
      {/* The member's text size, and the three layout switches that have to
          answer it -- see text-scale.ts for why they are generated rather than
          written in globals.css.

          A plain <style>, not a hoisted one. The first version gave it an href
          and a precedence so React would lift it into <head>, and React treats
          a hoisted style as a resource keyed by that href: inserted once and
          never updated. Changing the setting re-rendered the layout and the
          old size stayed on screen until a full reload. */}
      <style>{textScaleCss(member.text_scale)}</style>
      {/* The member's colour theme (palettes.ts). Empty for Kin Classic. */}
      <style>{paletteCss(member.palette)}</style>
      {/* Clears the fixed navigation so the last row of any page stays
          reachable — below it on a phone, beside it on a desktop. Both live
          in CSS rather than here, because an inline style cannot answer a
          media query and this has to change shape at 1024px. */}
      <CallProvider familyId={member.family_id} me={member.id} members={callMembers}>
        <div className="kin-content">{children}</div>
        {!inKidView(member) && <AssistantFab memberName={member.full_name.split(" ")[0]} />}
        <TabBar chatUnread={unread.count} chatMentioned={unread.mentioned} kidView={inKidView(member)} />
        <ConfirmSheetHost />
        <Toaster />
        <ReturnToToday />
      </CallProvider>
    </div>
  );
}
