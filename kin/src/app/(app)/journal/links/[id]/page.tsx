import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getLinkThread } from "@/lib/queries/family-links";
import { DetailHeader } from "@/components/hub-header";
import { LinkThread } from "@/components/link-thread";

/** A conversation with one linked household -- cousins, an aunt abroad, the
 * other grandparents. Everybody in both houses can read and write here; nobody
 * else can, and it closes if either household unlinks. */
export default async function LinkThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  const thread = await getLinkThread(id, me.family_id, me.id);
  if (!thread) notFound();

  return (
    <div>
      <DetailHeader backHref="/journal?seg=feed" eyebrow="LINKED HOUSEHOLD" />
      <div className="kin-chatcolumn" style={{ padding: "0 1.375rem 0.5rem" }}>
        <h3 style={{ fontSize: "1.5rem", margin: "0 0 0.25rem" }}>{thread.otherFamilyName}</h3>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 0.75rem", lineHeight: 1.45 }}>
          Between your household and theirs. Everyone in both houses can read and write here, and nobody else can.
        </p>
        <LinkThread linkId={id} initial={thread.messages} ourName={me.families.name} theirName={thread.otherFamilyName} />
      </div>
    </div>
  );
}
