import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getSavedMessages } from "@/lib/queries/chat-rooms";
import { SavedThread } from "@/components/saved-thread";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

/** Saved messages (20261006100200): a private note-to-self conversation. */
export default async function SavedMessagesPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const messages = await getSavedMessages(me.person_id);

  return (
    <div className="kin-chatcolumn" style={{ padding: "1.125rem var(--gutter) 0.5rem" }}>
      <Link href="/chat" className="kin-chat-back">
        <span aria-hidden="true">‹</span> CHATS
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <span className="kin-forward-icon" style={{ width: 44, height: 44 }} aria-hidden="true">
          <Icon name="fileText" size="1.25rem" />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: "1.375rem", margin: 0 }}>Saved messages</h2>
          <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "2px 0 0" }}>Only you can see this</p>
        </div>
      </div>
      <SavedThread messages={messages} />
    </div>
  );
}
