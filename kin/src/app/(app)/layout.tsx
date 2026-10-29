import { PushKeepAlive } from "@/components/push-opt-in";
import { DoseAlarmListener } from "@/components/dose-alarm";
import { NativeAlarmSync } from "@/components/native-alarm-sync";
import { NativePush } from "@/components/native-push";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { HouseholdZoneProvider } from "@/components/household-zone";
import { HouseholdCurrencyProvider } from "@/components/household-currency";
import { TabBar } from "@/components/tab-bar";
import { inKidView } from "@/lib/kid-view";
import { kinAiReady } from "@/lib/kin-ai";
import { AssistantFab } from "@/components/assistant-fab";
import { ConfirmSheetHost } from "@/components/confirm-sheet";
import { Toaster } from "@/components/toast";
import { ReturnToToday } from "@/components/return-to-today";
import { getThreadPrefs } from "@/lib/queries/chat-rooms";
import { cookies } from "next/headers";
import { ConnectLinkReminder } from "@/components/connect-link-reminder";
import { getChatUnread } from "@/lib/queries/chat";
import { textScaleCss } from "@/lib/text-scale";
import { paletteCss } from "@/lib/palettes";
import { CallProvider, type CallMember } from "@/components/call-provider";
import { createClient } from "@/lib/supabase/server";
import { OfflineSync } from "@/components/offline-sync";
import { DynamicType } from "@/components/dynamic-type";
import { inSimpleMode } from "@/lib/simple-mode";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { PageHeading } from "@/components/page-heading";

export default async function AppLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const member = await getCurrentMember();
  if (!member) redirect("/onboarding/profile");
  if (member.status === "pending") redirect("/onboarding/pending");
  // Removed by their household: nothing here is theirs to see any more, but
  // their personal space is, and they can take it to a household of their own.
  if (member.status === "removed") redirect("/onboarding/removed");

  // No paywall here any more. A household whose Kin Plus trial has ended is
  // on Kin Free, never locked out of its own records; the Plus areas say so
  // where they are, and the database refuses new entries in them
  // (20260928150000_kin_free_and_plus.sql).

  const supabase = await createClient();
  const [unread, { data: people }, { data: elsewhere }, prefs] = await Promise.all([
    getChatUnread(member.family_id, member.id),
    // Who a call can reach, for the call screen's names and faces. Only a
    // member with a login of their own has a Kin to ring.
    supabase.from("members").select("id, full_name, avatar_url, status").eq("family_id", member.family_id).in("status", ["active", "managed"]).order("created_at"),
    // The family room and one-to-one conversations
    // (20260929090000) -- so the Chat tab's badge counts every one of them.
    supabase.rpc("my_chat_unread"),
    // Muted conversations stay out of the badge, as on a phone.
    getThreadPrefs(),
  ]);
  const mutedNow = new Set([...prefs].filter(([, p]) => p.muted).map(([thread]) => thread));
  const chatUnread =
    (mutedNow.has("household") ? 0 : unread.count) +
    (elsewhere ?? []).filter((r) => !mutedNow.has(r.thread)).reduce((n, r) => n + (Number(r.unread) || 0), 0);
  // Joined through someone's connection link and not asked yet (app/connect).
  const rawConnect = (await cookies()).get("kin-connect")?.value ?? "";
  const connectCode = /^[A-Z2-9]{8}$/.test(rawConnect) ? rawConnect : null;
  const callMembers: CallMember[] = (people ?? []).map((m) => ({ id: m.id, name: m.full_name, photoUrl: m.avatar_url, callable: m.status === "active" }));

  return (
    // Simple Kin (lib/simple-mode): bigger tap targets everywhere, from one
    // class on the shell (globals.css, "Simple Kin").
    <div className={inSimpleMode(member) ? "kin-shell kin-simple" : "kin-shell"}>
      <PushKeepAlive />
      <DoseAlarmListener />
      {/* Inside the Kin iPhone app only: real alarms (lib/alarms.ts). */}
      <NativeAlarmSync />
      <NativePush />
      {/* The member's text size, and the three layout switches that have to
          answer it -- see text-scale.ts for why they are generated rather than
          written in globals.css.

          A plain <style>, not a hoisted one. The first version gave it an href
          and a precedence so React would lift it into <head>, and React treats
          a hoisted style as a resource keyed by that href: inserted once and
          never updated. Changing the setting re-rendered the layout and the
          old size stayed on screen until a full reload. */}
      <style>{textScaleCss(member.text_scale)}</style>
      {/* The phone's own text size, on an iPhone set larger than this. */}
      <DynamicType scale={member.text_scale} />
      {/* The member's colour theme (palettes.ts). Empty for Kin Classic. */}
      <style>{paletteCss(member.palette)}</style>
      {/* Clears the fixed navigation so the last row of any page stays
          reachable — below it on a phone, beside it on a desktop. Both live
          in CSS rather than here, because an inline style cannot answer a
          media query and this has to change shape at 1024px. */}
      {/* The household's time zone for client components (household-zone). */}
      <HouseholdZoneProvider zone={member.families.time_zone}>
      {/* The household's currency for client components (household-currency). */}
      <HouseholdCurrencyProvider currency={member.families.currency}>
      <CallProvider familyId={member.family_id} me={member.id} members={callMembers}>
        <main className="kin-content">
          <PageHeading />
          {connectCode && <ConnectLinkReminder code={connectCode} />}
          {children}
        </main>
        {/* An add page opened from inside the app, as a sheet over the page
            it was opened from (@modal, route-sheet.tsx). Empty otherwise. */}
        {modal}
        {!inKidView(member) && <AssistantFab memberName={member.full_name.split(" ")[0]} aiReady={kinAiReady()} />}
        <TabBar chatUnread={chatUnread} chatMentioned={unread.mentioned} kidView={inKidView(member)} />
        <ConfirmSheetHost />
        <Toaster />
        <ReturnToToday />
        <KeyboardShortcuts
          simple={inSimpleMode(member)}
          ask={!inKidView(member)}
          places={inKidView(member) ? ["/today", "/chat", "/journal", "/family", "/settings"] : ["/today", "/planner", "/chat", "/wealth", "/journal", "/family", "/household", "/settings"]}
        />
        {/* Offline Kin: keeps the phone's copy current, and says so when offline. */}
        <OfflineSync userId={member.auth_user_id ?? ""} />
      </CallProvider>
      </HouseholdCurrencyProvider>
      </HouseholdZoneProvider>
    </div>
  );
}
