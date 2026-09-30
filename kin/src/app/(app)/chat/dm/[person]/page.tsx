import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getDirectThread, getThreadPrefs, pairOf } from "@/lib/queries/chat-rooms";
import { ThreadMenu } from "@/components/thread-menu";
import { RoomThread } from "@/components/room-thread";
import { Avatar } from "@/components/avatar";
import { initials } from "@/lib/format";

export const dynamic = "force-dynamic";

/** A conversation with one person you are connected with (20260929090000).
 * Only the two of you can read it. */
export default async function DirectThreadPage({ params }: { params: Promise<{ person: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { person } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(person) || person === me.person_id) notFound();
  const [thread, prefs] = await Promise.all([getDirectThread(me.person_id, person), getThreadPrefs()]);
  const pref = prefs.get(`dm:${person}`);
  if (!thread) notFound();
  const [low, high] = pairOf(me.person_id, person);
  const first = thread.peer.fullName.split(" ")[0];

  return (
    <div className="kin-chatcolumn" style={{ padding: "1.125rem var(--gutter) 0.5rem" }}>
      <Link href="/chat" className="kin-chat-back">
        <span aria-hidden="true">‹</span> CHATS
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <Avatar url={thread.peer.avatarUrl} initials={initials(thread.peer.fullName)} label={thread.peer.fullName} size={44} clickable={false} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: "1.375rem", margin: 0 }}>{thread.peer.fullName}</h2>
          <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "2px 0 0" }}>
            {thread.peer.householdName ? `${thread.peer.householdName} · ` : ""}just the two of you
          </p>
        </div>
        <ThreadMenu thread={`dm:${person}`} muted={pref?.muted ?? false} pinned={pref?.pinned ?? false} mutedUntil={pref?.mutedUntil ?? null} />
      </div>
      <RoomThread
        me={{ personId: me.person_id, firstName: me.full_name.split(" ")[0] }}
        saveFrom={thread.peer.fullName}
        room={{ kind: "dm", personId: person, low, high }}
        messages={thread.messages}
        topic={`dm:${low}:${high}`}
        placeholder={thread.peer.connected ? `Message ${first}…` : "Not connected"}
        emptyText={`Nothing said yet. Say hello to ${first}.`}
        canWrite={thread.peer.connected}
        seenAt={thread.seenAt}
      />
    </div>
  );
}
