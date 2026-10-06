import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getGroupRoom, getThreadPrefs } from "@/lib/queries/chat-rooms";
import { RoomThread } from "@/components/room-thread";
import { ThreadMenu } from "@/components/thread-menu";

export const dynamic = "force-dynamic";

/** A group chat or announcement channel (20260929162000). Only its members
 * can open it. */
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [room, prefs] = await Promise.all([getGroupRoom(me.person_id, id), getThreadPrefs()]);
  if (!room) notFound();
  const pref = prefs.get(`group:${id}`);
  const names = room.members.map((m) => (m.personId === me.person_id ? "You" : m.fullName.split(" ")[0]));

  return (
    <div className="kin-chatcolumn" style={{ padding: "1.125rem var(--gutter) 0.5rem" }}>
      <Link href="/chat" className="kin-chat-back">
        <span aria-hidden="true">‹</span> CHATS · {room.group.announceOnly ? "CHANNEL" : "GROUP"}
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <h2 style={{ fontSize: "1.5rem", margin: 0, flex: 1, minWidth: 0 }}>
          {room.group.announceOnly && <span aria-hidden="true">📣 </span>}
          {room.group.name}
        </h2>
        <ThreadMenu thread={`group:${id}`} muted={pref?.muted ?? false} pinned={pref?.pinned ?? false} mutedUntil={pref?.mutedUntil ?? null} />
      </div>
      <Link href={`/chat/groups/${id}/members`} style={{ display: "block", fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "4px 0 0.75rem", textDecoration: "none", lineHeight: 1.45 }}>
        {names.slice(0, 6).join(", ")}
        {names.length > 6 ? ` and ${names.length - 6} more` : ""} · <span style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>Members</span>
      </Link>
      <RoomThread
        me={{ personId: me.person_id, firstName: me.full_name.split(" ")[0] }}
        seenBy={room.seenBy}
        mentionable={room.members.map((m) => ({ personId: m.personId, firstName: m.fullName.split(" ")[0] }))}
        saveFrom={room.group.name}
        room={{ kind: "group", groupId: id, isAdmin: room.isAdmin }}
        messages={room.messages}
        topic={`group:${id}`}
        placeholder={`Message ${room.group.name}…`}
        emptyText={room.group.announceOnly ? "No announcements yet." : "Nothing said yet. Say hello."}
        canWrite={room.canPost}
        canReact
        readOnlyNote="Only this channel's admins post here. You can react to anything."
      />
    </div>
  );
}
