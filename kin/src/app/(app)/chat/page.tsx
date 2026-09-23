import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getChatMembers, getChatThread, getChatPin } from "@/lib/queries/chat";
import { ChatThread } from "@/components/chat-thread";
import { shortNames } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const [members, thread, pin] = await Promise.all([getChatMembers(me.family_id), getChatThread(me.family_id), getChatPin(me.family_id)]);
  // Two people in one house can share a first name; the tag has to tell them
  // apart, and the same label is what the message text carries.
  const labels = shortNames(members.map((m) => m.name));
  const labelled = members.map((m, i) => ({ ...m, label: labels[i] }));

  return (
    <div className="kin-chatcolumn" style={{ padding: "1.125rem 1.375rem 0.5rem" }}>
      <div style={{ marginBottom: "0.375rem" }}>
        <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: "0.3125rem" }}>
          FAMILY CHAT
        </div>
        <h2 style={{ fontSize: "1.5rem", margin: 0 }}>{me.families.name}</h2>
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "4px 0 0" }}>
          {members.length} {members.length === 1 ? "person" : "people"} · everyone sees everything here
        </p>
      </div>

      <ChatThread me={me.id} familyId={me.family_id} members={labelled} initial={thread} pin={pin} />
    </div>
  );
}
