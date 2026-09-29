import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { GroupMembers } from "@/components/group-members";
import { getGroupCandidates, getGroupRoom } from "@/lib/queries/chat-rooms";

export const dynamic = "force-dynamic";

export default async function GroupMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [room, candidates] = await Promise.all([getGroupRoom(me.person_id, id), getGroupCandidates()]);
  if (!room) notFound();
  return (
    <div>
      <DetailHeader backHref={`/chat/groups/${id}`} eyebrow="Chat" trail={[{ label: "Chat", href: "/chat" }, { label: room.group.name, href: `/chat/groups/${id}` }, { label: "Members" }]} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.875rem" }}>{room.group.name}</h2>
        <GroupMembers group={room.group} members={room.members} me={me.person_id} isAdmin={room.isAdmin} candidates={candidates} />
      </div>
    </div>
  );
}
