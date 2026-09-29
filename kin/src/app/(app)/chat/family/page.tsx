import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getFamilyRoom, getThreadPrefs } from "@/lib/queries/chat-rooms";
import { ThreadMenu } from "@/components/thread-menu";
import { RoomThread } from "@/components/room-thread";

export const dynamic = "force-dynamic";

/** Everyone in the family tree in one room: this household and every
 * household linked with it (20260929090000). */
export default async function FamilyRoomPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const [{ messages, households }, prefs] = await Promise.all([getFamilyRoom(me), getThreadPrefs()]);
  const pref = prefs.get("family");

  const reach =
    households.length === 0
      ? "Just your household until you link with another one."
      : `Your household and ${households.slice(0, 3).join(", ")}${households.length > 3 ? ` and ${households.length - 3} more` : ""}.`;

  return (
    <div className="kin-chatcolumn" style={{ padding: "1.125rem var(--gutter) 0.5rem" }}>
      <Link href="/chat" className="kin-chat-back">
        <span aria-hidden="true">‹</span> CHATS · FAMILY
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", margin: 0, flex: 1 }}>Family</h2>
        <ThreadMenu thread="family" muted={pref?.muted ?? false} pinned={pref?.pinned ?? false} mutedUntil={pref?.mutedUntil ?? null} />
      </div>
      <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "4px 0 0.75rem", lineHeight: 1.45 }}>
        {reach} Everyone in those households can read and write here.
      </p>
      <RoomThread
        saveFrom="the Family chat"
        room={{ kind: "family" }}
        messages={messages}
        topic={`family-tree:${me.family_id}`}
        placeholder="Message the family…"
        emptyText="Nothing said yet. Say hello to the whole family."
      />
    </div>
  );
}
