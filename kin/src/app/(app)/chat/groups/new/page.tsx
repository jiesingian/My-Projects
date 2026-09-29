import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { GroupCreateForm } from "@/components/group-create-form";
import { getGroupCandidates } from "@/lib/queries/chat-rooms";

export const dynamic = "force-dynamic";

/** A new group chat or announcement channel (20260929162000). Only your
 * connections and people in your family can be added. */
export default async function NewGroupPage({ searchParams }: { searchParams: Promise<{ announce?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { announce } = await searchParams;
  const people = await getGroupCandidates();
  return (
    <div>
      <DetailHeader backHref="/chat" eyebrow="Chat" trail={[{ label: "Chat", href: "/chat" }, { label: announce ? "New channel" : "New group" }]} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.875rem" }}>{announce ? "New announcement channel" : "New group"}</h2>
        <GroupCreateForm people={people} announce={announce === "1"} />
      </div>
    </div>
  );
}
