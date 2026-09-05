import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getChatMembers, getChatThread } from "@/lib/queries/chat";
import { ChatThread } from "@/components/chat-thread";
import { shortNames } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const [members, thread] = await Promise.all([getChatMembers(me.family_id), getChatThread(me.family_id)]);
  // Two people in one house can share a first name; the tag has to tell them
  // apart, and the same label is what the message text carries.
  const labels = shortNames(members.map((m) => m.name));
  const labelled = members.map((m, i) => ({ ...m, label: labels[i] }));

  return (
    <div style={{ padding: "18px 22px 8px" }}>
      <div style={{ marginBottom: 6 }}>
        <div style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: 5 }}>
          FAMILY CHAT
        </div>
        <h2 style={{ fontSize: 24, margin: 0 }}>{me.families.name}</h2>
        <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "4px 0 0" }}>
          {members.length} {members.length === 1 ? "person" : "people"} · everyone sees everything here
        </p>
      </div>

      <ChatThread me={me.id} members={labelled} initial={thread} />
    </div>
  );
}
